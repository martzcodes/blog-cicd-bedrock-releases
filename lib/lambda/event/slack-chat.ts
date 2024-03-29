import { EventBridgeEvent } from "aws-lambda";
import { getSlackClient } from "../common/slackClient";
import { SlackMessageEvent } from "../common/interfaces/SlackMessageEvent";
import { ChatPostMessageArguments, ChatUpdateArguments } from "@slack/web-api";
import { ddbDocClient } from "../common/dynamodb";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";

export const handler = async (event: EventBridgeEvent<string, SlackMessageEvent>) => {
  console.log(JSON.stringify({ event }, null, 2));
  const slackClient = await getSlackClient();
  const detail = event.detail;
  const messageArgs = detail.data.message;
  if (messageArgs.ts) {
    await slackClient.chat.update(messageArgs as ChatUpdateArguments);
  } else {
    const messagePost = await slackClient.chat.postMessage(
      messageArgs as ChatPostMessageArguments
    );
    if (detail.data.storeMessageTs) {
      // store message ts in dynamodb
      const { pk, sk, prop } = detail.data.storeMessageTs;
      // update the dynamodb item
      try {
        const updateArgs = {
          TableName: process.env.BOT_TABLE,
          Key: {
            pk,
            sk,
          },
          UpdateExpression: `set #prop = :prop`,
          ExpressionAttributeNames: {
            "#prop": prop,
          },
          ExpressionAttributeValues: {
            ":prop": messagePost.ts,
          },
        };
        console.log(JSON.stringify({ updateArgs }, null, 2));
        await ddbDocClient.send(new UpdateCommand(updateArgs));
      } catch (e) {
        console.log(e);
      }
    }
  }
};

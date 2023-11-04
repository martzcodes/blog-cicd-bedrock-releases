import { APIGatewayEvent } from "aws-lambda";
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { nextEnvs } from "../common/nextEnvs";
import { getSlackClient } from "../common/slackClient";
import { EventDetailTypes } from "../common/event-detail-types";
import { putEvent } from "../common/put-events";
import { ddbDocClient } from "../common/dynamodb";
import { eb } from "../common/eventbridge";

export const handler = async (event: APIGatewayEvent) => {
  const decodedString = decodeURIComponent(event.body!);
  const jsonString = decodedString.replace("payload=", "");
  const jsonObject = JSON.parse(jsonString);
  console.log(JSON.stringify({ jsonObject }, null, 2));
  const message = jsonObject.message;
  const approved = jsonObject.actions[0].value === "approved";
  const repo = jsonObject.message.text.split("+deployment+to+")[0];
  const env = jsonObject.message.text
    .split("+deployment+to+")[1]
    .split("+by+")[0];
  const authority = jsonObject.user.name;
  const slackClient = await getSlackClient();

  const slackAuthority = await slackClient.users.profile.get({
    user: jsonObject.user.id,
  });
  const userImg = slackAuthority.profile?.image_24;
  message.blocks = message.blocks.filter((msg: any) => msg.type !== "actions");
  message.blocks[0].text.text = message.blocks[0].text.text.replace(/\+/g, " ");
  const contextBlock = {
    type: "context",
    elements: [
      {
        type: "image",
        image_url: userImg,
        alt_text: authority,
      },
      {
        type: "mrkdwn",
        text: `thinks we should *${
          approved ? "approve" : "reject"
        }* this deployment`,
      },
    ],
  };
  message.blocks.push(contextBlock);

  const pk = `REPO#${repo}#ENV#${env}`.toUpperCase();
  const sk = "LATEST";

  // get deployment status from dynamodb
  const ddbRes = await ddbDocClient.send(
    new GetCommand({
      TableName: process.env.BOT_TABLE,
      Key: {
        pk,
        sk,
      },
    })
  );
  const existingItem = ddbRes.Item;
  if (!existingItem) {
    return {
      statusCode: 404,
    };
  }
  if (
    Object.keys(existingItem).includes("approved") &&
    Object.keys(existingItem).includes("rejected")
  ) {
    return {
      statusCode: 400,
    };
  }

  // remove accessories from blocks
  message.blocks = message.blocks.map((block: any) => {
    if (block.accessory) {
      delete block.accessory;
    }
    return block;
  });
  message.blocks.push({
    type: "context",
    elements: [
      {
        type: "plain_text",
        emoji: true,
        text: `${approved ? "Approved" : "Rejected"} by ${authority}`,
      },
    ],
  });
  // remove current approvers from message
  message.blocks = message.blocks.filter(
    (block: any) =>
      !(
        block.type === "context" &&
        `${block.elements[0].text}`.toLowerCase().includes("approver")
      )
  );
  try {
    await ddbDocClient.send(
      new PutCommand({
        TableName: process.env.BOT_TABLE,
        Item: existingItem,
      })
    );
    if (approved) {
      await putEvent({
        detail: JSON.stringify({
          sha: existingItem.sha,
          repo,
          owner: existingItem.owner,
          nextEnv: nextEnvs[env],
        }),
        detailType: EventDetailTypes.DEPLOY_WITH_GITHUB,
        eb,
      });
    }
  } catch (e) {
    console.log(JSON.stringify({ e }, null, 2));
  }

  await putEvent({
    detail: JSON.stringify({
      message: {
        channel: process.env.SLACK_CHANNEL,
        ts: jsonObject.message.ts,
        blocks: message.blocks,
      },
    }).replace(/\+/g, " "),
    detailType: EventDetailTypes.SLACK_CHAT,
    eb,
  });

  return {
    statusCode: 200,
  };
};

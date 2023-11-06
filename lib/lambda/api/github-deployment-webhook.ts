import { APIGatewayEvent } from "aws-lambda";
import { GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { nextEnvs } from "../common/nextEnvs";
import { EventDetailTypes } from "../common/event-detail-types";
import { putEvent } from "../common/put-events";
import { deploymentMessage } from "../common/deployment-message";
import { ddbDocClient } from "../common/dynamodb";
import { eb } from "../common/eventbridge";

export const handler = async (event: APIGatewayEvent) => {
  const body = JSON.parse(event.body || "{}");
  console.log(JSON.stringify({ body }, null, 2));
  if (body.sender.type !== "User") {
    // there are also "Bot" sender types which ends up leading to duplicate events
    return {
      statusCode: 200,
    };
  }
  if (!["Deploy", "deploy-to-env"].includes(body?.workflow?.name)) {
    return {
      statusCode: 200,
    };
  }
  const {
    state: status,
    environment: env,
    created_at: createdAt,
    updated_at: updatedAt,
    target_url: url,
  } = body.deployment_status;
  const { id: deploymentId, ref: branch, sha } = body.deployment;
  const repo = body.repository.name;
  const author = body.deployment_status.creator.login;
  const owner = body.repository.owner.login;
  const pk = `REPO#${repo}#ENV#${env}`.toUpperCase();
  const sk = "LATEST";

  console.log(pk);

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
  let existingItem = ddbRes.Item;
  console.log(JSON.stringify({ existingItem }, null, 2));
  if (existingItem && existingItem?.deploymentId !== deploymentId) {
    // update last slack message to remove approve/reject buttons
    const oldBlocks = JSON.parse(existingItem.blocks);
    const approveBlock = oldBlocks.findIndex(
      (block: any) =>
        Object.keys(block).includes("accessory") &&
        block.accessory.value === "approved"
    );
    // remove items from oldBlocks after approveBlock
    oldBlocks.splice(approveBlock, oldBlocks.length - approveBlock);
    oldBlocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Automatic rejection by subsequent deployment`,
        },
      ],
    });
    if (existingItem.slackTs) {
      await putEvent({
        detail: JSON.stringify({
          message: {
            channel: process.env.SLACK_CHANNEL,
            ts: existingItem.slackTs,
            blocks: oldBlocks,
          },
        }),
        detailType: EventDetailTypes.SLACK_CHAT,
        eb,
      });
    }
    // save old version to history
    await ddbDocClient.send(
      new PutCommand({
        TableName: process.env.BOT_TABLE,
        Item: {
          ...existingItem,
          sk: `DEPLOYMENT#${existingItem.deploymentId}`.toUpperCase(),
          blocks: JSON.stringify(oldBlocks),
          ttl: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 60, // 60 days
        },
      })
    );
    existingItem = {};
  }
  if (existingItem?.status === status) {
    return {
      statusCode: 200,
    };
  }

  const nextEnv = nextEnvs[env];
  const message = JSON.parse(
    deploymentMessage({
      repo,
      env,
      author,
      status,
      owner,
      nextEnv,
      commit: {
        sha,
        branch,
      },
      deployment: {
        url,
        id: deploymentId,
      },
    })
  );
  console.log(JSON.stringify(message, null, 2));

  // send deployment status to slack
  const slackChannel = process.env.SLACK_CHANNEL;

  const item = {
    pk,
    sk,
    author,
    slackChannel,
    status,
    env,
    repo,
    url,
    sha,
    deploymentId,
    createdAt,
    updatedAt,
    branch,
    owner,
    blocks: JSON.stringify(message.blocks),
    ttl: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 60, // 30 days
  };
  console.log(JSON.stringify({ item }, null, 2));
  await ddbDocClient.send(
    new PutCommand({ TableName: process.env.BOT_TABLE, Item: item })
  );

  if (status === "success") {
    const deployedAt = Date.now();
    await putEvent({
      detail: JSON.stringify({
        env,
        repo,
        sha,
        deployedOn: new Date(deployedAt).toISOString(),
      }),
      detailType: EventDetailTypes.TRACK_RELEASE,
      eb,
    });
    const envLatest = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.BOT_TABLE,
        Key: {
          pk: `LATEST`,
          sk: `${env}`,
        },
      })
    );
    const updatedRepo = {
      url: item.url,
      sha: item.sha,
      deploymentId: item.deploymentId,
      deployedAt,
      branch: item.branch,
      owner: item.owner,
    };
    if (!envLatest.Item) {
      await ddbDocClient.send(
        new PutCommand({
          TableName: process.env.BOT_TABLE,
          Item: {
            pk: `LATEST`,
            sk: `${env}`,
            repos: {
              [repo]: updatedRepo,
            },
          },
        })
      );
    } else {
      // Update existingItem by replacing the repo
      await ddbDocClient.send(
        new UpdateCommand({
          TableName: process.env.BOT_TABLE,
          Key: {
            pk: `LATEST`,
            sk: `${env}`,
          },
          // update the repos attribute
          UpdateExpression: "SET repos.#repo = :repo",
          ExpressionAttributeNames: {
            "#repo": repo,
          },
          ExpressionAttributeValues: {
            ":repo": updatedRepo,
          },
        })
      );
    }
  }

  await putEvent({
    detail: JSON.stringify({
      message: {
        channel: slackChannel,
        ...(existingItem?.slackTs ? { ts: existingItem.slackTs } : {}),
        ...message,
      },
      storeMessageTs: {
        pk,
        sk,
        prop: "slackTs",
      },
    }),
    detailType: EventDetailTypes.SLACK_CHAT,
    eb,
  });

  return {
    statusCode: 200,
  };
};

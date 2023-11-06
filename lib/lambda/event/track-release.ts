import { EventBridgeEvent } from "aws-lambda";
import { DeploymentEvent } from "../common/interfaces/DeploymentEvent";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  QueryCommandInput,
  QueryCommandOutput,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { Release } from "../common/interfaces/Release";
import { GitHubCommit } from "../common/interfaces/GitHubCommit";
import { putEvent } from "../common/put-events";
import { EventDetailTypes } from "../common/event-detail-types";
import { ddbDocClient } from "../common/dynamodb";
import { eb } from "../common/eventbridge";
import { prepRelease, summarizeRelease } from "../common/bedrock";
import { nextEnvs } from "../common/nextEnvs";

const archiveLatestRelease = async ({
  ddbDocClient,
  deployment,
}: {
  ddbDocClient: DynamoDBDocumentClient;
  deployment: DeploymentEvent;
}): Promise<Release> => {
  const pk = `RELEASE#${deployment.repo}#${deployment.env}`.toUpperCase();
  // get the test release item from dynamodb
  const release = await ddbDocClient.send(
    new GetCommand({
      TableName: process.env.BOT_TABLE,
      Key: {
        pk,
        sk: "LATEST",
      },
    })
  );
  const releaseItem = (release.Item || { commits: [] }) as Release;
  // re-save latest as releasedOn
  if (release.Item) {
    releaseItem.sk = releaseItem.releasedOn;
    await ddbDocClient.send(
      new PutCommand({
        TableName: process.env.BOT_TABLE,
        Item: {
          ...releaseItem,
          ttl: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30, // 30 days
        },
      })
    );
  }
  return releaseItem;
};

const createLatestRelease = async ({
  ddbDocClient,
  deployment,
  commits,
  summary,
  releasedOn,
  sha,
}: {
  ddbDocClient: DynamoDBDocumentClient;
  deployment: DeploymentEvent;
  commits: { sha: string; message: string }[];
  summary: string;
  releasedOn: string;
  sha: string;
}) => {
  const pk = `RELEASE#${deployment.repo}#${deployment.env}`.toUpperCase();
  // get the test release item from dynamodb

  await ddbDocClient.send(
    new PutCommand({
      TableName: process.env.BOT_TABLE,
      Item: {
        pk,
        sk: "LATEST",
        commits,
        env: deployment.env,
        repo: deployment.repo,
        releasedOn,
        summary,
        sha,
      },
    })
  );
};

const queryCommitsBetweenCommits = async ({
  ddbDocClient,
  repo,
  deployment,
  startingCommitSha,
  endingCommitSha,
}: {
  ddbDocClient: DynamoDBDocumentClient;
  repo: string;
  startingCommitSha: string;
  endingCommitSha: string;
  deployment: DeploymentEvent;
}): Promise<GitHubCommit[]> => {
  const startingCommit = await ddbDocClient.send(
    new GetCommand({
      TableName: process.env.BOT_TABLE,
      Key: {
        pk: `COMMITREF#${repo}`.toUpperCase(),
        sk: startingCommitSha,
      },
    })
  );
  if (!startingCommit.Item) {
    return [];
  }
  const endingCommit = await ddbDocClient.send(
    new GetCommand({
      TableName: process.env.BOT_TABLE,
      Key: {
        pk: `COMMITREF#${repo}`.toUpperCase(),
        sk: endingCommitSha,
      },
    })
  );
  if (!endingCommit.Item) {
    return [];
  }

  const pk = `COMMIT#${repo}`.toUpperCase();
  // query the commits after the last release
  const params: QueryCommandInput = {
    TableName: process.env.BOT_TABLE,
    KeyConditionExpression: `#pk = :pk and #sk between :sk_start and :sk_end`,
    ExpressionAttributeNames: {
      "#pk": "pk",
      "#sk": "sk",
    },
    ExpressionAttributeValues: {
      ":pk": pk,
      ":sk_start": startingCommit.Item.commitedDate,
      ":sk_end": endingCommit.Item.commitedDate,
    },
  };

  let commits: GitHubCommit[] = [];
  try {
    let lastEvaluatedKey = undefined;
    do {
      const res: QueryCommandOutput = await ddbDocClient.send(
        new QueryCommand({
          ...params,
          ExclusiveStartKey: lastEvaluatedKey,
        })
      );
      commits = [...commits, ...((res.Items || []) as GitHubCommit[])];
      lastEvaluatedKey = res.LastEvaluatedKey;
    } while (lastEvaluatedKey);
  } catch (e) {
    console.error(e);
    throw e;
  }
  return commits;
};

export const handler = async (
  event: EventBridgeEvent<string, { data: DeploymentEvent }>
) => {
  console.log(JSON.stringify({ event }, null, 2));

  // store the deployment event in dynamodb
  const deployment = event.detail.data;
  const releasedOn = deployment.deployedOn;
  const pk = `REPO#${deployment.repo}#ENV#${deployment.env}`.toUpperCase();
  const sk = "LATEST";
  const deploymentItem = await ddbDocClient.send(
    new GetCommand({
      TableName: process.env.BOT_TABLE,
      Key: {
        pk,
        sk,
      },
    })
  );
  console.log(JSON.stringify({ deploymentItem }, null, 2));
  const blocks = JSON.parse(deploymentItem.Item?.blocks || "[]");
  const archivedRelease = await archiveLatestRelease({
    ddbDocClient,
    deployment,
  });
  console.log(JSON.stringify({ archivedRelease }, null, 2));
  if (deployment.env === "test" || deployment.env === "prod") {
    const commits =
      archivedRelease.sk && deployment.deployedOn
        ? await queryCommitsBetweenCommits({
            ddbDocClient,
            repo: archivedRelease.repo,
            startingCommitSha: archivedRelease.sha,
            endingCommitSha: deployment.sha,
            deployment,
          })
        : [];
    const toSummarize = {
      lastRelease: archivedRelease.releasedOn,
      releasedOn,
      commits,
      repo: deployment.repo,
      env: deployment.env,
    };
    console.log(JSON.stringify(toSummarize, null, 2));
    const summary = await summarizeRelease(JSON.stringify(toSummarize));
    const summaryBlock = {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${deployment.env.toUpperCase()} Release Summary*\n${summary}`,
      },
    };
    // add the summary block below the divider
    const dividerIndex = blocks.findIndex(
      (block: any) => block.type === "divider"
    );
    blocks.splice(dividerIndex + 1, 0, summaryBlock);
    console.log(JSON.stringify({ summary }, null, 2));
    await createLatestRelease({
      ddbDocClient,
      deployment,
      commits,
      summary,
      releasedOn,
      sha: deployment.sha,
    });
  }
  if (deployment.env === "dev" || deployment.env === "test") {
    // get the latest for the nextEnv
    const nextEnv = nextEnvs[deployment.env];
    const pk = `RELEASE#${deployment.repo}#${nextEnv}`.toUpperCase();
    const sk = "LATEST";
    const releaseToPrep = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.BOT_TABLE,
        Key: {
          pk,
          sk,
        },
      })
    );
    console.log(JSON.stringify({ releaseToPrep }, null, 2));
    if (releaseToPrep.Item) {
      const releaseToPrepCommits = await queryCommitsBetweenCommits({
        ddbDocClient,
        repo: archivedRelease.repo,
        startingCommitSha: releaseToPrep.Item.sha,
        endingCommitSha: deployment.sha,
        deployment,
      });
      console.log(JSON.stringify({ releaseToPrepCommits }, null, 2));
      const prep = await prepRelease({
        lowerEnv: deployment.env,
        higherEnv: nextEnv,
        commits: JSON.stringify(releaseToPrepCommits),
      });
      console.log(JSON.stringify({ prep }, null, 2));
      // get the latest deployment for the env

      const summaryHeader = `*${deployment.env.toUpperCase()} Release Summary*\n`;
      const prepBlock = {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Prep for ${nextEnv.toUpperCase()}*\n${prep}`,
        },
      }
      // add the prep block below the summary block (or the divider if no summary)
      const dividerIndex = blocks.findIndex(
        (block: any) => block.type === "divider"
      );
      const summaryIndex = blocks.findIndex(
        (block: any) => block.type === "section" && block.text?.text?.startsWith(summaryHeader)
      );
      const insertIndex = summaryIndex > -1 ? summaryIndex + 1 : dividerIndex + 1;
      blocks.splice(insertIndex, 0, prepBlock);
    }
  }
  await putEvent({
    eb,
    detailType: EventDetailTypes.SLACK_CHAT,
    detail: JSON.stringify({
      message: {
        channel: process.env.SLACK_CHANNEL,
        ts: deploymentItem.Item?.slackTs,
        blocks,
      },
    }),
  });
  await ddbDocClient.send(
    new UpdateCommand({
      TableName: process.env.BOT_TABLE,
      Key: {
        pk,
        sk,
      },
      UpdateExpression: `set #prop = :prop`,
      ExpressionAttributeNames: {
        "#prop": "blocks",
      },
      ExpressionAttributeValues: {
        ":prop": JSON.stringify(blocks),
      },
    })
  );
};

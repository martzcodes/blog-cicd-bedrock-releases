import { EventBridgeEvent } from "aws-lambda";
import { DeploymentEvent } from "../common/interfaces/DeploymentEvent";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  QueryCommandInput,
  QueryCommandOutput,
} from "@aws-sdk/lib-dynamodb";
import { Release } from "../common/interfaces/Release";
import { GitHubCommit } from "../common/interfaces/GitHubCommit";
import { putEvent } from "../common/put-events";
import { EventDetailTypes } from "../common/event-detail-types";
import { ddbDocClient } from "../common/dynamodb";
import { eb } from "../common/eventbridge";

const archiveLatestRelease = async ({
  ddbDocClient,
  deployment,
}: {
  ddbDocClient: DynamoDBDocumentClient;
  deployment: DeploymentEvent;
}): Promise<Release> => {
  const pk =
    `RELEASE#${deployment.repo}#${deployment.env}`.toUpperCase();
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
  releaseItem.releasedOn = new Date().toISOString();
  releaseItem.sk = new Date().toISOString();
  // re-save latest as releasedOn
  if (release.Item) {
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
}: {
  ddbDocClient: DynamoDBDocumentClient;
  deployment: DeploymentEvent;
  commits: { sha: string; message: string }[];
}) => {
  const pk =
    `RELEASE#${deployment.repo}#${deployment.env}`.toUpperCase();
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
        releasedOn: new Date().toISOString(),
      },
    })
  );
};

const queryCommitsAfterDate = async ({
  ddbDocClient,
  archivedRelease,
  deployment,
}: {
  ddbDocClient: DynamoDBDocumentClient;
  archivedRelease: Release;
  deployment: DeploymentEvent;
}): Promise<GitHubCommit[]> => {
  const pk = `COMMIT#${archivedRelease.repo}`.toUpperCase();
  // query the commits after the last release
  const params: QueryCommandInput = {
    TableName: process.env.BOT_TABLE,
    KeyConditionExpression: `#pk = :pk and #sk >= :sk and #sk_start <= #sk_end`,
    ExpressionAttributeNames: {
      "#pk": "pk",
      "#sk": "sk",
    },
    ExpressionAttributeValues: {
      ":pk": pk,
      ":sk_start": archivedRelease.sk,
      ":sk_end": deployment.deployedAt,
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

export const handler = async (event: EventBridgeEvent<string, DeploymentEvent>) => {
  console.log(JSON.stringify({ event }, null, 2));

  // store the deployment event in dynamodb
  const deployment = event.detail;
  const archivedRelease = await archiveLatestRelease({
    ddbDocClient,
    deployment,
  });
  console.log(JSON.stringify({ archivedRelease }, null, 2));
  if (deployment.env === "test" || deployment.env === "prod") {
    const commits = await queryCommitsAfterDate({
      ddbDocClient,
      archivedRelease: archivedRelease,
      deployment,
    });
    console.log(JSON.stringify({ commits }, null, 2));
    await createLatestRelease({
      ddbDocClient,
      deployment,
      commits,
    });
  }
  await putEvent({
    eb,
    detailType: EventDetailTypes.RELEASE_SUMMARY,
    detail: JSON.stringify({
      repo: deployment.repo,
    }),
  });
};

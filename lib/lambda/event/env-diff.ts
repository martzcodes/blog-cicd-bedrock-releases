import { EventBridgeEvent } from "aws-lambda";
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  QueryCommandInput,
  QueryCommandOutput,
} from "@aws-sdk/lib-dynamodb";
import { GitHubCommit } from "../common/interfaces/GitHubCommit";
import { putEvent } from "../common/put-events";
import { EventDetailTypes } from "../common/event-detail-types";
import { ddbDocClient } from "../common/dynamodb";
import { eb } from "../common/eventbridge";

export interface EnvRelease {
  pk: string;
  sk: string;
  repos: Record<
    string,
    {
      branch: string;
      deployedAt: string;
      deploymentId: string;
      owner: string;
      sha: string;
      url: string;
    }
  >;
}

const queryCommitsBetweenCommits = async ({
  ddbDocClient,
  repo,
  startingCommitSha,
  endingCommitSha,
}: {
  ddbDocClient: DynamoDBDocumentClient;
  repo: string;
  startingCommitSha: string;
  endingCommitSha: string;
}): Promise<GitHubCommit[]> => {
  const startingCommit = startingCommitSha
    ? await ddbDocClient.send(
        new GetCommand({
          TableName: process.env.BOT_TABLE,
          Key: {
            pk: `COMMITREF#${repo}`.toUpperCase(),
            sk: startingCommitSha,
          },
        })
      )
    : ({} as any);
  const endingCommit = endingCommitSha
    ? await ddbDocClient.send(
        new GetCommand({
          TableName: process.env.BOT_TABLE,
          Key: {
            pk: `COMMITREF#${repo}`.toUpperCase(),
            sk: endingCommitSha,
          },
        })
      )
    : ({} as any);
  console.log(JSON.stringify({ startingCommit, endingCommit }, null, 2));
  if (!startingCommit.Item) {
    if (!endingCommit.Item) {
      return [];
    }
    const actualEndingCommit = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.BOT_TABLE,
        Key: {
          pk: `COMMIT#${repo}`.toUpperCase(),
          sk: endingCommit.Item.commitedDate,
        },
      })
    );
    return [actualEndingCommit.Item as GitHubCommit];
  }
  const start = startingCommit.Item.commitedDate;
  const end = endingCommit.Item?.commitedDate || new Date().toISOString();
  console.log(JSON.stringify({ startingCommit, endingCommit }, null, 2));

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
      ":sk_start": start,
      ":sk_end": end,
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
  return commits.filter((commit) => commit.sha !== startingCommitSha);
};

export const handler = async (
  event: EventBridgeEvent<
    string,
    {
      data: {
        channel: string;
        user: string;
        thread_ts: any;
        diffEnvs: string[];
      };
    }
  >
) => {
  console.log(JSON.stringify(event, null, 2));
  const detail = event.detail;
  const { channel, user, thread_ts, diffEnvs } = detail.data;

  let lowerEnv: string, higherEnv: string;
  if (diffEnvs.includes("dev")) {
    lowerEnv = "dev";
    if (diffEnvs.includes("test")) {
      higherEnv = "test";
    } else {
      higherEnv = "prod";
    }
  } else {
    lowerEnv = "test";
    higherEnv = "prod";
  }
  const lowerEnvReleasesRes = await ddbDocClient.send(
    new GetCommand({
      TableName: process.env.BOT_TABLE,
      Key: {
        pk: `LATEST`,
        sk: `${lowerEnv}`.toLowerCase(),
      },
    })
  );
  const lowerEnvReleases = lowerEnvReleasesRes.Item as EnvRelease;
  const higherEnvReleasesRes = await ddbDocClient.send(
    new GetCommand({
      TableName: process.env.BOT_TABLE,
      Key: {
        pk: `LATEST`,
        sk: `${higherEnv}`.toLowerCase(),
      },
    })
  );
  const higherEnvReleases = higherEnvReleasesRes.Item as EnvRelease;
  const reposToExclude = ["mojo-browser-extension-instructions", "savvy-aasa", "savvy-dashboard", "savvy-logos"];
  const lowerEnvRepos = Object.keys(lowerEnvReleases.repos).filter(
    (repo) => !reposToExclude.includes(repo)
  );
  const higherEnvRepos = Object.keys(higherEnvReleases.repos).filter(
    (repo) => !reposToExclude.includes(repo)
  );
  console.log(JSON.stringify({ lowerEnvRepos, higherEnvRepos }, null, 2));

  const reposInSync = higherEnvRepos.reduce((p, c) => {
    if (higherEnvReleases.repos[c].sha === lowerEnvReleases.repos[c].sha) {
      return {
        ...p,
        [c]: true,
      };
    }
    return p;
  }, {} as Record<string, boolean>);
  const blocks = [];
  const inSyncBlock = {
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*These repos are in sync:* ${Object.keys(reposInSync).join(", ")}`,
    },
  };
  blocks.push(inSyncBlock);
  const allRepos = [...new Set([...lowerEnvRepos, ...higherEnvRepos])];
  const notInSync = allRepos.filter((repo) => !reposInSync[repo]);
  for (const repo of notInSync) {
    const lowerSha = lowerEnvReleases.repos[repo]?.sha;
    const higherSha = higherEnvReleases.repos[repo]?.sha;
    try {
      const commits = await queryCommitsBetweenCommits({
        ddbDocClient,
        repo,
        startingCommitSha: higherSha,
        endingCommitSha: lowerSha,
      });
      console.log(JSON.stringify({ repo, commits }, null, 2));
      const commitBlock = {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*<https://github.com/martzcodes/${repo}/compare/${higherSha}...${lowerSha}|Commits missing for ${repo}>: *\n${commits
            .map(
              (c) =>
                `- (<https://github.com/martzcodes/${repo}/commit/${
                  c.sha
                }|${c.sha?.slice(0, 7)}>) ${c.message.split("\n")[0]}...`
            )
            .join("\n")}`,
        },
      };
      blocks.push(commitBlock);
    } catch (e) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*<https://github.com/martzcodes/${repo}/compare/${higherSha}...${lowerSha}|${repo}>:* Unable to diff: ${e}`,
        },
      });
    }
  }
  await putEvent({
    eb,
    detailType: EventDetailTypes.SLACK_CHAT,
    detail: JSON.stringify({
      message: {
        channel,
        thread_ts,
        blocks,
      },
    }),
  });
};
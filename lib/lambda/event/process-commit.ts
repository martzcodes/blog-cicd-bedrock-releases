import { EventBridgeEvent } from "aws-lambda";
import { CommitEvent } from "../common/interfaces/CommitEvent";
import { GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { summarizeCommit } from "../common/bedrock";
import { ddbDocClient } from "../common/dynamodb";
import { sm } from "../common/secretsmanager";

export const handler = async (
  event: EventBridgeEvent<string, { data: { commitEvent: CommitEvent } }>
) => {
  const body = event.detail.data.commitEvent;
  console.log(JSON.stringify({ event }, null, 2));
  console.log(JSON.stringify({ body }, null, 2));
  const before = body.before;
  const secret = await sm.send(
    new GetSecretValueCommand({
      SecretId: process.env.GITHUB_SECRET,
    })
  );
  const githubToken = JSON.parse(secret.SecretString || "{}").GITHUB_TOKEN;
  const githubRepo = body.repositoryName;
  for (let j = 0; j < body.commits.length; j++) {
    await ddbDocClient.send(
      new PutCommand({
        TableName: process.env.BOT_TABLE,
        Item: {
          pk: `COMMITREF#${githubRepo}`.toUpperCase(),
          sk: body.commits[j].id,
          commitedDate: new Date(body.commits[j].timestamp).toISOString(),
          ttl: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30, // 30 days
          parentSha: before,
        },
      })
    );
    const detailedCommitRes = await fetch(
      `https://api.github.com/repos/${body.owner}/${githubRepo}/commits/${body.commits[j].id}`,
      {
        method: "GET",
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          Authorization: `Bearer ${githubToken}`,
        },
      }
    );
    const detailedCommit = await detailedCommitRes.json();
    console.log(JSON.stringify({ detailedCommit }));
    const simplifiedCommit = {
      sha: detailedCommit.sha,
      message: detailedCommit.commit.message,
      author: detailedCommit.commit.author.name,
      url: detailedCommit.commit.url,
      stats: detailedCommit.stats,
      files: detailedCommit.files
        .filter((file: any) => !file.filename.includes("package-lock.json"))
        .map((file: any) => ({
          filename: file.filename,
          status: file.status,
          additions: file.additions,
          deletions: file.deletions,
          changes: file.changes,
          patch: file.patch,
        })),
    };
    const summary = await summarizeCommit(JSON.stringify(simplifiedCommit));
    console.log(JSON.stringify({ summary }));
    await ddbDocClient.send(
      new PutCommand({
        TableName: process.env.BOT_TABLE,
        Item: {
          pk: `COMMIT#${githubRepo}`.toUpperCase(),
          sk: new Date(body.commits[j].timestamp).toISOString(),
          repo: githubRepo,
          commited: new Date(body.commits[j].timestamp).getTime(),
          sha: body.commits[j].id,
          message: body.commits[j].message,
          summary,
          ttl: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30, // 30 days
          parentSha: before,
        },
      })
    );
  }
};

import { APIGatewayEvent } from "aws-lambda";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddbDocClient } from "../common/dynamodb";

export const handler = async (event: APIGatewayEvent) => {
  console.log(JSON.stringify({ event }));
  const body = JSON.parse(event.body || "{}");
  console.log(JSON.stringify({ body }, null, 2));
  const keys = Object.keys(body);
  const commitEvent = keys.includes("pusher");
  if (commitEvent) {
    const mainBranch = `${body.repository.default_branch}`;
    const branch = body.ref.replace("refs/heads/", "");
    const mainCommit = branch === mainBranch;

    if (mainCommit) {
      const githubRepo = body.repository.full_name.split('/')[1];
      for (let j = 0; j < body.commits.length; j++) {
        await ddbDocClient.send(
          new PutCommand({
            TableName: process.env.BOT_TABLE,
            Item: {
              pk: `COMMIT#${githubRepo}`.toUpperCase(),
              sk: new Date().toISOString(),
              repo: githubRepo,
              commited: new Date(body.commits[j].timestamp).getTime(),
              sha: body.commits[j].id,
              message: body.commits[j].message,
              ttl: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30, // 30 days
            },
          })
        );
      }
    }
  }
  return {
    statusCode: 200,
  };
};

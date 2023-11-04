import { ITable } from "aws-cdk-lib/aws-dynamodb";
import { Endpoint } from "../interfaces/Endpoint";
import { ISecret } from "aws-cdk-lib/aws-secretsmanager";

export const webhooks = ({
  slackSecret,
  githubSecret,
  table,
}: {
  slackSecret: ISecret;
  githubSecret: ISecret;
  table: ITable;
}): Endpoint[] => [
  {
    path: "github/commit",
    method: "POST",
    lambda: "github-commit-webhook",
    putEvents: true,
    dynamoWrite: {
      BOT_TABLE: table,
    },
  },
  {
    path: "github/deployment",
    method: "POST",
    lambda: "github-deployment-webhook",
    putEvents: true,
    dynamoWrite: {
      BOT_TABLE: table,
    },
    dynamoRead: {
      BOT_TABLE: table,
    },
    secretRead: {
      GITHUB_SECRET: githubSecret,
    },
  },
  {
    path: "slack/action",
    method: "POST",
    lambda: "slack-action",
    putEvents: true,
  },
  {
    path: "slack/interactive",
    method: "POST",
    lambda: "slack-interactive",
    putEvents: true,
    dynamoWrite: {
      BOT_TABLE: table,
    },
    dynamoRead: {
      BOT_TABLE: table,
    },
    secretRead: {
      SLACK_SECRET: slackSecret,
    },
  },
];

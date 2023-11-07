import { ITable } from "aws-cdk-lib/aws-dynamodb";
import { EndpointLambda } from "../interfaces/EndpointLambda";
import { ISecret } from "aws-cdk-lib/aws-secretsmanager";

export const webhooks = ({
  slackSecret,
  githubSecret,
  table,
}: {
  slackSecret: ISecret;
  githubSecret: ISecret;
  table: ITable;
}): EndpointLambda[] => [
  {
    path: "github/commit",
    method: "POST",
    lambda: "github-commit-webhook",
    putEvents: true,
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
  },
];

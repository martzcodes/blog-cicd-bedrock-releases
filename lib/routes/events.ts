import { ITable } from "aws-cdk-lib/aws-dynamodb";
import { EventBridgeLambda } from "../interfaces/EventBridgeLambda";
import { ISecret } from "aws-cdk-lib/aws-secretsmanager";
import { EventDetailTypes } from "../lambda/common/event-detail-types";
import { EventSources } from "../lambda/common/event-sources";

export const events = ({
  table,
  slackSecret,
  githubSecret,
}: {
  table: ITable;
  slackSecret: ISecret;
  githubSecret: ISecret;
}): EventBridgeLambda[] => [
  {
    lambda: "event/process-commit",
    eventPattern: {
      detailType: [EventDetailTypes.COMMIT_EVENT],
    },
    putEvents: true,
    dynamoWrite: {
      BOT_TABLE: table,
    },
    bedrock: true,
    secretRead: {
      GITHUB_SECRET: githubSecret,
    },
  },
  {
    lambda: "event/slack-chat",
    eventPattern: {
      detailType: [EventDetailTypes.SLACK_CHAT],
    },
    putEvents: true,
    secretRead: { SLACK_SECRET: slackSecret },
    dynamoWrite: { BOT_TABLE: table },
  },
  {
    lambda: "event/track-release",
    eventPattern: {
      detailType: [EventDetailTypes.TRACK_RELEASE],
    },
    putEvents: true,
    dynamoRead: { BOT_TABLE: table },
    dynamoWrite: { BOT_TABLE: table },
    bedrock: true,
  },
  {
    lambda: "event/deploy-with-github",
    eventPattern: {
      detailType: [EventDetailTypes.DEPLOY_WITH_GITHUB],
    },
    putEvents: true,
    dynamoRead: { BOT_TABLE: table },
    dynamoWrite: { BOT_TABLE: table },
    secretRead: { GITHUB_SECRET: githubSecret },
  },
  {
    lambda: "event/env-diff",
    eventPattern: {
      source: [EventSources.DeployerBot],
      detailType: [EventDetailTypes.ENV_DIFF],
    },
    putEvents: true,
    dynamoRead: { BOT_TABLE: table },
    bedrock: true,
  },
];

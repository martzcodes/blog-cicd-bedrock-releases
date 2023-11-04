import { ITable } from "aws-cdk-lib/aws-dynamodb";
import { EventBridgeEvent } from "../interfaces/EventBridgeEvent";
import { ISecret } from "aws-cdk-lib/aws-secretsmanager";
import { EventDetailTypes } from "../lambda/common/event-detail-types";

export const events = ({
  table,
  slackSecret,
  githubSecret,
}: {
  table: ITable;
  slackSecret: ISecret;
  githubSecret: ISecret;
}): EventBridgeEvent[] => [
  {
    lambda: "event/slack-chat",
    eventPattern: {
      detailType: [EventDetailTypes.SLACK_CHAT],
    },
    putEvents: true,
    secretsToRead: { SLACK_SECRET: slackSecret },
    dynamosToWrite: { BOT_TABLE: table },
  },
  {
    lambda: "event/track-release",
    eventPattern: {
      detailType: [EventDetailTypes.TRACK_RELEASE],
    },
    putEvents: true,
    dynamosToRead: { BOT_TABLE: table },
    dynamosToWrite: { BOT_TABLE: table },
  },
  {
    lambda: "event/deploy-with-github",
    eventPattern: {
      detailType: [EventDetailTypes.DEPLOY_WITH_GITHUB],
    },
    putEvents: true,
    dynamosToRead: { BOT_TABLE: table },
    dynamosToWrite: { BOT_TABLE: table },
    secretsToRead: { GITHUB_SECRET: githubSecret },
  },
];

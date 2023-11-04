import { ITable } from "aws-cdk-lib/aws-dynamodb";
import { EventPattern } from "aws-cdk-lib/aws-events";
import { ISecret } from "aws-cdk-lib/aws-secretsmanager";

export interface EventBridgeEvent {
  dynamosToRead?: Record<string, ITable>;
  dynamosToWrite?: Record<string, ITable>;
  eventPattern: EventPattern;
  lambda: string;
  putEvents?: boolean;
  secretsToRead?: Record<string, ISecret>;
}
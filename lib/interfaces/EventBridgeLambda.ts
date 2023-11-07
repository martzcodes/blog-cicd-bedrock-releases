import { EventPattern } from "aws-cdk-lib/aws-events";
import { BaseLambda } from "./BaseLambda";

export interface EventBridgeLambda extends BaseLambda {
  eventPattern: EventPattern;
}
import { ITable } from "aws-cdk-lib/aws-dynamodb";
import { ISecret } from "aws-cdk-lib/aws-secretsmanager";

export interface BaseLambda {
  bedrock?: boolean;
  dynamoRead?: Record<string, ITable>;
  dynamoWrite?: Record<string, ITable>;
  lambda: string;
  putEvents?: boolean;
  secretRead?: Record<string, ISecret>;
  secretWrite?: Record<string, ISecret>;
}
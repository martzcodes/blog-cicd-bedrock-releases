import { ITable } from "aws-cdk-lib/aws-dynamodb";
import { ISecret } from "aws-cdk-lib/aws-secretsmanager";

export interface Endpoint {
  dynamoRead?: Record<string, ITable>;
  dynamoWrite?: Record<string, ITable>;
  lambda: string;
  method: string;
  path: string;
  putEvents?: boolean;
  secretRead?: Record<string, ISecret>;
  secretWrite?: Record<string, ISecret>;
}

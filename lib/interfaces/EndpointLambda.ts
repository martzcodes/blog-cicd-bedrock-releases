import { BaseLambda } from "./BaseLambda";

export interface EndpointLambda extends BaseLambda {
  method: string;
  path: string;
}

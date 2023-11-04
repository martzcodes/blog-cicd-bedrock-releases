import { APIGatewayEvent } from "aws-lambda";

export const handler = async (event: APIGatewayEvent) => {
  const body = JSON.parse(event.body || "{}");

  return {
    statusCode: 200,
  };
};

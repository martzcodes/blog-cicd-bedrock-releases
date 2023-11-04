import { APIGatewayEvent } from "aws-lambda";

export const handler = async (event: APIGatewayEvent) => {
  const body = JSON.parse(event.body || "{}");
  console.log(JSON.stringify({ body }, null, 2));

  return {
    statusCode: 200,
    body: body.challenge,
  };
};

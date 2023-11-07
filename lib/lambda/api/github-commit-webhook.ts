import { APIGatewayEvent } from "aws-lambda";
import { eb } from "../common/eventbridge";
import { putEvent } from "../common/put-events";
import { EventDetailTypes } from "../common/event-detail-types";

export const handler = async (event: APIGatewayEvent) => {
  console.log(JSON.stringify({ event }));
  const body = JSON.parse(event.body || "{}");
  if (Object.keys(body).includes("pusher")) {
    const mainBranch = `${body.repository.default_branch}`;
    const branch = body.ref.replace("refs/heads/", "");
    const mainCommit = branch === mainBranch;

    if (mainCommit) {
      const commitEvent = {
        before: body.before,
        commits: body.commits,
        mainBranch: `${body.repository.default_branch}`,
        owner: body.repository.owner.name,
        ref: body.ref,
        repositoryName: body.repository.name,
      };
      await putEvent({
        detail: JSON.stringify({
          commitEvent,
        }),
        detailType: EventDetailTypes.COMMIT_EVENT,
        eb,
      });
    }
  }

  return {
    statusCode: 200,
  };
};

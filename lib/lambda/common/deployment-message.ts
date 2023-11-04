export const deploymentMessage = ({
  repo,
  env,
  author,
  status,
  nextEnv,
  subTitle,
  owner,
  commit,
  deployment,
}: {
  repo: string;
  env?: string;
  author?: string;
  status?: string;
  nextEnv?: string;
  subTitle?: string;
  owner: string;
  commit?: {
    sha: string;
    branch?: string;
  };
  deployment?: {
    id: string;
    url: string;
  };
}): string => {
  const headerBlocks: any = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `${repo} deployment${env ? ` to ${env}` : ""}${
          author ? ` by ${author}` : ""
        }${status ? `: ${status}` : ""}`,
        emoji: true,
      },
    },
  ];
  if (subTitle) {
    headerBlocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `${subTitle}`,
        },
      ],
    });
  }
  const actions =
    status === "success" && nextEnv
      ? [
          {
            type: "divider",
          },
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: {
                  type: "plain_text",
                  emoji: true,
                  text: `:ship: Deploy to ${nextEnv}`,
                },
                style: "primary",
                value: "approved",
              },
              {
                type: "button",
                text: {
                  type: "plain_text",
                  emoji: true,
                  text: ":thumbsdown: Deny",
                },
                style: "danger",
                value: "rejected",
              },
            ],
          },
        ]
      : [];
  const message = {
    blocks: [
      ...headerBlocks,
      {
        type: "section",
        fields: [
          ...(commit
            ? [
                {
                  type: "mrkdwn",
                  text: `*Commit:*\n<https://github.com/${owner}/${repo}/commit/${
                    commit.sha
                  }|${
                    commit.branch ? `${commit.branch}: ` : ""
                  }${commit.sha.slice(0, 7)}>`,
                },
              ]
            : []),
          ...(deployment
            ? [
                {
                  type: "mrkdwn",
                  text: `*Deployment:*\n<${deployment.url}|${deployment.id}>`,
                },
              ]
            : []),
        ],
      },
      ...actions,
    ],
  };
  console.log(JSON.stringify(message, null, 2));
  return JSON.stringify(message);
};

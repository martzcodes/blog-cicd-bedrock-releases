export interface DeployWithGitHubEvent {
  sha: string;
  repo: string;
  owner: string;
  nextEnv: string;
}
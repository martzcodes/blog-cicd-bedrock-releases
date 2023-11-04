export interface DeploymentEvent {
  env: string;
  repo: string;
  sha: string;
  deployedAt: string;
}
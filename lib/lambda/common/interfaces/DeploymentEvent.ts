export interface DeploymentEvent {
  env: string;
  repo: string;
  sha: string;
  deployedOn: string;
}
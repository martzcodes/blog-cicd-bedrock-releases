export interface CommitEvent {
  before: string;
  commits: any[];
  mainBranch: string;
  owner: string;
  ref: string;
  repositoryName: string;
}
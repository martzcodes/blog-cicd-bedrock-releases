export interface Release {
  pk: string;
  sk: string;
  env: string;
  repo: string;
  commits: {
    sha: string;
    message: string;
  }[];
  releasedOn: string;
}
/** Re-export full harness gitops for API routes; backward-compatible surface. */
export {
  GitError,
  git,
  diffText,
  ensureIntegration,
  createWorktree,
  commitAll,
  changedPaths,
  integrationWorktree,
  mergeTask,
  removeWorktree,
  staleWorktrees,
  recover,
} from "./harness/gitops";

import { HttpError } from "./api";

const ROLE_MATRIX: Record<string, Set<string>> = {
  owner: new Set(["read", "edit", "generate", "restore", "share", "publish", "delete"]),
  editor: new Set(["read", "edit", "generate", "restore"]),
  viewer: new Set(["read"]),
};

export function effectiveRole(
  project: Record<string, unknown>,
  userId: string,
): string {
  const owner = (project.ownerUserId as string | undefined) ?? "local-user";
  if (userId === owner) return "owner";
  // Pre-auth dev projects keep ownerUserId "local-user" until legacy adoption runs.
  if (owner === "local-user" && userId) return "owner";
  const collaborators = (project.collaborators as Array<Record<string, unknown>> | null) ?? [];
  for (const collab of collaborators) {
    if (collab.userId === userId) return (collab.role as string | undefined) ?? "viewer";
  }
  if (project.visibility === "org") return "editor";
  return userId !== owner ? "viewer" : "owner";
}

export function requireAction(
  project: Record<string, unknown>,
  userId: string,
  action: string,
): string {
  const role = effectiveRole(project, userId);
  const allowed = ROLE_MATRIX[role] ?? new Set<string>();
  if (!allowed.has(action)) {
    throw new HttpError(403, JSON.stringify({ code: "forbidden", action, role }));
  }
  return role;
}

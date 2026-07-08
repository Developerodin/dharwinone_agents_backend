"""Role policy checks for builder mutations."""

from fastapi import HTTPException

ROLE_MATRIX = {
    "owner": frozenset({"read", "edit", "generate", "restore", "share", "publish"}),
    "editor": frozenset({"read", "edit", "generate", "restore"}),
    "viewer": frozenset({"read"}),
}


def effective_role(project, user_id):
    owner = project.get("ownerUserId") or "local-user"
    if user_id == owner:
        return "owner"
    for collab in project.get("collaborators") or []:
        if collab.get("userId") == user_id:
            return collab.get("role", "viewer")
    if project.get("visibility") == "org":
        return "editor"
    return "viewer" if user_id != owner else "owner"


def require_action(project, user_id, action):
    role = effective_role(project, user_id)
    allowed = ROLE_MATRIX.get(role, frozenset())
    if action not in allowed:
        raise HTTPException(
            status_code=403,
            detail={"code": "forbidden", "action": action, "role": role},
        )
    return role

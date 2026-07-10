"""Bearer-token helper for API tests (AUTH_JWT_SECRET set in conftest)."""

from studio import security


def auth_headers(user_id="local-user"):
    return {"Authorization": f"Bearer {security.issue_jwt(user_id)}"}

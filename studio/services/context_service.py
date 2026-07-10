"""Project context hydration for reopen continuity."""

from studio.repositories import (
    assets_repo,
    conversations_repo,
    profiles_repo,
    projects_repo,
    templates_repo,
    versions_repo,
    working_html_repo,
)
from studio.services import profile_service
from studio.services import onboarding_service
from studio.repositories import edits_repo


def get_context(project_id):
    project = projects_repo.get(project_id)
    if not project:
        raise ValueError("project not found")
    profile = profile_service.get_profile(project_id)
    working = working_html_repo.get(project_id)
    return {
        "project": project,
        "profile": profile,
        "chat": onboarding_service.get_chat(project_id),
        "assets": assets_repo.list_for_project(project_id),
        "templates": templates_repo.list_for_project(project_id),
        "workingHtml": working.get("html") if working else None,
        "selectedTemplateId": working.get("selectedTemplateId") if working else None,
        "versions": versions_repo.list_for_project(project_id),
        "edits": edits_repo.list_for_project(project_id),
    }

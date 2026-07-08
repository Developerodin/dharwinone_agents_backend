"""Version restore and lineage."""

from studio.repositories import edits_repo, projects_repo, versions_repo, working_html_repo
from studio.services import edit_service


class VersionError(ValueError):
    pass


def restore(project_id, version_id):
    if not projects_repo.get(project_id):
        raise ValueError("project not found")
    version = versions_repo.get(project_id, version_id)
    if not version:
        raise VersionError("version not found")
    html = version.get("snapshotHtml")
    if not html:
        raise VersionError("version snapshot missing")
    working_html_repo.put(project_id, html, template_id=None)
    restored = versions_repo.create(
        project_id,
        label=f"Restored from {version_id}",
        trigger="restore",
        html=html,
    )
    projects_repo.update_fields(
        project_id,
        {"currentVersionId": restored["versionId"], "status": "editing"},
    )
    edits_repo.append(
        project_id,
        source="restore",
        user_prompt="",
        action_summary=f"Restored version {version_id}",
        change_scope="restore",
        targets=[version_id],
        version_id=restored["versionId"],
    )
    return {
        "restoredFrom": version_id,
        "versionId": restored["versionId"],
        "html": html,
    }


def list_versions(project_id):
    if not projects_repo.get(project_id):
        raise ValueError("project not found")
    return versions_repo.list_for_project(project_id)

"""Template selection and working-html materialization."""

from studio.repositories import (
    profiles_repo,
    projects_repo,
    templates_repo,
    versions_repo,
    working_html_repo,
)


def select_template(project_id, template_id):
    if not projects_repo.get(project_id):
        raise ValueError("project not found")
    template = templates_repo.get(project_id, template_id)
    if not template:
        raise ValueError("template not found")
    html = template.get("htmlContent")
    if not html:
        raise ValueError("template html missing")
    working_html_repo.put(project_id, html, template_id=template_id)
    profile = profiles_repo.get(project_id)
    versions_repo.create(
        project_id,
        label=f"Selected {template.get('label', template_id)}",
        trigger="selection",
        html=html,
        profile=profile,
    )
    projects_repo.update_fields(
        project_id,
        {
            "status": "editing",
            "selectedTemplateId": template_id,
            "currentVersionId": versions_repo.head(project_id)["versionId"],
        },
    )
    return {
        "projectId": project_id,
        "templateId": template_id,
        "html": html,
    }

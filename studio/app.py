"""FastAPI control-plane factory."""

import json
import os
import re
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, PlainTextResponse, StreamingResponse
from harness import gitops, packets, providers
from pydantic import BaseModel

from studio import auth, consent, draft, events, gates, knowledge, policy, preview, projects, ratelimit, runs, security
from studio.repositories import profiles_repo, projects_repo, users_repo
from studio.services import (
    auth_service,
    asset_service,
    context_service,
    edit_service,
    onboarding_service,
    personalization_service,
    profile_service,
    publish_service,
    selection_service,
    version_service,
)
from studio.repositories import analytics_repo, working_html_repo


class ProjectCreate(BaseModel):
    name: str
    repo_root: str
    integration_branch: str | None = None
    dev_cmd: str | None = None
    dev_port_range: list[int] | None = None
    accept_templates: dict[str, list[str]] | None = None


class RunCreate(BaseModel):
    prompt: str
    lane: str = "feature"
    title: str | None = None
    allow_paths: list[str] | None = None
    accept_template: str | None = None
    accept_args: list[str] | None = None
    force: bool = False  # kill the active run before starting


class GateDecision(BaseModel):
    decision: str
    payload: dict | None = None


class DesignChoice(BaseModel):
    id: str
    label: str
    variant: int


class WorkingDraftUpdate(BaseModel):
    html: str


class EditRequest(BaseModel):
    prompt: str


class PrivacyUpdate(BaseModel):
    privacy: str
    stage_consents: list[str] | None = None


class BuilderProjectCreate(BaseModel):
    projectName: str
    initialPrompt: str | None = None


class BuilderChatMessage(BaseModel):
    message: str


class BusinessProfilePatch(BaseModel):
    brand: dict | None = None
    business: dict | None = None
    location: dict | None = None
    contact: dict | None = None
    design: dict | None = None
    skipped: list[str] | None = None


class AssetPresignRequest(BaseModel):
    filename: str
    contentType: str
    assetType: str


class AssetConfirmRequest(BaseModel):
    assetId: str
    s3Key: str
    contentType: str
    sizeBytes: int
    width: int | None = None
    height: int | None = None


class BuilderWorkingHtmlUpdate(BaseModel):
    html: str


class BuilderEditRequest(BaseModel):
    prompt: str
    structural: bool = False


class RestoreVersionRequest(BaseModel):
    versionId: str


class PublishRequest(BaseModel):
    channel: str = "preview"
    versionId: str | None = None


class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenRequest(BaseModel):
    token: str


class EmailRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    password: str


_PUBLIC_PATHS = frozenset(
    {
        "/auth/register",
        "/auth/verify",
        "/auth/login",
        "/auth/resend-verification",
        "/auth/forgot-password",
        "/auth/reset-password",
    }
)


def _require_builder_v2():
    from studio import config

    if not config.builder_v2_enabled():
        raise HTTPException(status_code=404, detail="builder v2 disabled")


def _builder_project_or_404(project_id):
    project = projects_repo.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="project not found")
    return project


def _require_builder_action(project_id, user_id, action):
    project = _builder_project_or_404(project_id)
    policy.require_action(project, user_id, action)
    return project


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _request_base_url(request: Request) -> str:
    # Prefer proxy-forwarded host/proto so email links use the public domain.
    forwarded_proto = (request.headers.get("x-forwarded-proto") or "").split(",")[0].strip()
    forwarded_host = (request.headers.get("x-forwarded-host") or "").split(",")[0].strip()
    if forwarded_proto and forwarded_host:
        return f"{forwarded_proto}://{forwarded_host}"
    return str(request.base_url).rstrip("/")


def _rate_limit(key: str, limit: int, window_s: float):
    if not ratelimit.allow(key, limit, window_s):
        raise HTTPException(
            status_code=429,
            detail="too many requests",
            headers={"Retry-After": str(ratelimit.retry_after(key, window_s))},
        )


def _auth_error(exc: "auth_service.AuthError"):
    return HTTPException(status_code=exc.status, detail=exc.detail)


def _get_run_or_404(run_id):
    run = runs.load_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="run not found")
    return run


def _ensure_build_editing(run):
    if run.get("lane") != "build":
        raise HTTPException(status_code=409, detail="not a build-lane run")
    if run.get("state") != "editing":
        raise HTTPException(status_code=409, detail="run is not editable")


def _working_path(run_id):
    run_dir = runs.find_run_dir(run_id)
    if not run_dir:
        raise HTTPException(status_code=404, detail="run directory not found")
    return run_dir, os.path.join(run_dir, "working.html")


def _append_edit_log(run_dir, source, prompt=None, ok=True):
    path = os.path.join(run_dir, "edit-log.jsonl")
    entry = {"ts": time.time(), "source": source, "ok": ok}
    if prompt:
        entry["prompt"] = prompt
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry) + "\n")


def _planner_provider(project, run_id):
    cfg = projects.derive_harness_cfg(project, run_id)
    stage_cfg = (project.get("providers") or {}).get("planner") or {}
    kind = stage_cfg.get("kind", "ollama")
    model = stage_cfg.get("model", cfg["models"]["planner"])
    merged = {**cfg, "providers": project.get("providers")}
    policy = consent.make_policy(project, run_id)
    provider = providers.get(merged, "planner", policy=policy)
    if kind in consent._CLOUD_KINDS:
        provider = consent.wrap_provider(
            provider, project, run_id, "planner", kind, model
        )
    return provider, model


def create_app():
    @asynccontextmanager
    async def lifespan(app):
        runs.start_monitor()
        yield
        runs.stop_monitor()

    app = FastAPI(title="Dharwin Studio", lifespan=lifespan)

    @app.middleware("http")
    async def _require_jwt(request: Request, call_next):
        if request.method == "OPTIONS" or request.url.path in _PUBLIC_PATHS:
            return await call_next(request)
        header = request.headers.get("authorization", "")
        token = header[7:] if header.startswith("Bearer ") else ""
        if not token:
            return JSONResponse(
                status_code=401, content={"detail": "authentication required"}
            )
        try:
            request.state.user_id = security.verify_jwt(token)
        except security.TokenError:
            return JSONResponse(
                status_code=401, content={"detail": "invalid or expired token"}
            )
        return await call_next(request)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:3000",
            "http://127.0.0.1:3000",
        ],
        allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.post("/auth/register", status_code=201)
    def post_auth_register(body: RegisterRequest, request: Request):
        _rate_limit(f"register:ip:{_client_ip(request)}", 10, 3600)
        try:
            return auth_service.register(
                body.name,
                body.email,
                body.password,
                base_url=_request_base_url(request),
            )
        except auth_service.AuthError as exc:
            raise _auth_error(exc) from exc
        except users_repo.AuthDbUnavailable as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

    @app.post("/auth/verify")
    def post_auth_verify(body: TokenRequest, request: Request):
        _rate_limit(f"verify:ip:{_client_ip(request)}", 10, 3600)
        try:
            auth_service.verify_email(body.token)
        except auth_service.AuthError as exc:
            raise _auth_error(exc) from exc
        except users_repo.AuthDbUnavailable as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        return {"status": "verified"}

    @app.post("/auth/login")
    def post_auth_login(body: LoginRequest, request: Request):
        email_key = body.email.strip().lower()
        _rate_limit(f"login:email:{email_key}", 5, 900)
        _rate_limit(f"login:ip:{_client_ip(request)}", 20, 900)
        try:
            return auth_service.login(body.email, body.password)
        except auth_service.AuthError as exc:
            raise _auth_error(exc) from exc
        except users_repo.AuthDbUnavailable as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

    @app.post("/auth/resend-verification")
    def post_auth_resend(body: EmailRequest, request: Request):
        _rate_limit(f"resend:email:{body.email.strip().lower()}", 3, 3600)
        try:
            auth_service.resend_verification(
                body.email,
                base_url=_request_base_url(request),
            )
        except users_repo.AuthDbUnavailable as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        return {"status": "ok"}

    @app.post("/auth/forgot-password")
    def post_auth_forgot(body: EmailRequest, request: Request):
        _rate_limit(f"forgot:email:{body.email.strip().lower()}", 3, 3600)
        try:
            auth_service.forgot_password(
                body.email,
                base_url=_request_base_url(request),
            )
        except users_repo.AuthDbUnavailable as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        return {"status": "ok"}

    @app.post("/auth/reset-password")
    def post_auth_reset(body: ResetPasswordRequest, request: Request):
        _rate_limit(f"reset:ip:{_client_ip(request)}", 10, 3600)
        try:
            auth_service.reset_password(body.token, body.password)
        except auth_service.AuthError as exc:
            raise _auth_error(exc) from exc
        except users_repo.AuthDbUnavailable as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        return {"status": "ok"}

    @app.get("/projects")
    def list_projects():
        return projects.load_all()

    @app.post("/projects", status_code=201)
    def post_project(body: ProjectCreate):
        try:
            return projects.create(body.model_dump(exclude_none=True))
        except projects.ProjectError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @app.get("/projects/{project_id}")
    def get_project(project_id: str):
        p = projects.get(project_id)
        if not p:
            raise HTTPException(status_code=404, detail="project not found")
        return p

    @app.get("/builder/projects")
    def list_builder_projects(request: Request):
        _require_builder_v2()
        uid = auth.resolve_user_id(request)
        try:
            return projects_repo.list_for_user(uid)
        except projects_repo.BuilderV2Disabled:
            raise HTTPException(status_code=404, detail="builder v2 disabled") from None

    @app.post("/builder/projects", status_code=201)
    def post_builder_project(body: BuilderProjectCreate, request: Request):
        _require_builder_v2()
        uid = auth.resolve_user_id(request)
        try:
            return projects_repo.create(
                body.projectName,
                initial_prompt=body.initialPrompt,
                owner_user_id=uid,
            )
        except projects_repo.BuilderV2Disabled:
            raise HTTPException(status_code=404, detail="builder v2 disabled") from None

    @app.get("/builder/projects/{project_id}")
    def get_builder_project(project_id: str):
        _require_builder_v2()
        try:
            doc = projects_repo.get(project_id)
        except projects_repo.BuilderV2Disabled:
            raise HTTPException(status_code=404, detail="builder v2 disabled") from None
        if not doc:
            raise HTTPException(status_code=404, detail="project not found")
        return doc

    @app.post("/builder/projects/{project_id}/chat")
    def post_builder_chat(project_id: str, body: BuilderChatMessage):
        _require_builder_v2()
        if not projects_repo.get(project_id):
            raise HTTPException(status_code=404, detail="project not found")
        try:
            return onboarding_service.handle_message(project_id, body.message)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @app.get("/builder/projects/{project_id}/chat")
    def get_builder_chat(project_id: str):
        _require_builder_v2()
        if not projects_repo.get(project_id):
            raise HTTPException(status_code=404, detail="project not found")
        return onboarding_service.get_chat(project_id)

    @app.get("/builder/projects/{project_id}/business-profile")
    def get_builder_business_profile(project_id: str):
        _require_builder_v2()
        try:
            return profile_service.get_profile(project_id)
        except (ValueError, profiles_repo.BuilderV2Disabled) as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @app.put("/builder/projects/{project_id}/business-profile")
    def put_builder_business_profile(
        project_id: str, body: BusinessProfilePatch
    ):
        _require_builder_v2()
        try:
            return profile_service.update_profile(
                project_id,
                body.model_dump(exclude_none=True),
            )
        except profile_service.ProfileValidationError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @app.post("/builder/projects/{project_id}/generate-templates")
    def post_builder_generate_templates(
        project_id: str,
        force: bool = Query(default=False),
    ):
        _require_builder_v2()
        if not projects_repo.get(project_id):
            raise HTTPException(status_code=404, detail="project not found")
        try:
            profile_service.require_generation_ready(project_id)
            templates = personalization_service.generate_for_project(project_id, force=force)
        except profile_service.ProfileIncompleteError as exc:
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "profile_incomplete",
                    "missingFields": exc.missing_fields,
                },
            ) from exc
        except personalization_service.PersonalizationError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        analytics_repo.track(project_id, "generate_templates", metadata={"count": len(templates)})
        return {"status": "ready", "templates": templates}

    @app.get("/builder/projects/{project_id}/templates")
    def get_builder_templates(project_id: str):
        _require_builder_v2()
        if not projects_repo.get(project_id):
            raise HTTPException(status_code=404, detail="project not found")
        from studio.repositories import templates_repo

        return templates_repo.list_for_project(project_id)

    @app.post("/builder/projects/{project_id}/templates/{template_id}/select")
    def post_builder_select_template(
        project_id: str,
        template_id: str,
        request: Request,
    ):
        _require_builder_v2()
        uid = auth.resolve_user_id(request)
        _require_builder_action(project_id, uid, "edit")
        try:
            return selection_service.select_template(project_id, template_id)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @app.get("/builder/projects/{project_id}/working-html")
    def get_builder_working_html(project_id: str):
        _require_builder_v2()
        _builder_project_or_404(project_id)
        from studio.repositories import working_html_repo

        doc = working_html_repo.get(project_id)
        if not doc:
            raise HTTPException(status_code=404, detail="working html not found")
        return {"html": doc["html"], "selectedTemplateId": doc.get("selectedTemplateId")}

    @app.put("/builder/projects/{project_id}/working-html")
    def put_builder_working_html(
        project_id: str,
        body: BuilderWorkingHtmlUpdate,
        request: Request,
    ):
        _require_builder_v2()
        uid = auth.resolve_user_id(request)
        _require_builder_action(project_id, uid, "edit")
        try:
            return edit_service.save_manual(project_id, body.html)
        except working_html_repo.WorkingHtmlError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @app.post("/builder/projects/{project_id}/edit")
    def post_builder_edit(
        project_id: str,
        body: BuilderEditRequest,
        request: Request,
    ):
        _require_builder_v2()
        uid = auth.resolve_user_id(request)
        _require_builder_action(project_id, uid, "edit")
        try:
            return edit_service.apply_edit(
                project_id,
                body.prompt,
                structural=body.structural,
            )
        except edit_service.EditValidationError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except working_html_repo.WorkingHtmlError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @app.get("/builder/projects/{project_id}/edits")
    def get_builder_edits(project_id: str):
        _require_builder_v2()
        _builder_project_or_404(project_id)
        from studio.repositories import edits_repo

        return edits_repo.list_for_project(project_id)

    @app.get("/builder/projects/{project_id}/versions")
    def get_builder_versions(project_id: str):
        _require_builder_v2()
        try:
            return version_service.list_versions(project_id)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @app.post("/builder/projects/{project_id}/versions/restore")
    def post_builder_restore_version(
        project_id: str,
        body: RestoreVersionRequest,
        request: Request,
    ):
        _require_builder_v2()
        uid = auth.resolve_user_id(request)
        _require_builder_action(project_id, uid, "restore")
        try:
            return version_service.restore(project_id, body.versionId)
        except version_service.VersionError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @app.get("/builder/projects/{project_id}/context")
    def get_builder_context(project_id: str):
        _require_builder_v2()
        try:
            return context_service.get_context(project_id)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @app.post("/builder/projects/{project_id}/quality/run")
    def post_builder_quality(project_id: str):
        _require_builder_v2()
        _builder_project_or_404(project_id)
        try:
            return publish_service.run_quality_gate(project_id)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @app.get("/builder/projects/{project_id}/quality/latest")
    def get_builder_quality(project_id: str):
        _require_builder_v2()
        _builder_project_or_404(project_id)
        result = publish_service.latest_quality(project_id)
        if not result:
            raise HTTPException(status_code=404, detail="no quality run yet")
        return result

    @app.post("/builder/projects/{project_id}/publish")
    def post_builder_publish(
        project_id: str,
        body: PublishRequest,
        request: Request,
    ):
        _require_builder_v2()
        uid = auth.resolve_user_id(request)
        _require_builder_action(project_id, uid, "publish")
        try:
            release = publish_service.publish(
                project_id,
                channel=body.channel,
                version_id=body.versionId,
            )
            return release
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @app.get("/builder/projects/{project_id}/releases")
    def get_builder_releases(project_id: str):
        _require_builder_v2()
        _builder_project_or_404(project_id)
        return publish_service.list_releases(project_id)

    @app.get("/builder/projects/{project_id}/analytics")
    def get_builder_analytics(project_id: str):
        _require_builder_v2()
        _builder_project_or_404(project_id)
        return analytics_repo.summarize(project_id)

    @app.post("/builder/projects/{project_id}/assets/presign")
    def post_builder_asset_presign(project_id: str, body: AssetPresignRequest):
        _require_builder_v2()
        try:
            return asset_service.create_presign(
                project_id,
                filename=body.filename,
                content_type=body.contentType,
                asset_type=body.assetType,
            )
        except asset_service.AssetValidationError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @app.post("/builder/projects/{project_id}/assets/confirm")
    def post_builder_asset_confirm(project_id: str, body: AssetConfirmRequest):
        _require_builder_v2()
        try:
            return asset_service.confirm_upload(
                project_id,
                asset_id=body.assetId,
                s3_key=body.s3Key,
                content_type=body.contentType,
                size_bytes=body.sizeBytes,
                width=body.width,
                height=body.height,
            )
        except asset_service.AssetValidationError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @app.get("/builder/projects/{project_id}/assets")
    def get_builder_assets(project_id: str):
        _require_builder_v2()
        try:
            return asset_service.list_assets(project_id)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @app.get("/projects/{project_id}/knowledge")
    def get_knowledge(project_id: str):
        p = projects.get(project_id)
        if not p:
            raise HTTPException(status_code=404, detail="project not found")
        try:
            return knowledge.read(p)
        except knowledge.KnowledgeError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @app.put("/projects/{project_id}/knowledge")
    def put_knowledge(project_id: str, body: dict):
        p = projects.get(project_id)
        if not p:
            raise HTTPException(status_code=404, detail="project not found")
        try:
            return knowledge.write(p, body)
        except knowledge.KnowledgeError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @app.get("/projects/{project_id}/privacy")
    def get_privacy(project_id: str):
        p = projects.get(project_id)
        if not p:
            raise HTTPException(status_code=404, detail="project not found")
        return {
            "privacy": p.get("privacy", "local_only"),
            "stage_consents": p.get("stage_consents", []),
        }

    @app.put("/projects/{project_id}/privacy")
    def put_privacy(project_id: str, body: PrivacyUpdate):
        p = projects.get(project_id)
        if not p:
            raise HTTPException(status_code=404, detail="project not found")
        p["privacy"] = body.privacy
        if body.stage_consents is not None:
            p["stage_consents"] = body.stage_consents
        all_p = projects.load_all()
        for i, proj in enumerate(all_p):
            if proj["id"] == project_id:
                all_p[i] = p
                break
        from harness.packets import atomic_write_json

        from studio import config as studio_config

        atomic_write_json(studio_config.projects_path(), all_p)
        return {"privacy": p["privacy"], "stage_consents": p["stage_consents"]}

    @app.get("/projects/{project_id}/consent-ledger")
    def get_consent_ledger(project_id: str):
        if not projects.get(project_id):
            raise HTTPException(status_code=404, detail="project not found")
        return consent.read_ledger(project_id)

    @app.get("/projects/{project_id}/stats")
    def get_stats(project_id: str):
        if not projects.get(project_id):
            raise HTTPException(status_code=404, detail="project not found")
        from studio import config as studio_config

        path = studio_config.stats_path(project_id)
        if not os.path.exists(path):
            return {}
        with open(path, encoding="utf-8") as f:
            return json.load(f)

    @app.get("/runs")
    def list_runs_route(project: str):
        if not projects.get(project):
            raise HTTPException(status_code=404, detail="project not found")
        return runs.list_runs(project)

    @app.post("/projects/{project_id}/runs", status_code=201)
    def post_run(project_id: str, body: RunCreate):
        p = projects.get(project_id)
        if not p:
            raise HTTPException(status_code=404, detail="project not found")
        run_data, code = runs.start(p, body.model_dump(exclude_none=True))
        if code == 423:
            raise HTTPException(status_code=423, detail="run already active")
        return {"run_id": run_data["run_id"]}

    @app.get("/runs/{run_id}")
    def get_run(run_id: str):
        return _get_run_or_404(run_id)

    @app.post("/runs/{run_id}/kill")
    def kill_run(run_id: str):
        run = _get_run_or_404(run_id)
        return runs.kill(run)

    @app.post("/runs/{run_id}/resume")
    def resume_run(run_id: str):
        run = _get_run_or_404(run_id)
        try:
            return runs.resume(run)
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

    @app.get("/runs/{run_id}/events")
    async def run_events(run_id: str, request: Request, last_event_id: int = -1):
        run = _get_run_or_404(run_id)
        run_dir = runs.find_run_dir(run_id)
        hdr = request.headers.get("Last-Event-ID")
        if hdr is not None:
            last_event_id = int(hdr)
        return StreamingResponse(
            events.stream_events(run_dir, run, last_event_id),
            media_type="text/event-stream",
        )

    @app.post("/runs/{run_id}/gates/{gate}")
    def post_gate(run_id: str, gate: str, body: GateDecision):
        _get_run_or_404(run_id)
        run_dir = runs.find_run_dir(run_id)
        journal_path = os.path.join(run_dir, "journal.jsonl")
        if not gates.is_gate_open(journal_path, gate):
            raise HTTPException(status_code=409, detail="gate not open")
        gates.write_approval(run_dir, gate, body.decision, body.payload)
        return {"ok": True}

    @app.post("/runs/{run_id}/design")
    def choose_design(run_id: str, body: DesignChoice):
        run = _get_run_or_404(run_id)
        _ensure_build_editing(run)
        project = projects.get(run["project_id"])
        if not project:
            raise HTTPException(status_code=404, detail="project not found")
        run_dir = runs.find_run_dir(run_id)
        source = os.path.join(run_dir, f"draft-{body.variant}.html")
        if not os.path.exists(source):
            raise HTTPException(status_code=404, detail="design variant not found")
        with open(source, encoding="utf-8") as f:
            html = f.read()
        html = draft.sanitize_html(html)
        _, working = _working_path(run_id)
        with open(working, "w", encoding="utf-8") as f:
            f.write(html)
        packets.atomic_write_json(
            os.path.join(run_dir, "draft-choice.json"),
            {"id": body.id, "label": body.label, "variant": body.variant},
        )
        run["task"]["selected_design"] = {
            "id": body.id,
            "label": body.label,
            "variant": body.variant,
        }
        packets.atomic_write_json(os.path.join(run_dir, "run.json"), run)
        cfg = projects.derive_harness_cfg(project, run_id)
        jw = packets.JournalWriter(cfg["journal_path"], run_id)
        jw.emit("design_selected", id=body.id, label=body.label, variant=body.variant)
        jw.emit("edit_session_start", template=body.id, label=body.label)
        return {"html": html}

    @app.get("/runs/{run_id}/working")
    def get_working(run_id: str):
        _get_run_or_404(run_id)
        _, working = _working_path(run_id)
        if not os.path.exists(working):
            raise HTTPException(status_code=404, detail="working draft not found")
        with open(working, encoding="utf-8") as f:
            return {"html": f.read()}

    @app.put("/runs/{run_id}/working")
    def put_working(run_id: str, body: WorkingDraftUpdate):
        run = _get_run_or_404(run_id)
        _ensure_build_editing(run)
        if len(body.html.encode("utf-8")) > 512 * 1024:
            raise HTTPException(status_code=422, detail="working draft exceeds 512KB")
        low = body.html.lower()
        if "<html" not in low or "</html>" not in low:
            raise HTTPException(
                status_code=422, detail="working draft must be full html"
            )
        if re.search(r"(?is)<script\b", body.html):
            raise HTTPException(status_code=422, detail="script tags are not allowed")
        if re.search(r"(?i)\son\w+\s*=", body.html):
            raise HTTPException(
                status_code=422, detail="inline handlers are not allowed"
            )
        if re.search(r"(?i)javascript\s*:", body.html):
            raise HTTPException(
                status_code=422, detail="javascript urls are not allowed"
            )
        run_dir, working = _working_path(run_id)
        with open(working, "w", encoding="utf-8") as f:
            f.write(draft.sanitize_html(body.html))
        _append_edit_log(run_dir, "manual")
        project = projects.get(run["project_id"])
        cfg = projects.derive_harness_cfg(project, run_id)
        packets.JournalWriter(cfg["journal_path"], run_id).emit(
            "edit_applied", source="manual"
        )
        return {"ok": True}

    @app.post("/runs/{run_id}/edit")
    def edit_working(run_id: str, body: EditRequest):
        run = _get_run_or_404(run_id)
        _ensure_build_editing(run)
        project = projects.get(run["project_id"])
        if not project:
            raise HTTPException(status_code=404, detail="project not found")
        run_dir, working = _working_path(run_id)
        if not os.path.exists(working):
            raise HTTPException(status_code=404, detail="working draft not found")
        with open(working, encoding="utf-8") as f:
            html = f.read()
        style_reference_html = None
        choice = draft.read_choice(run_dir)
        if isinstance(choice, dict):
            raw_variant = choice.get("variant")
            variant = (
                raw_variant
                if isinstance(raw_variant, int)
                else int(raw_variant)
                if isinstance(raw_variant, str) and raw_variant.isdigit()
                else None
            )
            if variant is not None:
                source = os.path.join(run_dir, f"draft-{variant}.html")
                if os.path.exists(source):
                    with open(source, encoding="utf-8") as f:
                        style_reference_html = f.read()
        try:
            provider, model = _planner_provider(project, run_id)
            edited = draft.refine(
                provider,
                model,
                html,
                body.prompt,
                style_reference_html=style_reference_html,
            )
        except consent.PrivacyViolation as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"edit failed: {exc}") from exc
        if not edited:
            raise HTTPException(status_code=502, detail="model returned invalid html")
        with open(working, "w", encoding="utf-8") as f:
            f.write(edited)
        _append_edit_log(run_dir, "chat", prompt=body.prompt)
        cfg = projects.derive_harness_cfg(project, run_id)
        packets.JournalWriter(cfg["journal_path"], run_id).emit(
            "edit_applied", source="chat", prompt=body.prompt
        )
        return {"html": edited}

    @app.post("/runs/{run_id}/ship")
    def ship_run(run_id: str):
        run = _get_run_or_404(run_id)
        try:
            updated = runs.ship(run)
            return {"run_id": updated["run_id"], "state": updated["state"]}
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

    @app.get("/runs/{run_id}/draft")
    def get_draft(run_id: str, v: str = "0"):
        _get_run_or_404(run_id)
        run_dir = runs.find_run_dir(run_id)
        fname = (
            "working.html"
            if v == "working"
            else "draft-custom.html"
            if v == "custom"
            else f"draft-{v if v.isdigit() else 0}.html"
        )
        path = os.path.join(run_dir, fname)
        if not os.path.exists(path):
            path = os.path.join(run_dir, "draft.html")
        if not os.path.exists(path):
            raise HTTPException(status_code=404, detail="no draft")
        with open(path, encoding="utf-8") as f:
            return HTMLResponse(
                f.read(),
                headers={
                    # drafts render user-derived text; never let them script
                    "Content-Security-Policy": "sandbox allow-same-origin",
                },
            )

    @app.get("/runs/{run_id}/packets")
    def list_packets(run_id: str):
        run = _get_run_or_404(run_id)
        run_dir = runs.find_run_dir(run_id)
        task_id = run["task"]["id"]
        pdir = os.path.join(run_dir, "packets", task_id)
        if not os.path.isdir(pdir):
            return []
        out = []
        for name in sorted(os.listdir(pdir)):
            if not name.endswith(".json"):
                continue
            with open(os.path.join(pdir, name), encoding="utf-8") as f:
                pkt = json.load(f)
            out.append({"name": name, "kind": pkt.get("kind", ""), "ts": pkt.get("ts")})
        return out

    @app.get("/runs/{run_id}/packets/{name}")
    def get_packet(run_id: str, name: str):
        run = _get_run_or_404(run_id)
        run_dir = runs.find_run_dir(run_id)
        task_id = run["task"]["id"]
        if "/" in name or "\\" in name or ".." in name:
            raise HTTPException(status_code=404, detail="packet not found")
        if not name.endswith((".json", ".md")):
            name = name.lower() + ".json"  # kind ("PLAN") -> filename
        path = os.path.join(run_dir, "packets", task_id, name)
        if not os.path.exists(path):
            raise HTTPException(status_code=404, detail="packet not found")
        with open(path, encoding="utf-8") as f:
            if name.endswith(".md"):
                return PlainTextResponse(f.read(), media_type="text/markdown")
            return json.load(f)

    @app.get("/runs/{run_id}/journal")
    def get_journal(run_id: str):
        _get_run_or_404(run_id)
        run_dir = runs.find_run_dir(run_id)
        return packets.journal_read(os.path.join(run_dir, "journal.jsonl"))

    @app.get("/runs/{run_id}/diff")
    def get_diff(run_id: str):
        run = _get_run_or_404(run_id)
        project = projects.get(run["project_id"])
        cfg = projects.derive_harness_cfg(project, run_id)
        task_id = run["task"]["id"]
        wt = os.path.join(cfg["worktree_root"], task_id)
        if os.path.isdir(wt):
            text = gitops.diff_text(wt, cfg["integration_branch"])
        elif run["state"] == "shipped":
            text = gitops.git(
                ["show", "--format=", cfg["integration_branch"]], cfg["repo_root"]
            )
        else:
            text = ""
        return {"text": text}

    @app.post("/runs/{run_id}/preview")
    def start_preview(run_id: str):
        run = _get_run_or_404(run_id)
        try:
            return preview.start(run)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @app.get("/runs/{run_id}/preview")
    def get_preview(run_id: str):
        _get_run_or_404(run_id)
        return preview.get_status(run_id)

    @app.delete("/runs/{run_id}/preview")
    def stop_preview(run_id: str):
        _get_run_or_404(run_id)
        return preview.stop(run_id)

    return app

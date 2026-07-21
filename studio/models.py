"""Relational schema for builder-v2 (was MongoDB collections)."""

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import declarative_base

# Portable JSONB: real JSONB on Postgres (indexable/containment), plain JSON on the
# sqlite memory:// test path. Use JSONB_ for every JSON column instead of bare JSON.
JSONB_ = JSON().with_variant(JSONB, "postgresql")

Base = declarative_base()

# JSON columns here are only ever written by full reassignment in Part A. Part B's
# editor patches theme/content JSON in place — wrap those columns with
# MutableDict.as_mutable(JSONB_) before Part B or in-place edits won't persist.


def to_doc(obj):
    """Row -> the exact camelCase dict the repos/services used to return from Mongo.

    Iterates mapper column ATTRIBUTES (not table columns): for Analytics the column
    is named "metadata" but the attribute is metadata_ — getattr(obj, "metadata")
    would return the declarative Base's MetaData registry, not the value.
    """
    if obj is None:
        return None
    from sqlalchemy import inspect as _sa_inspect

    out = {}
    for attr in _sa_inspect(obj.__class__).mapper.column_attrs:
        name = attr.columns[0].name
        if name != "id":
            out[name] = getattr(obj, attr.key)
    return out


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    userId = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String)
    passwordHash = Column(String)
    passwordSalt = Column(String)
    emailVerified = Column(Boolean, default=False)
    createdAt = Column(Float)
    # Part-B (signup/admin/token) columns ship in the initial schema on purpose:
    # nullable/defaulted, so they cost nothing now. Phase 7 is CODE-ONLY.
    phone = Column(String, nullable=True)
    country = Column(String, nullable=True)
    category = Column(String, nullable=True)
    role = Column(String, default="user")
    disabled = Column(Boolean, default=False)
    tokenBalance = Column(Integer, default=100)
    planId = Column(String, nullable=True)


class AuthToken(Base):
    __tablename__ = "auth_tokens"
    id = Column(Integer, primary_key=True)
    tokenHash = Column(String, index=True, nullable=False)
    userId = Column(String, ForeignKey("users.userId"), index=True)
    purpose = Column(String)
    expiresAt = Column(Float)


class Project(Base):
    __tablename__ = "builder_projects"
    id = Column(Integer, primary_key=True)
    projectId = Column(String, unique=True, index=True, nullable=False)
    projectName = Column(String)
    status = Column(String)
    initialPrompt = Column(Text, nullable=True)
    selectedTemplateId = Column(String, nullable=True)
    currentVersionId = Column(String, nullable=True)
    # "local-user" sentinel predates real users — indexed string, deliberately NOT an FK.
    ownerUserId = Column(String, index=True, default="local-user")
    visibility = Column(String, default="private")
    collaborators = Column(JSONB_, default=list)
    createdAt = Column(Float)
    updatedAt = Column(Float)


class Version(Base):
    __tablename__ = "builder_versions"
    id = Column(Integer, primary_key=True)
    versionId = Column(String, index=True, nullable=False)
    projectId = Column(String, ForeignKey("builder_projects.projectId"), index=True)
    label = Column(String)
    trigger = Column(String)
    createdAt = Column(Float)
    snapshotHtml = Column(Text)
    snapshotProfileHash = Column(String)
    s3HtmlKey = Column(String)


class Asset(Base):
    __tablename__ = "project_assets"
    id = Column(Integer, primary_key=True)
    assetId = Column(String, index=True, nullable=False)
    projectId = Column(String, ForeignKey("builder_projects.projectId"), index=True)
    assetType = Column(String)
    filename = Column(String)
    contentType = Column(String)
    s3Key = Column(String)
    status = Column(String, default="pending")
    sizeBytes = Column(Integer, nullable=True)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    uploadedAt = Column(Float, nullable=True)
    createdAt = Column(Float)
    updatedAt = Column(Float)


class BusinessProfile(Base):
    __tablename__ = "businessProfiles"
    id = Column(Integer, primary_key=True)
    projectId = Column(
        String, ForeignKey("builder_projects.projectId"), unique=True, index=True, nullable=False
    )
    brand = Column(JSONB_)
    business = Column(JSONB_)
    location = Column(JSONB_)
    contact = Column(JSONB_)
    design = Column(JSONB_)
    skipped = Column(JSONB_, default=list)
    completeness = Column(JSONB_)
    updatedAt = Column(Float)


class GenTemplate(Base):
    # Per-project generated gallery entries. The item shape is genuinely OPEN, so this
    # is the one table where a JSON doc column beats relational columns. templates_repo
    # flattens `doc` back up on read so the returned dict shape is unchanged.
    __tablename__ = "builder_templates"
    id = Column(Integer, primary_key=True)
    templateId = Column(String, index=True, nullable=False)
    projectId = Column(String, ForeignKey("builder_projects.projectId"), index=True)
    galleryIndex = Column(Integer, default=0)
    generatedAt = Column(Float)
    doc = Column(JSONB_, default=dict)  # full item (htmlContent, name, family, ...)


class Edit(Base):
    __tablename__ = "builder_edits"
    id = Column(Integer, primary_key=True)
    editId = Column(String, index=True, nullable=False)
    projectId = Column(String, ForeignKey("builder_projects.projectId"), index=True)
    versionId = Column(String, nullable=True)
    ts = Column(Float)
    actor = Column(String)
    source = Column(String)
    userPrompt = Column(Text, nullable=True)
    actionSummary = Column(Text, nullable=True)
    changeScope = Column(String)
    targets = Column(JSONB_, default=list)


class Conversation(Base):
    __tablename__ = "conversations"
    id = Column(Integer, primary_key=True)
    projectId = Column(
        String, ForeignKey("builder_projects.projectId"), unique=True, index=True, nullable=False
    )
    turns = Column(JSONB_, default=list)


class Analytics(Base):
    __tablename__ = "builder_analytics"
    id = Column(Integer, primary_key=True)
    eventId = Column(String, index=True, nullable=False)
    projectId = Column(String, ForeignKey("builder_projects.projectId"), index=True)
    eventType = Column(String)
    # 'metadata' is reserved on declarative Base; column name stays "metadata".
    metadata_ = Column("metadata", JSONB_, default=dict)
    ts = Column(Float)


class WorkingHtml(Base):
    __tablename__ = "builder_working_html"
    id = Column(Integer, primary_key=True)
    projectId = Column(
        String, ForeignKey("builder_projects.projectId"), unique=True, index=True, nullable=False
    )
    html = Column(Text)
    selectedTemplateId = Column(String, nullable=True)
    updatedAt = Column(Float)


class Release(Base):
    __tablename__ = "builder_releases"
    id = Column(Integer, primary_key=True)
    releaseId = Column(String, index=True, nullable=False)
    projectId = Column(String, ForeignKey("builder_projects.projectId"), index=True)
    channel = Column(String)
    versionId = Column(String, nullable=True)
    status = Column(String)
    createdAt = Column(Float)


class Quality(Base):
    __tablename__ = "builder_quality"
    id = Column(Integer, primary_key=True)
    projectId = Column(String, ForeignKey("builder_projects.projectId"), index=True)
    result = Column(JSONB_)
    ts = Column(Float)


class Meta(Base):
    __tablename__ = "meta"
    key = Column(String, primary_key=True)  # was Mongo _id (e.g. "legacy_adoption")
    value = Column(JSONB_)

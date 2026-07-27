import { Prisma } from "@/generated/prisma/client";
import { prisma } from "../db";
import { toDoc } from "./doc";
import { randomId } from "../ids";

const SITE_COLUMNS = new Set([
  "siteId",
  "userId",
  "templateId",
  "templateVersion",
  "businessProfileJson",
  "contentJson",
  "themeJson",
  "chatHistoryJson",
  "status",
  "subdomain",
  "customDomain",
  "createdAt",
  "updatedAt",
]);

export type SiteDoc = Record<string, unknown> & {
  siteId: string;
  userId: string;
};

const SLUG_RE = /[^a-z0-9]+/g;

function slug(name: string): string {
  const s = name
    .toLowerCase()
    .trim()
    .replace(SLUG_RE, "-")
    .slice(0, 24)
    .replace(/^-+|-+$/g, "");
  return s || "site";
}

async function uniqueSiteId(base: string): Promise<string> {
  let sid = base;
  let n = 2;
  while (await prisma().site.findFirst({ where: { siteId: sid } })) {
    const suffix = `-${n}`;
    sid = (base.slice(0, 24 - suffix.length) + suffix).replace(/^-+|-+$/g, "");
    n += 1;
  }
  return sid;
}

export async function create(
  userId: string,
  input: {
    siteId?: string | null;
    businessProfileJson?: Record<string, unknown> | null;
    templateId?: string | null;
    subdomain?: string | null;
    chatHistoryJson?: unknown[] | null;
  } = {},
): Promise<SiteDoc> {
  const profile = input.businessProfileJson ?? {};
  const name =
    String((profile.brand as Record<string, unknown> | undefined)?.brandName ?? "") ||
    String((profile.business as Record<string, unknown> | undefined)?.type ?? "") ||
    String((profile as Record<string, unknown>).business_name ?? "") ||
    "site";
  const now = Date.now() / 1000;
  const chatHistory = Array.isArray(input.chatHistoryJson) ? input.chatHistoryJson : [];

  // Reuse an explicit client siteId when it already exists for this user (idempotent draft).
  const requestedId = typeof input.siteId === "string" ? input.siteId.trim() : "";
  if (requestedId) {
    const existing = await prisma().site.findFirst({ where: { siteId: requestedId } });
    if (existing) {
      if (existing.userId !== userId) {
        throw new Error("siteId is already taken");
      }
      return toDoc(existing) as SiteDoc;
    }
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const siteId =
        requestedId && attempt === 0 ? requestedId : await uniqueSiteId(slug(name));
      const row = await prisma().site.create({
        data: {
          siteId,
          userId,
          templateId: input.templateId ?? null,
          templateVersion: null,
          businessProfileJson: (profile as Prisma.InputJsonValue) ?? {},
          contentJson: {},
          themeJson: {},
          chatHistoryJson: chatHistory as Prisma.InputJsonValue,
          status: "draft",
          subdomain: input.subdomain ?? null,
          customDomain: null,
          createdAt: now,
          updatedAt: now,
        },
      });
      return toDoc(row) as SiteDoc;
    } catch (exc) {
      if (exc instanceof Prisma.PrismaClientKnownRequestError && exc.code === "P2002") {
        if (requestedId) {
          const raced = await prisma().site.findFirst({ where: { siteId: requestedId } });
          if (raced && raced.userId === userId) return toDoc(raced) as SiteDoc;
        }
        continue;
      }
      throw exc;
    }
  }
  throw new Error("could not allocate a unique siteId");
}

export async function listForUser(userId: string): Promise<SiteDoc[]> {
  const rows = await prisma().site.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map((row) => toDoc(row) as SiteDoc);
}

export async function get(siteId: string): Promise<SiteDoc | null> {
  const row = await prisma().site.findFirst({ where: { siteId } });
  return toDoc(row) as SiteDoc | null;
}

export async function getBySubdomain(subdomain: string): Promise<SiteDoc | null> {
  const row = await prisma().site.findFirst({ where: { subdomain } });
  return toDoc(row) as SiteDoc | null;
}

export async function updateFields(
  siteId: string,
  fields: Record<string, unknown>,
): Promise<SiteDoc | null> {
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (SITE_COLUMNS.has(key)) patch[key] = value;
  }
  patch.updatedAt = Date.now() / 1000;
  await prisma().site.updateMany({
    where: { siteId },
    data: patch as Prisma.SiteUpdateManyMutationInput,
  });
  return get(siteId);
}

export async function remove(siteId: string): Promise<boolean> {
  const result = await prisma().site.deleteMany({ where: { siteId } });
  return result.count > 0;
}

export async function createVersion(
  siteId: string,
  input: { contentJson?: Record<string, unknown>; themeJson?: Record<string, unknown>; label?: string },
): Promise<Record<string, unknown>> {
  const now = Date.now() / 1000;
  const row = await prisma().siteVersion.create({
    data: {
      versionId: `ver-${randomId()}`,
      siteId,
      contentJson: (input.contentJson ?? {}) as Prisma.InputJsonValue,
      themeJson: (input.themeJson ?? {}) as Prisma.InputJsonValue,
      label: input.label ?? "auto",
      createdAt: now,
    },
  });
  return toDoc(row) as Record<string, unknown>;
}

export async function listVersions(siteId: string): Promise<Record<string, unknown>[]> {
  const rows = await prisma().siteVersion.findMany({
    where: { siteId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((row) => toDoc(row) as Record<string, unknown>);
}

export async function getVersion(versionId: string): Promise<Record<string, unknown> | null> {
  const row = await prisma().siteVersion.findFirst({ where: { versionId } });
  return toDoc(row) as Record<string, unknown> | null;
}

export async function restoreVersion(
  siteId: string,
  versionId: string,
): Promise<{ site: SiteDoc; restoredFrom: string; snapshotVersionId: string }> {
  const version = await getVersion(versionId);
  if (!version || version.siteId !== siteId) throw new Error("version not found");

  const snapshot = await createVersion(siteId, {
    contentJson: (version.contentJson as Record<string, unknown>) ?? {},
    themeJson: (version.themeJson as Record<string, unknown>) ?? {},
    label: "pre-restore",
  });

  const updated = await updateFields(siteId, {
    contentJson: version.contentJson,
    themeJson: version.themeJson,
  });
  if (!updated) throw new Error("restore failed");

  return {
    site: updated,
    restoredFrom: versionId,
    snapshotVersionId: String(snapshot.versionId ?? ""),
  };
}

export async function publishAtomic(
  siteId: string,
  input: {
    subdomain: string;
    contentJson: Record<string, unknown>;
    themeJson: Record<string, unknown>;
    templateVersion: string;
  },
): Promise<{ site: SiteDoc; versionId: string }> {
  const now = Date.now() / 1000;
  const versionId = `ver-${randomId()}`;

  const [versionRow] = await prisma().$transaction([
    prisma().siteVersion.create({
      data: {
        versionId,
        siteId,
        contentJson: input.contentJson as Prisma.InputJsonValue,
        themeJson: input.themeJson as Prisma.InputJsonValue,
        label: "publish",
        createdAt: now,
      },
    }),
    prisma().site.updateMany({
      where: { siteId },
      data: {
        status: "published",
        subdomain: input.subdomain,
        templateVersion: input.templateVersion,
        updatedAt: now,
      },
    }),
  ]);

  const site = await get(siteId);
  if (!site) throw new Error("publish update failed");
  return { site, versionId: String(versionRow.versionId) };
}

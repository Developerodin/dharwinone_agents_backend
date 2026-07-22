import { Prisma } from "@/generated/prisma/client";
import { prisma } from "../db";
import { toDoc } from "./doc";

export type ProfileDoc = Record<string, unknown> & { projectId: string };

function emptyProfile(projectId: string): ProfileDoc {
  return {
    projectId,
    brand: { brandName: null, businessName: null, tagline: null },
    business: { type: null, services: [], description: null, targetAudience: null },
    location: { country: null, state: null, city: null, address: null },
    contact: { email: null, phone: null, website: null, socialLinks: [] },
    design: { stylePreference: null },
    skipped: [],
    completeness: { percent: 0, missingFields: [] },
    updatedAt: Date.now() / 1000,
  };
}

export async function get(projectId: string): Promise<ProfileDoc> {
  const row = await prisma().businessProfile.findUnique({ where: { projectId } });
  if (!row) return emptyProfile(projectId);
  const doc = toDoc(row) as ProfileDoc;
  const defaults = emptyProfile(projectId);
  for (const key of ["brand", "business", "location", "contact", "design", "skipped", "completeness"] as const) {
    if (doc[key] == null) doc[key] = defaults[key];
  }
  return doc;
}

export async function save(profile: ProfileDoc): Promise<ProfileDoc> {
  const data = { ...profile, updatedAt: Date.now() / 1000 };
  const { projectId, gate: _gate, ...rest } = data as ProfileDoc & { gate?: unknown };
  const fields = {
    brand: rest.brand as Prisma.InputJsonValue,
    business: rest.business as Prisma.InputJsonValue,
    location: rest.location as Prisma.InputJsonValue,
    contact: rest.contact as Prisma.InputJsonValue,
    design: rest.design as Prisma.InputJsonValue,
    skipped: rest.skipped as Prisma.InputJsonValue,
    completeness: rest.completeness as Prisma.InputJsonValue,
    updatedAt: rest.updatedAt as number,
  };
  await prisma().businessProfile.upsert({
    where: { projectId },
    create: { projectId, ...fields },
    update: fields,
  });
  return get(projectId);
}

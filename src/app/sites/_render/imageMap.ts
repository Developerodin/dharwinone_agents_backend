import type { ResolvedImage } from "@/server/services/imageResolverService";

export type MappedImage = {
  url: string;
  alt: string;
  focalPoint?: { x: number; y: number };
};

export function buildImageMap(resolved: ResolvedImage[]): Record<string, MappedImage[]> {
  const map: Record<string, MappedImage[]> = {};
  for (const img of resolved) {
    if (!img.url) continue;
    const entry: MappedImage = {
      url: img.url,
      alt: img.textLogo ?? img.slotKey,
    };
    const key = img.slotKey;
    if (!map[key]) map[key] = [];
    map[key].push(entry);
  }
  return map;
}

export function makeResolveImage(
  map: Record<string, MappedImage[]>,
): (slotKey: string, index?: number) => MappedImage | null {
  return (slotKey: string, index = 0) => {
    const normalized = slotKey.replace("[]", "");
    const bucket = map[normalized] ?? map[slotKey];
    if (!bucket?.length) return null;
    return bucket[index] ?? bucket[0] ?? null;
  };
}

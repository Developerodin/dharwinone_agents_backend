export function toDoc<T extends { id?: unknown }>(row: T | null): Omit<T, "id"> | null {
  if (!row) return null;
  const { id: _id, ...rest } = row;
  return rest;
}

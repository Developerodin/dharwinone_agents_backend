import { randomBytes } from "node:crypto";

export function randomId(bytes = 6): string {
  return randomBytes(bytes).toString("hex");
}

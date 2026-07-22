import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { databaseUrl } from "./config";

const g = globalThis as unknown as { __dharwinPrisma?: PrismaClient };

export function prisma(): PrismaClient {
  if (!g.__dharwinPrisma) {
    g.__dharwinPrisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl() }),
    });
  }
  return g.__dharwinPrisma;
}

export function setPrismaForTests(client: PrismaClient): void {
  g.__dharwinPrisma = client;
}

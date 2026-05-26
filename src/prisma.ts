import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "@prisma/client";

const databaseUrl = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!databaseUrl) {
  throw new Error("TURSO_DATABASE_URL is not set.");
}

const adapter = new PrismaLibSql({
  url: databaseUrl,
  authToken
});
export const prisma = new PrismaClient({ adapter });

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

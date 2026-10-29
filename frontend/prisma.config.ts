import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
    schema: "prisma/schema.prisma",
    migrations: {
        path: "prisma/migrations",
    },
    datasource: {
        // Prefer the direct connection for migrations; fall back to the application connection.
        url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
        shadowDatabaseUrl: process.env["SHADOW_DATABASE_URL"],
    },
});
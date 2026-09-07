import path from "node:path";
import { config } from "dotenv";
import type { NextConfig } from "next";

// This repository owns a single root-level .env / .env.example (see
// apps/api/prisma.config.ts for the same pattern) -- Next.js only loads
// .env files from its own app directory by default, so the root file is
// loaded explicitly here, before Next collects NEXT_PUBLIC_* values.
config({ path: path.resolve(__dirname, "..", "..", ".env") });

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;

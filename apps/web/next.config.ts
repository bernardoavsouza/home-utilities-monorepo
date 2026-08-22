import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * `standalone` emits a self-contained server with a traced, pruned
   * node_modules — that is what lets the Docker runtime stage carry no pnpm and
   * no install step. It is opt-in via env because `next start` refuses to serve a
   * standalone build, and the Playwright e2e job runs `next start`.
   * `apps/web/Dockerfile` sets NEXT_OUTPUT=standalone.
   */
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  /**
   * File tracing has to start at the monorepo root, or the traced node_modules
   * misses everything hoisted above apps/web — including @packages/contracts.
   * It also shapes the standalone tree, hence apps/web/server.js.
   */
  outputFileTracingRoot: path.join(__dirname, "../.."),
};

export default nextConfig;

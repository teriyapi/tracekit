import path from "node:path";
import type { NextConfig } from "next";

// A stray lockfile in the home directory makes Next infer the wrong workspace
// root, which hangs the first compile. Pin both bundlers to this repo.
const root = path.resolve(__dirname);

const nextConfig: NextConfig = {
  turbopack: { root },
  outputFileTracingRoot: root,
};

export default nextConfig;

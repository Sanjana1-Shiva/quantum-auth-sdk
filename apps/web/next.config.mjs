import path from "path";

const monorepoRoot = path.resolve(process.cwd(), "../../");

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: monorepoRoot,
  turbopack: {
    root: monorepoRoot,
  },
  allowedDevOrigins: [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://172.17.224.108:3000",
  ],
};

export default nextConfig;

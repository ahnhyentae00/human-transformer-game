import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Railway runs the app as a self-hosted Node.js service.
  // Standalone output keeps the production runtime minimal and portable.
  output: "standalone",
};

export default nextConfig;

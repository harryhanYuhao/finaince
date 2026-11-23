import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Stage 1 uses no server-only features, so the app stays static-export compatible.
  reactStrictMode: true,
};

export default nextConfig;

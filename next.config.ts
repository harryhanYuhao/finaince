import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Server routes (src/app/api) proxy market-data sources so API keys stay on the server.
  reactStrictMode: true,
};

export default nextConfig;

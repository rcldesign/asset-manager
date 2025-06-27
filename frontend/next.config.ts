import type { NextConfig } from "next";
import withPWA from '@ducanh2912/next-pwa';

const nextConfig: NextConfig = {
  // Enable standalone output for production Docker builds
  output: 'standalone',
  
  // Only use rewrites in development mode
  // In production, the reverse proxy (Nginx) handles API routing
  async rewrites() {
    if (process.env.NODE_ENV === 'development') {
      return [
        {
          source: '/api/:path*',
          destination: 'http://localhost:3001/api/:path*',
        },
      ];
    }
    return [];
  },
};

const config = withPWA({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
  reloadOnOnline: true,
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  workboxOptions: {
    disableDevLogs: true,
  },
})(nextConfig);

export default config;

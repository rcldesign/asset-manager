import type { NextConfig } from "next";

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

export default nextConfig;

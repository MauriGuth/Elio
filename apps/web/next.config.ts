import type { NextConfig } from "next";

const apiOrigin =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/?$/, "") || "http://localhost:3001";

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },
  async rewrites() {
    return [
      { source: "/uploads/:path*", destination: `${apiOrigin}/uploads/:path*` },
      // Proxy /api/* a la API en Railway cuando NEXT_PUBLIC_API_URL está configurado (Vercel)
      { source: "/api/:path*", destination: `${apiOrigin}/api/:path*` },
    ];
  },
};

export default nextConfig;

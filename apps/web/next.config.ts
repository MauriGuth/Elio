import type { NextConfig } from "next";

const apiUrl =
  process.env.NEXT_PUBLIC_API_URL || process.env.next_public_api_url || "http://localhost:4010/api";
const apiOrigin = apiUrl.replace(/\/api\/?$/, "");

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },
  env: {
    NEXT_PUBLIC_API_URL: apiUrl,
  },
  async rewrites() {
    return [
      { source: "/uploads/:path*", destination: `${apiOrigin}/uploads/:path*` },
    ];
  },
};

export default nextConfig;

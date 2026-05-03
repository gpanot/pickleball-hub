import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
  experimental: {
    // Inline critical CSS and defer non-critical stylesheets, reducing render-blocking CSS
    optimizeCss: true,
  },
};

export default nextConfig;

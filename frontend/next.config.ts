import type { NextConfig } from "next";
import { apiOrigin } from "./lib/api-origin";

const config: NextConfig = {
  async headers() {
    return [{
      source: "/workspace/:path*",
      headers: [{ key: "Cache-Control", value: "private, no-store" }],
    }];
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }];
  },
};

export default config;

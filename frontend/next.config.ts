import type { NextConfig } from "next";
import { apiOrigin } from "./lib/api-origin";

const config: NextConfig = {
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }];
  },
};

export default config;

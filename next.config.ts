import type {
  NextConfig,
} from "next"


const nextConfig:
  NextConfig = {

  output:
    "standalone",

  outputFileTracingIncludes: {
    "/api/*": ["./node_modules/playwright/**/*", "./node_modules/playwright-core/**/*"],
  },
}


export default nextConfig

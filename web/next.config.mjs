/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep verification builds separate from an active development server.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Note: do NOT add @solana/web3.js to serverComponentsExternalPackages. Node would then
  // require() it during page-data collection and choke on rpc-websockets' ESM-only uuid.
  // Letting webpack bundle it works fine (no route handler imports web3.js).
  webpack: (config, { dev }) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: ["**/node_modules/**", "**/.git/**", "**/.next/**"],
      };
    }
    return config;
  },
};

export default nextConfig;

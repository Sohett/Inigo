/** @type {import('next').NextConfig} */
const nextConfig = {
  // @inigo/db ships TypeScript source (no build step); Next transpiles it.
  transpilePackages: ["@inigo/db"]
};

export default nextConfig;

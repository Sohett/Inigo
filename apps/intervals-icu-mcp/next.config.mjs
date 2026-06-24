/** @type {import('next').NextConfig} */
const nextConfig = {
  // Workspace TS packages must be transpiled by Next since they ship raw source.
  transpilePackages: [
    "@inigo/shared-config",
    "@inigo/intervals-icu-client",
    "@inigo/intervals-icu-mcp-tools"
  ]
};

export default nextConfig;

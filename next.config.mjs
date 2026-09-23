/** @type {import('next').NextConfig} */
const nextConfig = {
  // Moved from experimental.serverComponentsExternalPackages (Next.js 15+)
  serverExternalPackages: ["pdf-parse", "mammoth"],
};

export default nextConfig;

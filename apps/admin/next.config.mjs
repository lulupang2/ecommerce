/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  basePath: '/admin',
  trailingSlash: true,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_RUNTIME: 'web' },
  transpilePackages: ['@techzone/ui', '@techzone/api-client'],
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: process.env.CAPACITOR_BUILD === '1' ? 'export' : 'standalone',
  trailingSlash: true,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_RUNTIME: process.env.CAPACITOR_BUILD === '1' ? 'capacitor' : 'web' },
};
export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    appDir: true,
    fetchCache: 'force-no-store',
  },
};

module.exports = nextConfig;
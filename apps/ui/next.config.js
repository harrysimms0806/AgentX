/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/daemon/:path*',
        destination: 'http://127.0.0.1:3001/:path*',
      },
    ];
  },
};

module.exports = nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  // sharp is a native module; keep it out of the server bundle so it loads from node_modules
  serverExternalPackages: ['sharp'],
  // the examples routes read label images from data/ at runtime; ship that folder with them
  outputFileTracingIncludes: {
    '/api/examples': ['./data/**'],
    '/api/examples/batch': ['./data/**'],
  },
  // baseline security headers (no CSP yet -- it needs script-src tuning against next's inline bootstrap)
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};

export default nextConfig;

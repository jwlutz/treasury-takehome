/** @type {import('next').NextConfig} */
const nextConfig = {
  // sharp is a native module; keep it out of the server bundle so it loads from node_modules
  serverExternalPackages: ['sharp'],
  // the examples routes read label images from data/ at runtime; ship that folder with them
  outputFileTracingIncludes: {
    '/api/examples': ['./data/**'],
    '/api/examples/batch': ['./data/**'],
  },
};

export default nextConfig;

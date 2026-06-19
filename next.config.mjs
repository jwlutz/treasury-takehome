/** @type {import('next').NextConfig} */
const nextConfig = {
  // sharp is a native module; keep it out of the server bundle so it loads from node_modules
  serverExternalPackages: ['sharp'],
  // the examples route reads label images from data/ at runtime; ship that folder with the function
  outputFileTracingIncludes: {
    '/api/examples': ['./data/**'],
  },
};

export default nextConfig;

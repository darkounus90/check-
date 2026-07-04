/** @type {import('next').NextConfig} */
const nextConfig = {
  // El lint del monorepo lo maneja ESLint en el pipeline de turbo, no `next build`.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;

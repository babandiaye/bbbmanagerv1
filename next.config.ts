import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['pg', 'bull', 'ioredis'],
  output: 'standalone',
}

export default nextConfig

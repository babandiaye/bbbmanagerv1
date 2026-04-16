import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['pg', 'bull', 'ioredis', 'ssh2', 'cpu-features'],
  output: 'standalone',
}

export default nextConfig

import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // 允许高德地图图片域名
  images: {
    domains: ['aos-comment.amap.com', 'p1.meituan.net'],
  },
}

export default nextConfig

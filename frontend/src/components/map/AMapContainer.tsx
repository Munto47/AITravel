'use client'

import { useEffect, useRef } from 'react'

import type { YjsPlace } from '@/types/room'
import type { Itinerary } from '@/types/itinerary'

interface AMapContainerProps {
  places: YjsPlace[]
  itinerary: Itinerary | null
}

const CLUSTER_COLORS = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6']

/**
 * AMapContainer - 高德地图容器（动态加载，避免 SSR 问题）
 *
 * TODO (Sprint 6 完整实现):
 * 1. 使用 @amap/amap-jsapi-loader 加载高德 JSAPI v2.0
 * 2. 渲染 YjsPlace[] 为 Marker（按 category 区分图标颜色）
 * 3. 按 cluster_id 渲染 Polyline（行程路线连线）
 * 4. 点击 Marker → InfoWindow（地点名 + 评分 + tip）
 * 5. 悬停地点卡片 → Marker 高亮（通过 hoveredPlaceId）
 *
 * 关键注意事项：
 * - 高德 JS API Key 需在控制台配置"Web服务"类型，并添加 localhost:3000 白名单
 * - NEXT_PUBLIC_AMAP_JS_KEY 环境变量存放 Key
 */
export default function AMapContainer({ places, itinerary }: AMapContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<unknown>(null)

  useEffect(() => {
    // TODO: Sprint 6 - 加载高德 JSAPI
    // const AMapLoader = (await import('@amap/amap-jsapi-loader')).default
    // const AMap = await AMapLoader.load({
    //   key: process.env.NEXT_PUBLIC_AMAP_JS_KEY,
    //   version: '2.0',
    // })
    // mapRef.current = new AMap.Map(containerRef.current, {
    //   zoom: 12,
    //   center: [104.066, 30.659],  // 成都
    // })
  }, [])

  useEffect(() => {
    // TODO: Sprint 6 - 更新 Marker 和 Polyline
    // if (!mapRef.current) return
    // 清除已有 Marker...
    // places.forEach(place => 添加 Marker...)
    // 若有 itinerary，按 cluster_id 绘制 Polyline...
  }, [places, itinerary])

  return (
    <div className="w-full h-full rounded-xl overflow-hidden bg-gray-100 relative">
      <div ref={containerRef} className="w-full h-full" />

      {/* 骨架占位：Sprint 6 替换为真实地图 */}
      {!mapRef.current && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
          <div className="text-5xl mb-3">🗺️</div>
          <p className="text-sm font-medium">高德地图</p>
          <p className="text-xs mt-1">Sprint 6 接入</p>

          {/* 显示已选地点数量 */}
          {places.length > 0 && (
            <div className="mt-4 bg-white rounded-xl p-4 shadow-sm max-w-xs w-full mx-4">
              <p className="text-xs text-gray-600 font-medium mb-2">已有 {places.length} 个候选地点</p>
              <div className="space-y-1">
                {places.slice(0, 5).map((p, i) => (
                  <div key={p.placeId} className="flex items-center gap-2 text-xs text-gray-500">
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: CLUSTER_COLORS[p.clusterId || 0] || '#999' }}
                    />
                    <span className="truncate">{p.name}</span>
                  </div>
                ))}
                {places.length > 5 && (
                  <p className="text-xs text-gray-300">...等 {places.length} 个地点</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

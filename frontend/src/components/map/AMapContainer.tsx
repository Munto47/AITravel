'use client'

import { useEffect, useRef, useCallback } from 'react'

import type { YjsPlace } from '@/types/room'
import type { Itinerary } from '@/types/itinerary'

interface AMapContainerProps {
  places: YjsPlace[]
  itinerary: Itinerary | null
}

// 每日簇对应颜色（与行程页面保持一致）
const CLUSTER_COLORS = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#06B6D4']
const CATEGORY_ICON: Record<string, string> = {
  attraction: '🏛',
  food: '🍜',
  hotel: '🏨',
  transport: '🚉',
}

// 默认中心：成都
const DEFAULT_CENTER: [number, number] = [104.066, 30.659]

declare global {
  interface Window {
    _AMapSecurityConfig?: { securityJsCode: string }
    AMap?: unknown
  }
}

export default function AMapContainer({ places, itinerary }: AMapContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  const polylinesRef = useRef<any[]>([])
  const infoWindowRef = useRef<any>(null)

  // 初始化地图
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const jsKey = process.env.NEXT_PUBLIC_AMAP_JS_KEY
    if (!jsKey) {
      console.warn('[AMap] NEXT_PUBLIC_AMAP_JS_KEY 未配置')
      return
    }

    let destroyed = false

    const initMap = async () => {
      try {
        const AMapLoader = (await import('@amap/amap-jsapi-loader')).default
        const AMap = await AMapLoader.load({
          key: jsKey,
          version: '2.0',
          plugins: ['AMap.InfoWindow'],
        })

        if (destroyed || !containerRef.current) return

        const map = new AMap.Map(containerRef.current, {
          zoom: 13,
          center: DEFAULT_CENTER,
          mapStyle: 'amap://styles/normal',
        })

        mapRef.current = map
        infoWindowRef.current = new AMap.InfoWindow({
          offset: new AMap.Pixel(0, -30),
          closeWhenClickMap: true,
        })
      } catch (e) {
        console.error('[AMap] 初始化失败', e)
      }
    }

    initMap()

    return () => {
      destroyed = true
      if (mapRef.current) {
        mapRef.current.destroy()
        mapRef.current = null
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 更新 Marker
  const renderMarkers = useCallback(() => {
    const map = mapRef.current
    if (!map) return

    // 清除旧 Marker
    markersRef.current.forEach((m) => m.setMap(null))
    markersRef.current = []

    if (places.length === 0) return

    const AMap = (window as any).AMap
    if (!AMap) return

    const bounds: [number, number][] = []

    places.forEach((place) => {
      const { lng, lat } = place.coords
      bounds.push([lng, lat])

      const isVoted = place.votedBy.length > 0
      const color = CLUSTER_COLORS[place.clusterId ?? 0] ?? '#6B7280'
      const icon = CATEGORY_ICON[place.category] ?? '📍'

      const markerContent = `
        <div style="
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          cursor: pointer;
        ">
          <div style="
            width: 36px; height: 36px;
            background: ${isVoted ? color : '#9CA3AF'};
            border-radius: 50% 50% 50% 0;
            transform: rotate(-45deg);
            border: 2px solid white;
            box-shadow: 0 2px 8px rgba(0,0,0,0.25);
            display: flex;
            align-items: center;
            justify-content: center;
          ">
            <span style="transform: rotate(45deg); font-size: 16px;">${icon}</span>
          </div>
        </div>`

      const marker = new AMap.Marker({
        position: new AMap.LngLat(lng, lat),
        content: markerContent,
        anchor: 'bottom-center',
        zIndex: isVoted ? 100 : 50,
      })

      marker.on('click', () => {
        const tipHtml = place.ragMeta?.tipSnippets?.[0]
          ? `<p style="color:#92400E;font-size:11px;margin-top:4px;padding:4px 6px;background:#FEF3C7;border-radius:4px">💡 ${place.ragMeta.tipSnippets[0]}</p>`
          : ''
        const ratingHtml = place.amapRating
          ? `<span style="color:#D97706">⭐ ${place.amapRating}</span>`
          : ''
        const priceHtml = place.amapPrice
          ? `<span style="color:#6B7280;margin-left:8px">¥${place.amapPrice}/人</span>`
          : ''

        infoWindowRef.current.setContent(`
          <div style="min-width:180px;max-width:240px;font-family:sans-serif">
            <p style="font-weight:600;font-size:13px;margin:0 0 2px">${place.name}</p>
            <p style="color:#9CA3AF;font-size:11px;margin:0 0 4px">${place.address || ''}</p>
            <div style="font-size:11px">${ratingHtml}${priceHtml}</div>
            ${tipHtml}
          </div>`)
        infoWindowRef.current.open(map, marker.getPosition())
      })

      marker.setMap(map)
      markersRef.current.push(marker)
    })

    // 自适应显示所有地点
    if (bounds.length > 0) {
      map.setFitView(markersRef.current, false, [40, 40, 40, 40])
    }
  }, [places])

  // 更新行程 Polyline
  const renderPolylines = useCallback(() => {
    const map = mapRef.current
    if (!map) return

    polylinesRef.current.forEach((p) => p.setMap(null))
    polylinesRef.current = []

    if (!itinerary) return

    const AMap = (window as any).AMap
    if (!AMap) return

    itinerary.days.forEach((day, dayIdx) => {
      const color = CLUSTER_COLORS[dayIdx % CLUSTER_COLORS.length]
      const path = day.slots.map((slot) => {
        const { lng, lat } = slot.place.coords
        return new AMap.LngLat(lng, lat)
      })

      if (path.length < 2) return

      const polyline = new AMap.Polyline({
        path,
        strokeColor: color,
        strokeWeight: 3,
        strokeOpacity: 0.8,
        strokeStyle: 'solid',
        showDir: true,
        zIndex: 10,
      })
      polyline.setMap(map)
      polylinesRef.current.push(polyline)
    })
  }, [itinerary])

  // 地点变化时重新渲染
  useEffect(() => {
    // 等待地图初始化
    if (!mapRef.current) {
      const timer = setTimeout(renderMarkers, 1500)
      return () => clearTimeout(timer)
    }
    renderMarkers()
  }, [places, renderMarkers])

  // 行程变化时重新渲染
  useEffect(() => {
    if (!mapRef.current) {
      const timer = setTimeout(renderPolylines, 1500)
      return () => clearTimeout(timer)
    }
    renderPolylines()
  }, [itinerary, renderPolylines])

  return (
    <div className="w-full h-full rounded-xl overflow-hidden bg-gray-100 relative">
      <div ref={containerRef} className="w-full h-full" />

      {/* 地图图例（当有行程时显示） */}
      {itinerary && (
        <div className="absolute top-3 right-3 bg-white rounded-lg shadow-md p-2.5 z-10">
          <p className="text-xs font-medium text-gray-600 mb-1.5">行程路线</p>
          {itinerary.days.map((day, idx) => (
            <div key={day.dayIndex} className="flex items-center gap-1.5 mb-1">
              <div
                className="w-6 h-1.5 rounded-full"
                style={{ backgroundColor: CLUSTER_COLORS[idx % CLUSTER_COLORS.length] }}
              />
              <span className="text-xs text-gray-500">第 {day.dayIndex + 1} 天</span>
            </div>
          ))}
        </div>
      )}

      {/* 地点数量统计（无行程时显示）*/}
      {!itinerary && places.length > 0 && (
        <div className="absolute bottom-3 left-3 bg-white bg-opacity-90 rounded-lg shadow-sm px-3 py-1.5 z-10">
          <p className="text-xs text-gray-600">
            已添加 <span className="font-semibold text-blue-600">{places.length}</span> 个地点
            {places.filter((p) => p.votedBy.length > 0).length > 0 &&
              `，已选 ${places.filter((p) => p.votedBy.length > 0).length} 个`}
          </p>
        </div>
      )}
    </div>
  )
}

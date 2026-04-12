'use client'

import { useEffect, useRef, useCallback } from 'react'
import type { YjsPlace } from '@/types/room'
import type { Itinerary } from '@/types/itinerary'

interface AMapContainerProps {
  places: YjsPlace[]
  itinerary: Itinerary | null
}

const CLUSTER_COLORS = ['#FF5A5F', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#06B6D4']
const CATEGORY_ICON: Record<string, string> = {
  attraction: '🏛',
  food: '🍜',
  hotel: '🏨',
  transport: '🚉',
}
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
  // 存放每日的 Driving 实例，用于清除上次路线
  const drivingInstancesRef = useRef<any[]>([])
  const infoWindowRef = useRef<any>(null)

  // ── 初始化地图 ──────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const jsKey = process.env.NEXT_PUBLIC_AMAP_JS_KEY
    if (!jsKey) { console.warn('[AMap] NEXT_PUBLIC_AMAP_JS_KEY 未配置'); return }

    let destroyed = false
    ;(async () => {
      try {
        const AMapLoader = (await import('@amap/amap-jsapi-loader')).default
        const AMap = await AMapLoader.load({
          key: jsKey,
          version: '2.0',
          plugins: ['AMap.InfoWindow', 'AMap.Driving'],
        })
        if (destroyed || !containerRef.current) return

        const map = new AMap.Map(containerRef.current, {
          zoom: 13,
          center: DEFAULT_CENTER,
          mapStyle: 'amap://styles/macaron',
          viewMode: '2D',
        })
        mapRef.current = map
        infoWindowRef.current = new AMap.InfoWindow({
          offset: new AMap.Pixel(0, -30),
          closeWhenClickMap: true,
        })
      } catch (e) { console.error('[AMap] 初始化失败', e) }
    })()

    return () => {
      destroyed = true
      if (mapRef.current) { mapRef.current.destroy(); mapRef.current = null }
    }
  }, []) // eslint-disable-line

  // ── 渲染 Marker ──────────────────────────────────────────────────
  const renderMarkers = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    markersRef.current.forEach((m) => m.setMap(null))
    markersRef.current = []
    if (!places.length) return

    const AMap = (window as any).AMap
    if (!AMap) return

    places.forEach((place) => {
      const { lng, lat } = place.coords
      const isVoted = place.votedBy.length > 0
      const color = CLUSTER_COLORS[place.clusterId ?? 0] ?? '#6B7280'
      const icon = CATEGORY_ICON[place.category] ?? '📍'

      const markerContent = `
        <div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.25))">
          <div style="width:40px;height:40px;background:${isVoted ? color : '#9CA3AF'};border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2.5px solid white;display:flex;align-items:center;justify-content:center">
            <span style="transform:rotate(45deg);font-size:18px">${icon}</span>
          </div>
          <div style="margin-top:4px;background:white;border-radius:6px;padding:1px 6px;font-size:10px;font-weight:600;color:#374151;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.12);max-width:80px;overflow:hidden;text-overflow:ellipsis">${place.name}</div>
        </div>`

      const marker = new AMap.Marker({
        position: new AMap.LngLat(lng, lat),
        content: markerContent,
        anchor: 'bottom-center',
        zIndex: isVoted ? 100 : 50,
      })

      marker.on('click', () => {
        const tipHtml = place.ragMeta?.tipSnippets?.[0]
          ? `<p style="color:#92400E;font-size:11px;margin-top:6px;padding:6px 8px;background:#FEF3C7;border-radius:6px;line-height:1.4">💡 ${place.ragMeta.tipSnippets[0]}</p>`
          : ''
        const photoHtml = place.amapPhotos?.[0]
          ? `<img src="${place.amapPhotos[0]}" style="width:100%;height:80px;object-fit:cover;border-radius:6px;margin-bottom:8px"/>`
          : ''
        infoWindowRef.current.setContent(`
          <div style="min-width:200px;max-width:260px;font-family:Inter,system-ui,sans-serif;padding:2px">
            ${photoHtml}
            <p style="font-weight:700;font-size:14px;margin:0 0 2px;color:#111827">${place.name}</p>
            <p style="color:#9CA3AF;font-size:11px;margin:0 0 6px">${place.address || ''}</p>
            ${place.amapRating ? `<span style="color:#D97706;font-size:12px">⭐ ${place.amapRating}</span>` : ''}
            ${place.amapPrice ? `<span style="color:#6B7280;margin-left:8px;font-size:12px">¥${place.amapPrice}/人</span>` : ''}
            ${tipHtml}
          </div>`)
        infoWindowRef.current.open(map, marker.getPosition())
      })

      marker.setMap(map)
      markersRef.current.push(marker)
    })

    if (markersRef.current.length > 0) {
      map.setFitView(markersRef.current, false, [60, 420, 60, 420])
    }
  }, [places])

  // ── 渲染真实路线（AMap.Driving） ─────────────────────────────────
  const renderRoutes = useCallback(() => {
    const map = mapRef.current
    if (!map) return

    // 清除上轮 Driving 实例
    drivingInstancesRef.current.forEach((d) => {
      try { d.clear() } catch (_) {}
    })
    drivingInstancesRef.current = []

    if (!itinerary) return

    const AMap = (window as any).AMap
    if (!AMap || !AMap.Driving) return

    itinerary.days.forEach((day, dayIdx) => {
      const color = CLUSTER_COLORS[dayIdx % CLUSTER_COLORS.length]
      const slots = day.slots
      if (slots.length < 2) return

      const start = new AMap.LngLat(slots[0].place.coords.lng, slots[0].place.coords.lat)
      const end   = new AMap.LngLat(slots[slots.length - 1].place.coords.lng, slots[slots.length - 1].place.coords.lat)
      const waypoints = slots.slice(1, -1).map(
        (s) => new AMap.LngLat(s.place.coords.lng, s.place.coords.lat)
      )

      // 创建 Driving 实例，不自动渲染（autoFitView:false），我们手动绘制彩色折线
      const driving = new AMap.Driving({
        policy: (AMap as any).DrivingPolicy?.LEAST_TIME ?? 0,
        autoFitView: false,
        hideMarkers: true,
      })

      driving.search(start, end, { waypoints }, (status: string, result: any) => {
        if (status !== 'complete' || !result?.routes?.[0]) return

        // 拼接所有步骤的坐标点 → 真实道路路径
        const path: any[] = []
        result.routes[0].steps.forEach((step: any) => {
          if (step.path) path.push(...step.path)
        })

        if (path.length < 2) return

        const polyline = new AMap.Polyline({
          path,
          strokeColor: color,
          strokeWeight: 5,
          strokeOpacity: 0.85,
          strokeStyle: 'solid',
          showDir: true,
          lineJoin: 'round',
          lineCap: 'round',
          zIndex: 20,
        })
        // 白色描边，视觉上更清晰
        const outline = new AMap.Polyline({
          path,
          strokeColor: '#ffffff',
          strokeWeight: 8,
          strokeOpacity: 0.4,
          zIndex: 19,
        })
        outline.setMap(map)
        polyline.setMap(map)
        // 保存实例以便后续清理（借用 driving 对象挂载 polylines）
        ;(driving as any)._polylines = [outline, polyline]
        driving.clear = () => {
          outline.setMap(null)
          polyline.setMap(null)
        }
      })

      drivingInstancesRef.current.push(driving)
    })
  }, [itinerary])

  // places 变化 → 重绘 Markers
  useEffect(() => {
    if (!mapRef.current) {
      const t = setTimeout(renderMarkers, 1500)
      return () => clearTimeout(t)
    }
    renderMarkers()
  }, [places, renderMarkers])

  // itinerary 变化 → 重绘真实路线
  useEffect(() => {
    if (!mapRef.current) {
      const t = setTimeout(renderRoutes, 1500)
      return () => clearTimeout(t)
    }
    renderRoutes()
  }, [itinerary, renderRoutes])

  return (
    <div className="map-fullscreen">
      <div ref={containerRef} className="w-full h-full" />
    </div>
  )
}

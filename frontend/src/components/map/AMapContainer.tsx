'use client'

import { useEffect, useRef, useCallback } from 'react'
import type { YjsPlace } from '@/types/room'
import type { Itinerary } from '@/types/itinerary'

interface AMapContainerProps {
  places: YjsPlace[]
  itinerary?: Itinerary | null
  tripCity?: string
}

const CLUSTER_COLORS = ['#FF5A5F', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#06B6D4']

// 每天路线的高级配色：珊瑚红 / 水鸭蓝 / 亮橙 / 深紫红 / 琥珀黄
const ROUTE_COLORS = ['#FF5A5F', '#00A699', '#FC642D', '#7B0051', '#FFB400']

const CATEGORY_ICON: Record<string, string> = {
  attraction: '🏛',
  food: '🍜',
  hotel: '🏨',
  transport: '🚉',
}
const DEFAULT_CENTER: [number, number] = [104.066, 30.659]

const CITY_CENTER: Record<string, [number, number]> = {
  '成都': [104.066, 30.659],
  '北京': [116.397, 39.908],
  '上海': [121.473, 31.230],
  '厦门': [118.089, 24.479],
  '广州': [113.264, 23.129],
  '深圳': [114.057, 22.543],
  '杭州': [120.155, 30.274],
  '西安': [108.940, 34.341],
  '重庆': [106.551, 29.563],
}

declare global {
  interface Window {
    _AMapSecurityConfig?: { securityJsCode: string }
    AMap?: unknown
    NEXT_PUBLIC_AMAP_SECURITY_CODE?: string
  }
}

export default function AMapContainer({ places, itinerary, tripCity }: AMapContainerProps) {
  const containerRef    = useRef<HTMLDivElement>(null)
  const mapRef          = useRef<any>(null)
  const markersRef      = useRef<any[]>([])
  const routePolylinesRef = useRef<any[]>([])   // 每次重绘前先清除
  const drivingRef      = useRef<any[]>([])     // Driving 实例，用于 clear()
  const infoWindowRef   = useRef<any>(null)

  // ── 初始化地图（仅运行一次）────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const jsKey = process.env.NEXT_PUBLIC_AMAP_JS_KEY
    if (!jsKey) {
      console.warn('[AMap] NEXT_PUBLIC_AMAP_JS_KEY 未配置')
      return
    }

    let destroyed = false
    ;(async () => {
      try {
        window._AMapSecurityConfig = {
          securityJsCode: process.env.NEXT_PUBLIC_AMAP_SECURITY_CODE ?? '',
        }

        const AMapLoader = (await import('@amap/amap-jsapi-loader')).default
        const AMap = await AMapLoader.load({
          key: jsKey,
          version: '2.0',
          plugins: ['AMap.InfoWindow', 'AMap.Driving'],
        })
        if (destroyed || !containerRef.current) return

        const cityCenter = (tripCity && CITY_CENTER[tripCity]) || DEFAULT_CENTER
        const map = new AMap.Map(containerRef.current, {
          zoom: 13,
          center: cityCenter,
          mapStyle: 'amap://styles/macaron',
          viewMode: '3D',
        })
        mapRef.current = map
        infoWindowRef.current = new AMap.InfoWindow({
          offset: new AMap.Pixel(0, -30),
          closeWhenClickMap: true,
        })
      } catch (e) {
        console.error('[AMap] 初始化失败', e)
      }
    })()

    return () => {
      destroyed = true
      if (mapRef.current) {
        mapRef.current.destroy()
        mapRef.current = null
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 渲染地点 Markers ────────────────────────────────────────────
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
      const icon  = CATEGORY_ICON[place.category] ?? '📍'

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
            ${place.amapPrice  ? `<span style="color:#6B7280;margin-left:8px;font-size:12px">¥${place.amapPrice}/人</span>` : ''}
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

  // ── 渲染多色静态驾车路线 ────────────────────────────────────────
  const renderRoutes = useCallback(() => {
    const map = mapRef.current
    if (!map) return

    // ① 内存清理：移除上一版所有折线和 Driving 实例
    if (routePolylinesRef.current.length > 0) {
      map.remove(routePolylinesRef.current)
      routePolylinesRef.current = []
    }
    drivingRef.current.forEach((d) => { try { d.clear() } catch (_) {} })
    drivingRef.current = []

    if (!itinerary?.days?.length) return

    const AMap = (window as any).AMap
    if (!AMap) return

    // ② 数据预加载：Promise.all 静默获取所有天的路径，不触碰地图
    const pathPromises: Promise<any[]>[] = itinerary.days.map((day, dayIdx) =>
      new Promise<any[]>((resolve) => {
        const slots = day?.slots ?? []
        if (slots.length < 2) {
          resolve([])
          return
        }

        const origin: [number, number]      = [slots[0].place.coords.lng, slots[0].place.coords.lat]
        const destination: [number, number] = [slots[slots.length - 1].place.coords.lng, slots[slots.length - 1].place.coords.lat]
        const waypoints = slots
          .slice(1, -1)
          .map((s: any) => [s.place.coords.lng, s.place.coords.lat] as [number, number])

        // 关键：不传 map 参数，Driving 完全静默，不自动渲染、不抢占视图
        const driving = new AMap.Driving({ hideMarkers: true, autoFitView: false })
        drivingRef.current.push(driving)

        // 错开请求，每天间隔 600ms，避免触发高德 QPS 限制
        setTimeout(() => {
          driving.search(origin, destination, { waypoints }, (status: string, result: any) => {
            if (status === 'complete' && result?.routes?.[0]) {
              const path: any[] = []
              result.routes[0].steps.forEach((step: any) => {
                step.path?.forEach((pt: any) => path.push(pt))
              })
              console.log(`[AMap] 第${dayIdx + 1}天路径节点数：${path.length}`)
              resolve(path)
            } else {
              console.warn(`[AMap] 第${dayIdx + 1}天路线规划失败:`, status)
              resolve([])
            }
          })
        }, dayIdx * 600)
      })
    )

    // ③ 全部到齐后，一次性绘制静态多色折线
    Promise.all(pathPromises).then((allPaths) => {
      const drawn: any[] = []

      allPaths.forEach((path, i) => {
        if (path.length < 2) return

        const polyline = new AMap.Polyline({
          path,
          showDir:       true,                               // 方向箭头
          strokeColor:   ROUTE_COLORS[i % ROUTE_COLORS.length],
          strokeWeight:  8,
          strokeOpacity: 0.8,                               // 允许重叠路段颜色叠加
          lineJoin:      'round',                           // 拐角平滑
          lineCap:       'round',                           // 端点平滑
          zIndex:        20 + i,                            // 后绘制的天数层叠在上
        })
        polyline.setMap(map)
        drawn.push(polyline)
      })

      routePolylinesRef.current = drawn

      // ④ 全局自适应：缩放视角到恰好包含所有路线
      if (drawn.length > 0) {
        map.setFitView(drawn, false, [50, 50, 50, 50])
      }
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

  // itinerary 变化 → 重绘静态路线
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

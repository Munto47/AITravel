'use client'

import { useEffect, useRef, useCallback } from 'react'
import type { YjsPlace } from '@/types/room'
import type { Itinerary } from '@/types/itinerary'

interface AMapContainerProps {
  places: YjsPlace[]
  itinerary: Itinerary | null
  tripCity?: string
}

const CLUSTER_COLORS = ['#FF5A5F', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#06B6D4']
const ROUTE_COLOR = '#FF5A5F'   // 品牌色珊瑚红，全路线统一使用
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
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef        = useRef<any>(null)
  const markersRef    = useRef<any[]>([])
  const drivingInstancesRef = useRef<any[]>([])
  const polylinesRef  = useRef<any[]>([])
  const carMarkersRef = useRef<any[]>([])   // 每天一辆小车
  const infoWindowRef = useRef<any>(null)

  // ── 初始化地图（仅运行一次，完全包裹在 useEffect，避免 SSR 报错）──
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
        // 高德 JS API 2.0 强制要求：在 load 之前注入安全密钥
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
          viewMode: '2D',
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

  // ── 渲染 Markers ──────────────────────────────────────────────────
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

  // ── 渲染真实驾车路线 + 小车动画 ──────────────────────────────────
  const renderRoutes = useCallback(() => {
    const map = mapRef.current
    if (!map) return

    // 清理上一轮所有资源
    drivingInstancesRef.current.forEach((d) => { try { d.clear() } catch (_) {} })
    drivingInstancesRef.current = []
    polylinesRef.current.forEach((p) => { try { p.setMap(null) } catch (_) {} })
    polylinesRef.current = []
    carMarkersRef.current.forEach((m) => { try { m.stopMove(); m.setMap(null) } catch (_) {} })
    carMarkersRef.current = []

    if (!itinerary?.days?.length) return

    const AMap = (window as any).AMap
    if (!AMap) return

    // 确保 AMap.Driving 插件已加载，再进入路线规划逻辑
    AMap.plugin('AMap.Driving', () => {

      // 天间串行：每次回调结束后再启动下一天，避免高德 QPS 打满
      const processDay = (dayIdx: number) => {
        if (dayIdx >= itinerary.days.length) return

        const day  = itinerary.days[dayIdx]
        const slots = day?.slots ?? []

        if (slots.length < 2) {
          // 当天只有 0~1 个地点，无法规划，跳过
          console.log(`[AMap] 第${dayIdx + 1}天地点数不足，跳过`)
          setTimeout(() => processDay(dayIdx + 1), 100)
          return
        }

        // ── 解析起点、终点、途经点（[lng, lat] 数组格式）────────────
        const origin: [number, number] = [
          slots[0].place.coords.lng,
          slots[0].place.coords.lat,
        ]
        const destination: [number, number] = [
          slots[slots.length - 1].place.coords.lng,
          slots[slots.length - 1].place.coords.lat,
        ]
        // 去掉头尾，中间 slots 转为途经点
        const waypoints: [number, number][] = slots
          .slice(1, -1)
          .map((s: any) => [s.place.coords.lng, s.place.coords.lat] as [number, number])

        console.log(`[AMap] 第${dayIdx + 1}天 | 起点:`, origin, '终点:', destination, '途经点:', waypoints)

        // ── 每天一个 Driving 实例，传入 map 让高德自动画线 ──────────
        const driving = new AMap.Driving({
          map,                  // 关键：绑定地图实例，自动绘制路线
          hideMarkers: true,    // 隐藏默认 A/B 图标，用我们自己的 Marker
          autoFitView: false,
        })
        drivingInstancesRef.current.push(driving)

        driving.search(
          origin,
          destination,
          { waypoints },
          (status: string, result: any) => {
            console.log(`第${dayIdx + 1}天路线规划结果:`, status, result)

            if (status === 'complete' && result?.routes?.[0]) {
              // 提取完整路径用于小车动画
              const fullPath: any[] = []
              result.routes[0].steps.forEach((step: any) => {
                if (Array.isArray(step.path)) fullPath.push(...step.path)
              })

              if (fullPath.length >= 2) {
                const carContent = `
                  <div style="
                    width:30px;height:30px;
                    background:${ROUTE_COLOR};
                    border-radius:50%;
                    border:2px solid #fff;
                    box-shadow:0 2px 10px rgba(255,90,95,0.55);
                    display:flex;align-items:center;justify-content:center;
                    font-size:15px;line-height:1;
                  ">🚗</div>`

                const carMarker = new AMap.Marker({
                  position: fullPath[0],
                  content:  carContent,
                  anchor:   'center',
                  zIndex:   200,
                })
                carMarker.setMap(map)
                carMarker.moveAlong(fullPath, {
                  speed:       80,
                  circlable:   true,
                  aniInterval: 10,
                })
                carMarkersRef.current.push(carMarker)
                console.log(`[AMap] 第${dayIdx + 1}天小车动画启动，路径节点数：${fullPath.length}`)
              }
            } else {
              console.error(`[AMap] 第${dayIdx + 1}天路线规划失败:`, result)
            }

            // 500ms 后处理下一天
            setTimeout(() => processDay(dayIdx + 1), 500)
          }
        )
      }

      processDay(0)
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

  // itinerary 变化 → 重绘路线 + 小车动画
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

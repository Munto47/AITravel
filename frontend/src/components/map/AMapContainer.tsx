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
          plugins: ['AMap.InfoWindow', 'AMap.Driving', 'AMap.MoveAnimation'],
        })
        if (destroyed || !containerRef.current) return

        const cityCenter = (tripCity && CITY_CENTER[tripCity]) || DEFAULT_CENTER
        const map = new AMap.Map(containerRef.current, {
          zoom: 13,
          center: cityCenter,
          mapStyle: 'amap://styles/macaron',
          viewMode: '3D',     // 3D 模式支持 pitch 俯仰角，相机跟随必须
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

  // ── 渲染真实驾车路线 + 串行小车动画 ─────────────────────────────
  const renderRoutes = useCallback(() => {
    const map = mapRef.current
    if (!map) return

    // ── 清理上一轮所有资源 ────────────────────────────────────────
    drivingInstancesRef.current.forEach((d) => { try { d.clear() } catch (_) {} })
    drivingInstancesRef.current = []
    polylinesRef.current.forEach((p) => { try { p.setMap(null) } catch (_) {} })
    polylinesRef.current = []
    if (carMarkersRef.current.length > 0) {
      carMarkersRef.current.forEach((m) => { try { m.stopMove() } catch (_) {} })
      try { map.remove(carMarkersRef.current) } catch (_) {}
      carMarkersRef.current = []
    }

    if (!itinerary?.days?.length) return

    const AMap = (window as any).AMap
    if (!AMap) return

    // ── 全局导航常量（在 moving 过程中绝对禁止修改 Zoom / Pitch）──
    const NAV_ZOOM        = 16      // 降低缩放，扩大视野，防眩晕
    const NAV_PITCH       = 45      // 俯仰角，提供 3D 感
    const ANIMATION_SPEED = 12000   // 更平缓的行驶速度
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

    AMap.plugin('AMap.Driving', () => {

      // ══════════════════════════════════════════════════════════════
      // 阶段一：数据预加载（完全静默，绝对不碰地图）
      //   关键：Driving 实例不传 map 参数 → 防止其自动渲染抢占视图
      // ══════════════════════════════════════════════════════════════
      const pathPromises: Promise<any[]>[] = itinerary.days.map((day, dayIdx) =>
        new Promise<any[]>((resolve) => {
          const slots = day?.slots ?? []

          if (slots.length < 2) {
            console.log(`[AMap] 第${dayIdx + 1}天地点数不足，跳过`)
            resolve([])
            return
          }

          const origin: [number, number] = [
            slots[0].place.coords.lng,
            slots[0].place.coords.lat,
          ]
          const destination: [number, number] = [
            slots[slots.length - 1].place.coords.lng,
            slots[slots.length - 1].place.coords.lat,
          ]
          const waypoints = slots
            .slice(1, -1)
            .map((s: any) => [s.place.coords.lng, s.place.coords.lat] as [number, number])

          // 关键：不传 map，静默规划，不触发任何自动渲染或 setFitView
          const driving = new AMap.Driving({
            hideMarkers:  true,
            autoFitView:  false,
          })
          drivingInstancesRef.current.push(driving)

          // 错开发起请求，每天间隔 600ms，避免触发 QPS 限制
          setTimeout(() => {
            driving.search(
              origin,
              destination,
              { waypoints },
              (status: string, result: any) => {
                if (status === 'complete' && result?.routes?.[0]) {
                  const lineArr: any[] = []
                  result.routes[0].steps.forEach((step: any) => {
                    if (Array.isArray(step.path) && step.path.length > 0) {
                      step.path.forEach((pt: any) => lineArr.push(pt))
                    }
                  })
                  console.log(`[AMap] 第${dayIdx + 1}天路径节点数：${lineArr.length}`)
                  resolve(lineArr)
                } else {
                  console.error(`[AMap] 第${dayIdx + 1}天路线规划失败:`, status, result)
                  resolve([])
                }
              }
            )
          }, dayIdx * 600)
        })
      )

      // ══════════════════════════════════════════════════════════════
      // 阶段二 & 三：Promise.all 全部到齐后，进入串行动画引擎
      // ══════════════════════════════════════════════════════════════
      Promise.all(pathPromises).then(async (allDaysPaths) => {

        const validPaths = allDaysPaths.filter((p) => p.length >= 2)
        if (validPaths.length === 0) return

        // 数据全部就绪后，一次性绘制所有天的路线 Polyline
        const routePolylines: any[] = []
        allDaysPaths.forEach((path, i) => {
          if (path.length < 2) return
          const color = CLUSTER_COLORS[i % CLUSTER_COLORS.length]
          const polyline = new AMap.Polyline({
            path,
            showDir:       true,   // 官方文档：显示方向箭头，增强引导感
            strokeColor:   color,
            strokeWeight:  5,
            strokeOpacity: 0.65,
            zIndex:        20,
          })
          polyline.setMap(map)
          polylinesRef.current.push(polyline)
          routePolylines.push(polyline)
        })

        // 整个行程共用一辆小车 + 已走轨迹灰色线
        // 官方文档：autoRotation 不放 Marker 构造参数，放 moveAlong options 才生效
        const carMarker = new AMap.Marker({
          position: validPaths[0][0],
          icon:     'https://a.amap.com/jsapi_demos/static/demo-center-v2/car.png',
          offset:   new AMap.Pixel(-13, -26),   // 匹配图片尺寸 26×13（宽×高）
          zIndex:   200,
        })
        map.add(carMarker)
        carMarkersRef.current.push(carMarker)

        const passedPolyline = new AMap.Polyline({
          strokeColor:   '#AFB3B8',
          strokeWeight:  6,
          strokeOpacity: 0.9,
          zIndex:        21,
        })
        passedPolyline.setMap(map)
        polylinesRef.current.push(passedPolyline)

        // ── 阶段三：严格串行动画引擎（核心）────────────────────────
        const playAllRoutes = async () => {
          for (const [i, path] of allDaysPaths.entries()) {
            if (path.length < 2) continue

            console.log(`[AMap] 第${i + 1}天动画开始`)

            // step 1：小车归位到当天起点，初始化已走轨迹
            carMarker.setPosition(path[0])
            passedPolyline.setPath([path[0]])

            // step 2：平滑就位 —— 单次调用同时完成飞行 + 缩放，无跳跃感
            //   setZoomAndCenter(zoom, center, immediately, duration)
            //   immediately=false → 使用动画过渡；duration=1000 → 1s 飞行
            map.setZoomAndCenter(NAV_ZOOM, path[0], false, 1000)
            map.setPitch(NAV_PITCH)   // 设定俯仰角，仅在起步前设一次

            // step 3：延迟起步 —— 等相机平滑飞到起点完全稳定后再发车
            await sleep(1200)

            // step 4：防抖跟随监听
            //   严禁在此调用 setZoom / setPitch，只允许 setCenter + setRotation
            //   官方文档：用 e.target.getPosition() 获取位置（e.pos 为非文档属性）
            //   setCenter 第二个参数 true = immediately，立即生效，避免插值导致帧滞后
            const onMoving = (e: any) => {
              if (e.passedPath?.length > 0) {
                passedPolyline.setPath(e.passedPath)
              }
              map.setCenter(e.target.getPosition(), true)
              if (e.angle != null) map.setRotation(-e.angle)
            }
            carMarker.on('moving', onMoving)

            // step 5：启动小车
            //   官方文档：autoRotation 必须在 moveAlong opts 里设置，Marker 构造参数无效
            carMarker.moveAlong(path, {
              speed:        ANIMATION_SPEED,
              autoRotation: true,   // 官方文档规定的正确位置
              circlable:    false,
            })

            // step 6：绝对阻塞 —— 死等这一天彻底跑完，再进入下一天
            await new Promise<void>((resolve) => {
              const onMoveEnd = () => {
                carMarker.off('moveend',  onMoveEnd)
                carMarker.off('moving',   onMoving)   // 立即解绑，防止残留帧干扰
                resolve()
              }
              carMarker.on('moveend', onMoveEnd)
            })

            console.log(`[AMap] 第${i + 1}天动画完毕`)

            // step 7：日间停顿
            await sleep(800)
          }

          // ══════════════════════════════════════════════════════════
          // 阶段四：完美收尾
          //   先平滑重置相机姿态，再展示全局全景，避免视角突兀
          // ══════════════════════════════════════════════════════════
          console.log('[AMap] 全程串行动画播放完毕，重置视角')
          map.setPitch(0,    false, 1000)   // noAnimate=false → 1000ms 平滑归零
          map.setRotation(0, false, 1000)

          await sleep(1000)   // 等归零动画结束后再缩放全景

          try {
            const allOverlays = [...markersRef.current, ...routePolylines]
            map.setFitView(allOverlays, false, [50, 50, 50, 50])
          } catch (_) {}
        }

        playAllRoutes()
      })
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

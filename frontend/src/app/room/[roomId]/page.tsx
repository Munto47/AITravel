'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { v4 as uuidv4 } from 'uuid'
import dynamic from 'next/dynamic'
import { AnimatePresence, motion } from 'framer-motion'

import { useYjsRoom } from '@/hooks/useYjsRoom'
import { useAIChat } from '@/hooks/useAIChat'
import { useOptimize } from '@/hooks/useOptimize'
import { useRoomStore } from '@/stores/roomStore'
import TopNav from '@/components/layout/TopNav'
import ChatPanel from '@/components/chat/ChatPanel'
import PlaceList from '@/components/places/PlaceList'
import GlassPanel from '@/components/ui/GlassPanel'

const AMapContainer = dynamic(
  () => import('@/components/map/AMapContainer'),
  {
    ssr: false,
    loading: () => <MapFallback />,
  }
)

// 无 AMAP Key 时的地图占位背景（含城市街道感的渐变）
function MapFallback() {
  return (
    <div className="map-fullscreen bg-gradient-to-br from-slate-200 via-blue-50 to-emerald-50">
      {/* 模拟地图网格纹理 */}
      <svg className="absolute inset-0 w-full h-full opacity-10" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
            <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#64748b" strokeWidth="0.5"/>
          </pattern>
          <pattern id="grid2" width="300" height="300" patternUnits="userSpaceOnUse">
            <path d="M 300 0 L 0 0 0 300" fill="none" stroke="#64748b" strokeWidth="1.5"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
        <rect width="100%" height="100%" fill="url(#grid2)" />
      </svg>
      {/* 模拟道路 */}
      <svg className="absolute inset-0 w-full h-full opacity-20" xmlns="http://www.w3.org/2000/svg">
        <line x1="0" y1="35%" x2="100%" y2="38%" stroke="#94a3b8" strokeWidth="6"/>
        <line x1="0" y1="65%" x2="100%" y2="62%" stroke="#94a3b8" strokeWidth="4"/>
        <line x1="28%" y1="0" x2="30%" y2="100%" stroke="#94a3b8" strokeWidth="6"/>
        <line x1="62%" y1="0" x2="60%" y2="100%" stroke="#94a3b8" strokeWidth="4"/>
        <line x1="0" y1="20%" x2="100%" y2="22%" stroke="#cbd5e1" strokeWidth="2"/>
        <line x1="0" y1="80%" x2="100%" y2="78%" stroke="#cbd5e1" strokeWidth="2"/>
        <line x1="45%" y1="0" x2="47%" y2="100%" stroke="#cbd5e1" strokeWidth="2"/>
      </svg>
    </div>
  )
}

export default function RoomPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const roomId = params.roomId as string

  const [userId] = useState(() => {
    if (typeof window !== 'undefined') {
      let id = localStorage.getItem('userId')
      if (!id) {
        id = uuidv4()
        localStorage.setItem('userId', id)
      }
      return id
    }
    return uuidv4()
  })
  const [nickname] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('nickname') || '旅行者'
    }
    return '旅行者'
  })

  const [roomData, setRoomData] = useState({
    threadId: searchParams.get('threadId') || '',
    tripCity: searchParams.get('city') || '',
    tripDays: Number(searchParams.get('days')) || 0,
    loaded: !!searchParams.get('threadId'),
  })

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

  useEffect(() => {
    if (roomData.loaded) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/room/${roomId}/state`)
        if (!res.ok) throw new Error(`${res.status}`)
        const data = await res.json()
        if (cancelled) return
        setRoomData({
          threadId: data.thread_id || roomId,
          tripCity: data.trip_city || '成都',
          tripDays: data.trip_days || 3,
          loaded: true,
        })
      } catch (e) {
        console.warn('[RoomPage] 获取房间状态失败，使用默认值', e)
        if (!cancelled) {
          setRoomData({ threadId: roomId, tripCity: '成都', tripDays: 3, loaded: true })
        }
      }
    })()
    return () => { cancelled = true }
  }, [roomId, roomData.loaded, API_BASE])

  const threadId = roomData.threadId || roomId
  const tripCity = roomData.tripCity || '成都'
  const tripDays = roomData.tripDays || 3

  // Yjs 协同状态
  const { places, members, phase, isConnected, addPlace, removePlace, toggleVote, setPhase, initRoom } = useYjsRoom(roomId, userId, nickname)

  // AI 聊天
  const { messages, isStreaming, sendMessage } = useAIChat(threadId, userId)

  // 路线优化
  const { itinerary, isOptimizing, optimize } = useOptimize(threadId, roomId)

  const { isChatOpen, tripDays: storeDays, setTripDays, setIsChatOpen } = useRoomStore()

  // 初始化房间元数据
  useEffect(() => {
    setTripDays(tripDays)
    initRoom({ roomId, threadId, tripCity, tripDays })
  }, [roomId]) // eslint-disable-line

  // AI 推荐的地点自动加入工作台
  useEffect(() => {
    const lastMsg = messages[messages.length - 1]
    if (lastMsg?.role === 'assistant' && lastMsg.status === 'done' && lastMsg.placesGenerated) {
      lastMsg.placesGenerated.forEach((place) => {
        if (!places.find((p) => p.placeId === place.placeId)) {
          addPlace(place)
        }
      })
    }
  }, [messages]) // eslint-disable-line

  const handleOptimize = async () => {
    // 任意用户已心形的地点都纳入排线
    const selectedPlaces = places.filter((p) => p.votedBy.length > 0)
    if (selectedPlaces.length < 2) {
      alert('请至少心形选择 2 个地点再进行排线')
      return
    }
    setPhase('optimizing')
    await optimize(selectedPlaces, storeDays || tripDays)
    setPhase('planned')
  }

  // TopNav 显示当前用户自己的心愿数量
  const selectedCount = places.filter((p) => p.votedBy.includes(userId)).length

  return (
    <div className="h-screen w-screen overflow-hidden relative">
      {/* ===== Layer 0: 全屏地图底层 ===== */}
      <AMapContainer places={places} itinerary={itinerary} />

      {/* ===== Layer 1: 浮面板 overlay ===== */}
      <div className="overlay-layer">
        {/* 顶部导航 */}
        <TopNav
          roomId={roomId}
          tripCity={tripCity}
          tripDays={storeDays || tripDays}
          isConnected={isConnected}
          members={members}
          isChatOpen={isChatOpen}
          onToggleChat={() => setIsChatOpen(!isChatOpen)}
          selectedCount={selectedCount}
          isOptimizing={isOptimizing}
          hasItinerary={!!itinerary}
          onOptimize={handleOptimize}
          onViewItinerary={() => router.push(`/room/${roomId}/itinerary`)}
        />

        {/* 下方面板区域 */}
        <div className="flex items-start gap-3 px-4 mt-3" style={{ height: 'calc(100vh - 72px)' }}>
          {/* ===== 左侧：AI Chat 面板 ===== */}
          <AnimatePresence>
            {isChatOpen && (
              <GlassPanel
                solid
                className="overlay-interactive w-[380px] flex-shrink-0 flex flex-col overflow-hidden"
                style={{ height: 'calc(100vh - 84px)' }}
                initial={{ x: -30, opacity: 0, scale: 0.97 }}
                animate={{ x: 0, opacity: 1, scale: 1 }}
                exit={{ x: -30, opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              >
                <ChatPanel
                  messages={messages}
                  isStreaming={isStreaming}
                  onSend={(text) =>
                    sendMessage(
                      text,
                      places.filter((p) => p.votedBy.length > 0).map((p) => p.placeId),
                      tripCity,
                    )
                  }
                />
              </GlassPanel>
            )}
          </AnimatePresence>

          {/* ===== 中间：留白给地图 ===== */}
          <div className="flex-1 min-w-0" />

          {/* ===== 右侧：候选地点/行程 面板 ===== */}
          <GlassPanel
            solid
            className="overlay-interactive w-[360px] flex-shrink-0 flex flex-col overflow-hidden"
            style={{ height: 'calc(100vh - 84px)' }}
            initial={{ x: 30, opacity: 0, scale: 0.97 }}
            animate={{ x: 0, opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, ease: 'easeOut', delay: 0.1 }}
          >
            <PlaceList
              places={places}
              currentUserId={userId}
              members={members}
              itinerary={itinerary}
              onToggleVote={toggleVote}
              onRemove={removePlace}
            />
          </GlassPanel>
        </div>
      </div>
    </div>
  )
}

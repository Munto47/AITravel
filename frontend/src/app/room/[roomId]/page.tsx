'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { v4 as uuidv4 } from 'uuid'
import dynamic from 'next/dynamic'

import { useYjsRoom } from '@/hooks/useYjsRoom'
import { useAIChat } from '@/hooks/useAIChat'
import { useOptimize } from '@/hooks/useOptimize'
import { useRoomStore } from '@/stores/roomStore'
import ChatPanel from '@/components/chat/ChatPanel'
import PlaceList from '@/components/places/PlaceList'

// 地图组件动态加载（避免 SSR 问题）
const AMapContainer = dynamic(
  () => import('@/components/map/AMapContainer'),
  { ssr: false, loading: () => <div className="bg-gray-100 rounded-lg h-full flex items-center justify-center text-gray-400">地图加载中...</div> }
)

export default function RoomPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const roomId = params.roomId as string

  // 从 localStorage 获取用户信息（page.tsx 已保存）
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

  // 房间核心数据：优先从 URL query 获取，缺失时从后端 API 拉取
  const [roomData, setRoomData] = useState({
    threadId: searchParams.get('threadId') || '',
    tripCity: searchParams.get('city') || '',
    tripDays: Number(searchParams.get('days')) || 0,
    loaded: !!searchParams.get('threadId'),
  })

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

  // 如果 URL 中没有 threadId，从后端获取房间状态
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

  // 复制房间链接
  const [copyTip, setCopyTip] = useState(false)
  const handleCopyLink = useCallback(async () => {
    const url = `${window.location.origin}/room/${roomId}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      const input = document.createElement('input')
      input.value = url
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
    }
    setCopyTip(true)
    setTimeout(() => setCopyTip(false), 2000)
  }, [roomId])

  // 初始化房间元数据（只在首次加载时设置，不覆盖已有 phase）
  useEffect(() => {
    setTripDays(tripDays)
    // 仅在 phase 为默认值（exploring）时初始化，避免覆盖协同已更新的状态
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
    const selectedPlaces = places.filter((p) => p.votedBy.length > 0)
    if (selectedPlaces.length < 2) {
      alert('请至少选择 2 个地点再进行排线')
      return
    }
    setPhase('optimizing')
    await optimize(selectedPlaces, storeDays || tripDays)
    setPhase('planned')
  }

  const selectedCount = places.filter((p) => p.votedBy.length > 0).length

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* 顶部栏 */}
      <header className="bg-white border-b border-gray-200 px-3 py-2 flex items-center gap-2">
        {/* 左区：聊天切换 + 房间信息 */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setIsChatOpen(!isChatOpen)}
            className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
            title="切换聊天面板"
          >
            {isChatOpen ? '◀' : '▶ AI'}
          </button>
          <div>
            <span className="font-bold text-gray-900 text-sm">🗺️ {tripCity} {storeDays || tripDays} 天</span>
            <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${isConnected ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              {isConnected ? '● 已连接' : '○ 连接中'}
            </span>
          </div>
        </div>

        {/* 中区：房间号 + 复制 */}
        <div className="flex items-center gap-1.5 flex-1 justify-center">
          <span className="text-xs text-gray-400">房间号</span>
          <code className="text-sm font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded tracking-wider">
            {roomId}
          </code>
          <button
            onClick={handleCopyLink}
            className="text-xs text-gray-400 hover:text-blue-600 transition-colors border border-gray-200 hover:border-blue-300 rounded px-2 py-0.5"
          >
            {copyTip ? '✓ 已复制' : '复制链接'}
          </button>
        </div>

        {/* 右区：在线成员 + 操作按钮 */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* 在线成员头像 */}
          <div className="flex items-center gap-1">
            <div className="flex -space-x-1.5">
              {members.slice(0, 5).map((m) => (
                <div
                  key={m.userId}
                  title={m.nickname}
                  className="w-6 h-6 rounded-full border-2 border-white flex items-center justify-center text-xs text-white font-medium"
                  style={{ backgroundColor: m.color }}
                >
                  {m.nickname[0]}
                </div>
              ))}
            </div>
            <span className="text-xs text-gray-400">{members.length}人</span>
          </div>

          {/* 操作按钮 */}
          {itinerary && (
            <Link href={`/room/${roomId}/itinerary`}>
              <button className="bg-green-600 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-green-700 transition-colors">
                查看行程 →
              </button>
            </Link>
          )}
          <button
            onClick={handleOptimize}
            disabled={isOptimizing || selectedCount < 2}
            className="bg-blue-600 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
            title={selectedCount < 2 ? '请先勾选至少 2 个地点' : ''}
          >
            {isOptimizing
              ? '排线中...'
              : `智能排线${selectedCount > 0 ? `（${selectedCount}个）` : ''}`}
          </button>
        </div>
      </header>

      {/* 主内容区 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧：AI 聊天面板 */}
        {isChatOpen && (
          <div className="w-80 flex-shrink-0 border-r border-gray-200 bg-white flex flex-col">
            <ChatPanel
              messages={messages}
              isStreaming={isStreaming}
              onSend={(text) => sendMessage(
                text,
                places.filter((p) => p.votedBy.length > 0).map((p) => p.placeId),
                tripCity,
              )}
            />
          </div>
        )}

        {/* 中间：地图 */}
        <div className="flex-1 p-3 min-w-0">
          <AMapContainer places={places} itinerary={itinerary} />
        </div>

        {/* 右侧：地点列表 */}
        <div className="w-72 flex-shrink-0 border-l border-gray-200 bg-white overflow-y-auto">
          <PlaceList
            places={places}
            currentUserId={userId}
            members={members}
            onToggleVote={toggleVote}
            onRemove={removePlace}
          />
        </div>
      </div>
    </div>
  )
}

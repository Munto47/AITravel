'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
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

  // 从 URL 参数或 localStorage 获取用户信息
  const [userId] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('userId') || uuidv4()
    }
    return uuidv4()
  })
  const [nickname] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('nickname') || '旅行者'
    }
    return '旅行者'
  })

  const threadId = searchParams.get('threadId') || roomId
  const tripCity = searchParams.get('city') || '成都'
  const tripDays = Number(searchParams.get('days') || 3)

  // Yjs 协同状态
  const { places, members, phase, isConnected, addPlace, removePlace, toggleVote, setPhase, initRoom } = useYjsRoom(roomId, userId, nickname)

  // AI 聊天
  const { messages, isStreaming, sendMessage } = useAIChat(threadId, userId)

  // 路线优化
  const { itinerary, isOptimizing, optimize } = useOptimize(threadId)

  const { isChatOpen, tripDays: storeDays, setTripDays } = useRoomStore()

  // 初始化房间元数据
  useEffect(() => {
    initRoom({ roomId, threadId, tripCity, tripDays, phase: 'exploring', createdAt: new Date().toISOString() })
    setTripDays(tripDays)
  }, [roomId, threadId, tripCity, tripDays]) // eslint-disable-line

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
    const votedPlaces = places.filter((p) => p.votedBy.length > 0)
    if (votedPlaces.length < 2) {
      alert('请至少选择 2 个地点再进行排线')
      return
    }
    setPhase('optimizing')
    await optimize(votedPlaces, storeDays)
    setPhase('planned')
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* 顶部栏 */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-bold text-gray-900">🗺️ {tripCity} {storeDays} 天旅行规划</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${isConnected ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            {isConnected ? '已连接' : '连接中...'}
          </span>
        </div>

        {/* 在线成员头像 */}
        <div className="flex items-center gap-2">
          <div className="flex -space-x-2">
            {members.map((m) => (
              <div
                key={m.userId}
                title={m.nickname}
                className="w-7 h-7 rounded-full border-2 border-white flex items-center justify-center text-xs text-white font-medium"
                style={{ backgroundColor: m.color }}
              >
                {m.nickname[0]}
              </div>
            ))}
          </div>
          <span className="text-xs text-gray-500">{members.length} 人在线</span>
        </div>

        {/* 排线按钮 */}
        <button
          onClick={handleOptimize}
          disabled={isOptimizing}
          className="bg-blue-600 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {isOptimizing ? '排线中...' : `智能排线（${storeDays}天）`}
        </button>
      </header>

      {/* 主内容区 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧：AI 聊天面板 */}
        {isChatOpen && (
          <div className="w-80 flex-shrink-0 border-r border-gray-200 bg-white flex flex-col">
            <ChatPanel
              messages={messages}
              isStreaming={isStreaming}
              onSend={(text) => sendMessage(text, places.filter((p) => p.votedBy.length > 0).map((p) => p.placeId))}
            />
          </div>
        )}

        {/* 中间：地图 */}
        <div className="flex-1 p-3">
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

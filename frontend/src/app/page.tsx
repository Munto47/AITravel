'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { nanoid } from 'nanoid'
import { v4 as uuidv4 } from 'uuid'

export default function HomePage() {
  const router = useRouter()
  const [joinRoomId, setJoinRoomId] = useState('')
  const [nickname, setNickname] = useState('')
  const [city, setCity] = useState('成都')
  const [days, setDays] = useState(3)
  const [isCreating, setIsCreating] = useState(false)

  const handleCreateRoom = async () => {
    if (!nickname.trim()) return alert('请输入昵称')
    setIsCreating(true)

    const roomId = nanoid(8)
    const threadId = uuidv4()

    // 保存到 localStorage
    localStorage.setItem('userId', uuidv4())
    localStorage.setItem('nickname', nickname.trim())

    // 通知后端创建房间
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/room`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_id: roomId,
          thread_id: threadId,
          trip_city: city,
          trip_days: days,
        }),
      })
    } catch (e) {
      console.warn('后端创建房间失败，继续本地流程', e)
    }

    router.push(`/room/${roomId}?threadId=${threadId}&city=${encodeURIComponent(city)}&days=${days}`)
  }

  const handleJoinRoom = () => {
    if (!nickname.trim()) return alert('请输入昵称')
    if (!joinRoomId.trim()) return alert('请输入房间号')
    localStorage.setItem('userId', uuidv4())
    localStorage.setItem('nickname', nickname.trim())
    router.push(`/room/${joinRoomId.trim()}`)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">🗺️ 旅行协同规划</h1>
          <p className="text-gray-500 text-sm">AI 驱动 · 多人协同 · 智能排线</p>
        </div>

        {/* 昵称输入 */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">你的昵称</label>
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="旅行者"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* 创建房间 */}
        <div className="border border-gray-200 rounded-xl p-4 mb-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">创建新旅行规划</h2>
          <div className="flex gap-2 mb-3">
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">目的地城市</label>
              <select
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option>成都</option>
                <option>北京</option>
                <option>上海</option>
                <option>厦门</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">天数</label>
              <select
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {[2, 3, 4, 5, 7].map((d) => (
                  <option key={d} value={d}>{d} 天</option>
                ))}
              </select>
            </div>
          </div>
          <button
            onClick={handleCreateRoom}
            disabled={isCreating}
            className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {isCreating ? '创建中...' : '创建协同房间'}
          </button>
        </div>

        {/* 加入已有房间 */}
        <div className="border border-gray-200 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">加入已有房间</h2>
          <div className="flex gap-2">
            <input
              type="text"
              value={joinRoomId}
              onChange={(e) => setJoinRoomId(e.target.value)}
              placeholder="输入房间号"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleJoinRoom}
              className="bg-gray-800 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-900 transition-colors"
            >
              加入
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

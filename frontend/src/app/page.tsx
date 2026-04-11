'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { v4 as uuidv4 } from 'uuid'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export default function HomePage() {
  const router = useRouter()
  const [joinRoomId, setJoinRoomId] = useState('')
  const [nickname, setNickname] = useState('')
  const [city, setCity] = useState('成都')
  const [days, setDays] = useState(3)
  const [isCreating, setIsCreating] = useState(false)
  const [isJoining, setIsJoining] = useState(false)
  // 创建成功后显示的房间号
  const [createdRoomInfo, setCreatedRoomInfo] = useState<{ roomId: string; threadId: string } | null>(null)
  const [copyTip, setCopyTip] = useState(false)

  const getOrCreateUserId = (): string => {
    let userId = localStorage.getItem('userId')
    if (!userId) {
      userId = uuidv4()
      localStorage.setItem('userId', userId)
    }
    return userId
  }

  const handleCreateRoom = async () => {
    if (!nickname.trim()) return alert('请输入昵称')
    setIsCreating(true)

    // 6 位纯数字房间码，便于口头告知和手动输入
    const roomId = String(Math.floor(100000 + Math.random() * 900000))
    const threadId = uuidv4()
    const userId = getOrCreateUserId()
    localStorage.setItem('nickname', nickname.trim())

    try {
      // 创建房间，同时注册用户
      await fetch(`${API_BASE}/api/room`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_id: roomId,
          thread_id: threadId,
          trip_city: city,
          trip_days: days,
          user_id: userId,
          nickname: nickname.trim(),
        }),
      })
    } catch (e) {
      console.warn('后端创建房间失败，继续本地流程', e)
    }

    setIsCreating(false)
    setCreatedRoomInfo({ roomId, threadId })
  }

  const handleEnterRoom = () => {
    if (!createdRoomInfo) return
    router.push(
      `/room/${createdRoomInfo.roomId}?threadId=${createdRoomInfo.threadId}&city=${encodeURIComponent(city)}&days=${days}`
    )
  }

  const handleCopyLink = async () => {
    if (!createdRoomInfo) return
    const url = `${window.location.origin}/room/${createdRoomInfo.roomId}`
    try {
      await navigator.clipboard.writeText(url)
      setCopyTip(true)
      setTimeout(() => setCopyTip(false), 2000)
    } catch {
      // fallback
      const input = document.createElement('input')
      input.value = url
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
      setCopyTip(true)
      setTimeout(() => setCopyTip(false), 2000)
    }
  }

  const handleJoinRoom = async () => {
    if (!nickname.trim()) return alert('请输入昵称')
    if (!joinRoomId.trim()) return alert('请输入房间号')
    setIsJoining(true)

    const userId = getOrCreateUserId()
    localStorage.setItem('nickname', nickname.trim())
    const trimmedRoomId = joinRoomId.trim()

    try {
      const res = await fetch(`${API_BASE}/api/room/${trimmedRoomId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, nickname: nickname.trim() }),
      })
      if (!res.ok && res.status === 404) {
        alert(`房间 ${trimmedRoomId} 不存在，请检查房间号`)
        setIsJoining(false)
        return
      }
      const data = await res.json()
      const threadId = data.thread_id || trimmedRoomId
      const roomCity = data.trip_city || ''
      const roomDays = data.trip_days || 3
      router.push(
        `/room/${trimmedRoomId}?threadId=${threadId}${roomCity ? `&city=${encodeURIComponent(roomCity)}` : ''}&days=${roomDays}`
      )
    } catch (e) {
      console.warn('加入房间请求失败，继续本地流程', e)
      router.push(`/room/${trimmedRoomId}`)
    }
    setIsJoining(false)
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
            maxLength={20}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* 创建成功后显示房间号 */}
        {createdRoomInfo ? (
          <div className="border-2 border-green-300 bg-green-50 rounded-xl p-5 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-green-600 text-lg">✓</span>
              <span className="text-sm font-semibold text-green-800">房间创建成功！</span>
            </div>
            <p className="text-xs text-gray-500 mb-1">房间号（分享给朋友）</p>
            <div className="flex items-center gap-2 mb-3">
              <code className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-lg font-mono font-bold text-gray-900 tracking-widest text-center">
                {createdRoomInfo.roomId}
              </code>
              <button
                onClick={handleCopyLink}
                className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg px-3 py-2 transition-colors whitespace-nowrap"
              >
                {copyTip ? '已复制！' : '复制链接'}
              </button>
            </div>
            <p className="text-xs text-gray-400 mb-4">
              目的地：{city} · {days} 天 · 朋友输入房间号即可加入
            </p>
            <button
              onClick={handleEnterRoom}
              className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              进入规划房间 →
            </button>
          </div>
        ) : (
          /* 创建房间表单 */
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
        )}

        {/* 加入已有房间 */}
        <div className="border border-gray-200 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">加入已有房间</h2>
          <div className="flex gap-2">
            <input
              type="text"
              value={joinRoomId}
              onChange={(e) => setJoinRoomId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
              placeholder="输入 6 位房间号"
              maxLength={6}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono tracking-wider"
            />
            <button
              onClick={handleJoinRoom}
              disabled={isJoining}
              className="bg-gray-800 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-900 transition-colors disabled:opacity-50"
            >
              {isJoining ? '加入中...' : '加入'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

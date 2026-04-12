'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { v4 as uuidv4 } from 'uuid'
import { motion, AnimatePresence } from 'framer-motion'
import { Compass, Users, Copy, Check, ArrowRight, Sparkles, Map, Route } from 'lucide-react'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export default function HomePage() {
  const router = useRouter()
  const [joinRoomId, setJoinRoomId] = useState('')
  const [nickname, setNickname] = useState('')
  const [city, setCity] = useState('成都')
  const [days, setDays] = useState(3)
  const [isCreating, setIsCreating] = useState(false)
  const [isJoining, setIsJoining] = useState(false)
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

    const roomId = String(Math.floor(100000 + Math.random() * 900000))
    const threadId = uuidv4()
    const userId = getOrCreateUserId()
    localStorage.setItem('nickname', nickname.trim())

    try {
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
    <div className="min-h-screen bg-gradient-to-br from-coral-50/40 via-white to-blue-50/30 flex items-center justify-center p-4 overflow-auto">
      {/* 背景装饰 */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-coral-100/30 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 -left-20 w-72 h-72 bg-blue-100/30 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md relative z-10"
      >
        {/* Logo + 标题 */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-coral-500 text-white mb-5 shadow-lg shadow-coral-200"
          >
            <Compass className="w-8 h-8" strokeWidth={2} />
          </motion.div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Project Vibe</h1>
          <p className="text-gray-400 text-sm mt-2">AI 驱动 · 多人协同 · 智能排线</p>

          {/* 特性标签 */}
          <div className="flex items-center justify-center gap-3 mt-4">
            {[
              { icon: <Sparkles className="w-3 h-3" />, label: 'LangGraph Agent' },
              { icon: <Users className="w-3 h-3" />, label: 'Yjs 实时协同' },
              { icon: <Route className="w-3 h-3" />, label: 'K-Means TSP' },
            ].map((f) => (
              <span
                key={f.label}
                className="inline-flex items-center gap-1 text-[10px] text-gray-400 bg-gray-50 px-2 py-1 rounded-full border border-gray-100"
              >
                {f.icon}
                {f.label}
              </span>
            ))}
          </div>
        </div>

        {/* 主卡片 */}
        <div className="glass-panel-solid rounded-2xl overflow-hidden shadow-glass">
          {/* 昵称输入 */}
          <div className="px-6 pt-6 pb-4">
            <label className="block text-[11px] font-medium text-gray-500 mb-1.5 uppercase tracking-wider">
              昵称
            </label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="你的旅行代号"
              maxLength={20}
              className="input-glass"
            />
          </div>

          {/* 创建成功后显示房间号 */}
          <AnimatePresence mode="wait">
            {createdRoomInfo ? (
              <motion.div
                key="created"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="px-6 pb-6"
              >
                <div className="bg-emerald-50/80 rounded-xl p-5 border border-emerald-100">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                    <span className="text-sm font-medium text-emerald-800">房间已创建</span>
                  </div>

                  <p className="text-[10px] text-gray-400 mb-1.5 uppercase tracking-wider">房间号</p>
                  <div className="flex items-center gap-2 mb-4">
                    <code className="flex-1 bg-white rounded-xl px-4 py-3 text-2xl font-mono font-bold text-gray-900 tracking-[0.2em] text-center border border-gray-100 shadow-sm">
                      {createdRoomInfo.roomId}
                    </code>
                    <button
                      onClick={handleCopyLink}
                      className="btn-glass text-xs px-3 py-3 flex items-center gap-1"
                    >
                      {copyTip ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  <p className="text-xs text-gray-400 mb-4 text-center">
                    {city} · {days} 天 · 分享房间号邀请朋友
                  </p>

                  <button
                    onClick={handleEnterRoom}
                    className="btn-coral w-full py-3 text-sm flex items-center justify-center gap-2"
                  >
                    进入规划房间
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div key="form" className="px-6 pb-4">
                <div className="flex gap-3 mb-4">
                  <div className="flex-1">
                    <label className="block text-[11px] font-medium text-gray-500 mb-1.5 uppercase tracking-wider">
                      目的地
                    </label>
                    <div className="relative">
                      <Map className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <select
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        className="input-glass pl-8 appearance-none"
                      >
                        <option>成都</option>
                        <option>北京</option>
                        <option>上海</option>
                        <option>厦门</option>
                      </select>
                    </div>
                  </div>
                  <div className="w-24">
                    <label className="block text-[11px] font-medium text-gray-500 mb-1.5 uppercase tracking-wider">
                      天数
                    </label>
                    <select
                      value={days}
                      onChange={(e) => setDays(Number(e.target.value))}
                      className="input-glass appearance-none text-center"
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
                  className="btn-coral w-full py-3 text-sm flex items-center justify-center gap-2"
                >
                  {isCreating ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      创建中...
                    </>
                  ) : (
                    <>
                      创建协同房间
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 分割线 */}
          <div className="mx-6 border-t border-gray-100/60" />

          {/* 加入已有房间 */}
          <div className="px-6 py-5">
            <p className="text-[11px] font-medium text-gray-500 mb-2.5 uppercase tracking-wider">
              加入房间
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={joinRoomId}
                onChange={(e) => setJoinRoomId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
                placeholder="6 位房间号"
                maxLength={6}
                className="input-glass flex-1 font-mono tracking-wider text-center"
              />
              <button
                onClick={handleJoinRoom}
                disabled={isJoining}
                className="btn-glass px-5 py-2.5 text-sm font-medium"
              >
                {isJoining ? (
                  <span className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin block" />
                ) : (
                  '加入'
                )}
              </button>
            </div>
          </div>
        </div>

        {/* 底部 */}
        <p className="text-center text-[11px] text-gray-300 mt-6">
          AI 智能旅行协同规划系统 · 面试 Demo
        </p>
      </motion.div>
    </div>
  )
}

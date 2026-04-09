'use client'

import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'

import type { Itinerary } from '@/types/itinerary'

// TODO (Sprint 6): 从 URL 参数或 localStorage 加载行程数据
// 当前为骨架展示

export default function ItineraryPage() {
  const params = useParams()
  const roomId = params.roomId as string

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <Link href={`/room/${roomId}`} className="text-blue-600 text-sm hover:underline">
          ← 返回工作台
        </Link>
        <h1 className="font-bold text-gray-900">行程详情</h1>
      </header>

      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-white rounded-xl shadow-sm p-6 text-center text-gray-400">
          <p className="text-4xl mb-3">🗓️</p>
          <p className="text-sm">行程尚未生成</p>
          <p className="text-xs mt-1">请返回工作台选择地点后点击「智能排线」</p>
        </div>
      </div>
    </div>
  )
}

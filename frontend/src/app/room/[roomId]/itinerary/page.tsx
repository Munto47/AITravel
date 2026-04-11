'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

import type { Itinerary, DayPlan, TimeSlot } from '@/types/itinerary'

const CATEGORY_ICON: Record<string, string> = {
  attraction: '🏛️',
  food: '🍜',
  hotel: '🏨',
  transport: '🚉',
}

const CATEGORY_LABEL: Record<string, string> = {
  attraction: '景点',
  food: '餐饮',
  hotel: '住宿',
  transport: '交通',
}

const WEATHER_ICON: Record<string, string> = {
  晴: '☀️',
  多云: '⛅',
  阴: '☁️',
  小雨: '🌧️',
  中雨: '🌧️',
  大雨: '⛈️',
  雨: '🌧️',
  雪: '❄️',
  雷: '⛈️',
}

function getWeatherIcon(condition: string): string {
  for (const [key, icon] of Object.entries(WEATHER_ICON)) {
    if (condition.includes(key)) return icon
  }
  return '🌤️'
}

function SlotCard({ slot, isLast }: { slot: TimeSlot; isLast: boolean }) {
  const icon = CATEGORY_ICON[slot.place.category] ?? '📍'
  const label = CATEGORY_LABEL[slot.place.category] ?? slot.place.category

  return (
    <div className="relative">
      {/* 时间轴线 */}
      {!isLast && (
        <div className="absolute left-[19px] top-[52px] w-0.5 h-full bg-gray-200 z-0" />
      )}

      <div className="flex gap-3 relative z-10">
        {/* 时间轴圆点 */}
        <div className="flex flex-col items-center flex-shrink-0">
          <div className="w-10 h-10 rounded-full bg-blue-50 border-2 border-blue-200 flex items-center justify-center text-lg">
            {icon}
          </div>
        </div>

        {/* 内容卡片 */}
        <div className="flex-1 pb-6">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            {/* 时间 + 名称 */}
            <div className="flex items-start justify-between mb-1">
              <div>
                <span className="text-xs text-gray-400 font-mono">
                  {slot.startTime} – {slot.endTime}
                </span>
                <h3 className="font-semibold text-gray-900 text-sm mt-0.5">{slot.place.name}</h3>
              </div>
              <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full flex-shrink-0 ml-2">
                {label}
              </span>
            </div>

            {/* 地址 */}
            {slot.place.address && (
              <p className="text-xs text-gray-400 mt-1 truncate">{slot.place.address}</p>
            )}

            {/* 评分 + 人均 */}
            {(slot.place.amapRating || slot.place.amapPrice) && (
              <div className="flex items-center gap-3 mt-2">
                {slot.place.amapRating && (
                  <span className="text-xs text-amber-600">⭐ {slot.place.amapRating}</span>
                )}
                {slot.place.amapPrice && (
                  <span className="text-xs text-gray-500">人均 ¥{slot.place.amapPrice}</span>
                )}
              </div>
            )}

            {/* RAG 攻略 tip */}
            {slot.place.ragMeta?.tipSnippets?.[0] && (
              <div className="mt-2 p-2 bg-amber-50 rounded-lg border border-amber-100">
                <p className="text-xs text-amber-700 leading-relaxed">
                  💡 {slot.place.ragMeta.tipSnippets[0]}
                </p>
              </div>
            )}
          </div>

          {/* 交通段（→ 下一站） */}
          {!isLast && slot.transport && (
            <div className="flex items-center gap-1.5 mt-2 ml-2 text-xs text-gray-400">
              <span>🚗</span>
              <span>驾车约 {slot.transport.durationMins} 分钟</span>
              <span>·</span>
              <span>{slot.transport.distanceKm} km</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function DaySection({ day }: { day: DayPlan }) {
  const dateLabel = day.date
    ? new Date(day.date).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })
    : null

  return (
    <section className="mb-6">
      {/* Day 标题 */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-lg bg-blue-600 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">
          D{day.dayIndex + 1}
        </div>
        <div>
          <p className="font-bold text-gray-900 text-sm">第 {day.dayIndex + 1} 天</p>
          {dateLabel && <p className="text-xs text-gray-400">{dateLabel}</p>}
        </div>

        {/* 天气卡片 */}
        {day.weatherSummary && (
          <div className="ml-auto flex items-center gap-2 bg-sky-50 border border-sky-100 rounded-lg px-3 py-1.5">
            <span className="text-lg">{getWeatherIcon(day.weatherSummary.condition)}</span>
            <div>
              <p className="text-xs font-medium text-sky-800">
                {day.weatherSummary.condition} {day.weatherSummary.tempLow}°~{day.weatherSummary.tempHigh}°
              </p>
              <p className="text-xs text-sky-600 leading-tight">{day.weatherSummary.suggestion}</p>
            </div>
          </div>
        )}
      </div>

      {/* 时间槽列表 */}
      <div className="ml-1">
        {day.slots.map((slot, idx) => (
          <SlotCard key={slot.placeId} slot={slot} isLast={idx === day.slots.length - 1} />
        ))}
      </div>
    </section>
  )
}

export default function ItineraryPage() {
  const params = useParams()
  const roomId = params.roomId as string

  const [itinerary, setItinerary] = useState<Itinerary | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = localStorage.getItem(`itinerary_${roomId}`)
    if (stored) {
      try {
        setItinerary(JSON.parse(stored))
      } catch (e) {
        console.error('[ItineraryPage] 解析行程数据失败', e)
      }
    }
  }, [roomId])

  const totalPlaces = itinerary?.days.reduce((sum, d) => sum + d.slots.length, 0) ?? 0
  const totalDays = itinerary?.days.length ?? 0

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 sticky top-0 z-20">
        <Link href={`/room/${roomId}`} className="text-blue-600 text-sm hover:underline">
          ← 返回工作台
        </Link>
        <h1 className="font-bold text-gray-900">行程详情</h1>
        {itinerary && (
          <span className="ml-auto text-xs text-gray-400">
            {itinerary.city} · {totalDays} 天 · {totalPlaces} 个地点
          </span>
        )}
      </header>

      <div className="max-w-2xl mx-auto p-4">
        {!itinerary ? (
          /* 空状态 */
          <div className="bg-white rounded-xl shadow-sm p-10 text-center text-gray-400">
            <p className="text-4xl mb-3">🗓️</p>
            <p className="text-sm font-medium">行程尚未生成</p>
            <p className="text-xs mt-1">请返回工作台选择地点后点击「智能排线」</p>
            <Link href={`/room/${roomId}`}>
              <button className="mt-4 bg-blue-600 text-white text-sm px-5 py-2 rounded-lg hover:bg-blue-700 transition-colors">
                返回工作台
              </button>
            </Link>
          </div>
        ) : (
          <>
            {/* 行程概览卡片 */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-500 rounded-xl p-4 mb-5 text-white shadow-md">
              <p className="text-xs opacity-80 mb-1">AI 智能排线结果</p>
              <h2 className="text-xl font-bold mb-3">
                {itinerary.city} {totalDays} 日游
              </h2>
              <div className="flex gap-4 text-sm">
                <div>
                  <p className="opacity-70 text-xs">景点数</p>
                  <p className="font-semibold">{totalPlaces} 个</p>
                </div>
                <div>
                  <p className="opacity-70 text-xs">行程天数</p>
                  <p className="font-semibold">{totalDays} 天</p>
                </div>
                <div>
                  <p className="opacity-70 text-xs">排线算法</p>
                  <p className="font-semibold">K-Means + TSP</p>
                </div>
              </div>
            </div>

            {/* 每日行程 */}
            {itinerary.days.map((day) => (
              <DaySection key={day.dayIndex} day={day} />
            ))}

            {/* 底部版权 */}
            <p className="text-center text-xs text-gray-300 mt-4 pb-6">
              由 AI 智能旅行规划系统生成 · {new Date(itinerary.generatedAt).toLocaleString('zh-CN')}
            </p>
          </>
        )}
      </div>
    </div>
  )
}

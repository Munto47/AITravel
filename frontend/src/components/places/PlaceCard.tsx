'use client'

import type { YjsPlace, RoomMember } from '@/types/room'

interface PlaceCardProps {
  place: YjsPlace
  currentUserId: string
  members: RoomMember[]
  onToggleVote: (placeId: string) => void
  onRemove: (placeId: string) => void
}

export default function PlaceCard({
  place,
  currentUserId,
  members,
  onToggleVote,
  onRemove,
}: PlaceCardProps) {
  const isVoted = place.votedBy.includes(currentUserId)
  const votedMembers = members.filter((m) => place.votedBy.includes(m.userId))

  const categoryLabel: Record<string, string> = {
    attraction: '景点',
    food: '餐饮',
    hotel: '住宿',
    transport: '交通',
  }

  return (
    <div className={`border rounded-xl p-3 transition-all ${isVoted ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white'}`}>
      <div className="flex items-start gap-2">
        {/* 左侧：图片占位或第一张图片 */}
        <div className="w-14 h-14 flex-shrink-0 rounded-lg bg-gray-100 overflow-hidden">
          {place.amapPhotos[0] ? (
            <img src={place.amapPhotos[0]} alt={place.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-2xl">
              {place.category === 'food' ? '🍜' : place.category === 'hotel' ? '🏨' : '🏛️'}
            </div>
          )}
        </div>

        {/* 中间：信息 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">
              {categoryLabel[place.category] || place.category}
            </span>
            {place.amapRating && (
              <span className="text-xs text-yellow-500">★ {place.amapRating}</span>
            )}
            {place.amapPrice && (
              <span className="text-xs text-gray-400">¥{place.amapPrice}/人</span>
            )}
          </div>
          <div className="font-medium text-sm text-gray-900 mt-0.5 truncate">{place.name}</div>
          <div className="text-xs text-gray-400 truncate">{place.address}</div>

          {/* RAG 避坑提示 */}
          {place.ragMeta?.tipSnippets?.[0] && (
            <div className="mt-1.5 text-xs text-yellow-700 bg-yellow-50 rounded px-2 py-1 border border-yellow-100">
              💡 {place.ragMeta.tipSnippets[0]}
            </div>
          )}

          {/* 成员投票徽章 */}
          {votedMembers.length > 0 && (
            <div className="flex -space-x-1 mt-1.5">
              {votedMembers.map((m) => (
                <div
                  key={m.userId}
                  title={m.nickname}
                  className="w-5 h-5 rounded-full border border-white flex items-center justify-center text-xs text-white"
                  style={{ backgroundColor: m.color }}
                >
                  {m.nickname[0]}
                </div>
              ))}
              <span className="text-xs text-gray-400 ml-1.5 self-center">
                {votedMembers.length}人选择
              </span>
            </div>
          )}
        </div>

        {/* 右侧：勾选按钮 */}
        <button
          onClick={() => onToggleVote(place.placeId)}
          className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
            isVoted
              ? 'bg-blue-600 border-blue-600 text-white'
              : 'border-gray-300 text-transparent hover:border-blue-400'
          }`}
        >
          ✓
        </button>
      </div>

      {/* 删除按钮（仅添加者可见）*/}
      {place.addedBy === currentUserId && (
        <button
          onClick={() => onRemove(place.placeId)}
          className="mt-2 text-xs text-gray-400 hover:text-red-500 transition-colors"
        >
          移除
        </button>
      )}
    </div>
  )
}

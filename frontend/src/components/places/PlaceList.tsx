'use client'

import type { YjsPlace, RoomMember } from '@/types/room'
import PlaceCard from './PlaceCard'

interface PlaceListProps {
  places: YjsPlace[]
  currentUserId: string
  members: RoomMember[]
  onToggleVote: (placeId: string) => void
  onRemove: (placeId: string) => void
}

export default function PlaceList({ places, currentUserId, members, onToggleVote, onRemove }: PlaceListProps) {
  const votedCount = places.filter((p) => p.votedBy.length > 0).length

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">候选地点</h2>
        <span className="text-xs text-gray-400">{votedCount}/{places.length} 已选</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {places.length === 0 ? (
          <div className="text-center text-gray-400 text-xs mt-8">
            <p className="text-2xl mb-2">📍</p>
            <p>向 AI 提问以获取地点推荐</p>
          </div>
        ) : (
          places.map((place) => (
            <PlaceCard
              key={place.placeId}
              place={place}
              currentUserId={currentUserId}
              members={members}
              onToggleVote={onToggleVote}
              onRemove={onRemove}
            />
          ))
        )}
      </div>
    </div>
  )
}

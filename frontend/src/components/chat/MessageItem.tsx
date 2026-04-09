'use client'

import type { ChatMessage } from '@/types/chat'
import PlaceCard from '@/components/places/PlaceCard'
import type { YjsPlace } from '@/types/room'

interface MessageItemProps {
  message: ChatMessage
}

export default function MessageItem({ message }: MessageItemProps) {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="bg-blue-600 text-white text-sm rounded-2xl rounded-tr-sm px-3 py-2 max-w-[85%]">
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {/* AI 文字回复 */}
      {message.content && (
        <div className="bg-gray-100 text-gray-800 text-sm rounded-2xl rounded-tl-sm px-3 py-2 max-w-[95%]">
          {message.content}
          {message.status === 'streaming' && (
            <span className="inline-block w-1 h-4 bg-gray-500 ml-0.5 animate-pulse" />
          )}
        </div>
      )}

      {/* 推荐地点卡片 */}
      {message.placesGenerated && message.placesGenerated.length > 0 && (
        <div className="space-y-2">
          {message.placesGenerated.map((place) => (
            <div key={place.placeId} className="text-xs text-gray-500 bg-gray-50 rounded-lg p-2 border border-gray-200">
              <div className="font-medium text-gray-800">{place.name}</div>
              <div className="text-gray-400 mt-0.5">{place.address}</div>
              {place.amapRating && (
                <div className="text-yellow-500 mt-0.5">{'★'.repeat(Math.round(place.amapRating))} {place.amapRating}</div>
              )}
              {place.ragMeta?.tipSnippets?.[0] && (
                <div className="text-yellow-700 bg-yellow-50 rounded px-1.5 py-0.5 mt-1 text-xs">
                  💡 {place.ragMeta.tipSnippets[0]}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 错误状态 */}
      {message.status === 'error' && (
        <div className="text-red-500 text-xs px-3">{message.content}</div>
      )}
    </div>
  )
}

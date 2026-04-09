import type { Place } from './place'
import type { ChatMessage } from './chat'

export type RoomPhase = 'exploring' | 'selecting' | 'optimizing' | 'planned'

/** Yjs doc.getMap('room') 中存储的元数据 */
export interface YjsRoomMeta {
  roomId: string
  threadId: string        // 对应 LangGraph PostgresSaver 的 thread_id
  phase: RoomPhase
  tripCity: string
  tripDays: number
  createdAt: string       // ISO 8601
}

/** Yjs doc.getMap('places') 中每条记录的结构（key = placeId）*/
export interface YjsPlace extends Place {
  votedBy: string[]       // 勾选了该地点的 userId 列表
  addedBy: string         // 首次添加的 userId
  addedAt: string         // ISO 8601
  note: string            // 成员备注（实时协同编辑）
  isPinned: boolean       // 钉住，不参与 AI 过滤
}

/** Yjs Awareness 协议中每个在线成员的状态 */
export interface RoomMember {
  userId: string
  nickname: string
  color: string           // 用于区分不同用户操作的高亮颜色（hex）
  isOnline: boolean
}

/**
 * Yjs YDoc 结构说明（注释，非运行时代码）：
 *
 * doc.getMap<YjsRoomMeta>('room')
 *   → 房间元数据（单个 Map，key 为字段名）
 *
 * doc.getMap<YjsPlace>('places')
 *   → 地点列表（key = placeId，value = YjsPlace）
 *
 * doc.getArray<ChatMessage>('chat')
 *   → 聊天消息列表（只追加，不删改）
 */

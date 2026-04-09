import { create } from 'zustand'

interface RoomStore {
  // UI 状态（本地，不参与 Yjs 同步）
  isOptimizing: boolean
  isChatOpen: boolean
  hoveredPlaceId: string | null
  selectedPlaceId: string | null
  tripDays: number

  // 操作
  setIsOptimizing: (v: boolean) => void
  setIsChatOpen: (v: boolean) => void
  setHoveredPlaceId: (id: string | null) => void
  setSelectedPlaceId: (id: string | null) => void
  setTripDays: (days: number) => void
}

export const useRoomStore = create<RoomStore>((set) => ({
  isOptimizing: false,
  isChatOpen: true,
  hoveredPlaceId: null,
  selectedPlaceId: null,
  tripDays: 3,

  setIsOptimizing: (v) => set({ isOptimizing: v }),
  setIsChatOpen: (v) => set({ isChatOpen: v }),
  setHoveredPlaceId: (id) => set({ hoveredPlaceId: id }),
  setSelectedPlaceId: (id) => set({ selectedPlaceId: id }),
  setTripDays: (days) => set({ tripDays: days }),
}))

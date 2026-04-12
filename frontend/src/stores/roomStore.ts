import { create } from 'zustand'

export type RightPanelTab = 'candidates' | 'itinerary'

interface RoomStore {
  // UI 状态（本地，不参与 Yjs 同步）
  isOptimizing: boolean
  isChatOpen: boolean
  hoveredPlaceId: string | null
  selectedPlaceId: string | null
  tripDays: number
  rightTab: RightPanelTab

  // 操作
  setIsOptimizing: (v: boolean) => void
  setIsChatOpen: (v: boolean) => void
  setHoveredPlaceId: (id: string | null) => void
  setSelectedPlaceId: (id: string | null) => void
  setTripDays: (days: number) => void
  setRightTab: (tab: RightPanelTab) => void
}

export const useRoomStore = create<RoomStore>((set) => ({
  isOptimizing: false,
  isChatOpen: true,
  hoveredPlaceId: null,
  selectedPlaceId: null,
  tripDays: 3,
  rightTab: 'candidates',

  setIsOptimizing: (v) => set({ isOptimizing: v }),
  setIsChatOpen: (v) => set({ isChatOpen: v }),
  setHoveredPlaceId: (id) => set({ hoveredPlaceId: id }),
  setSelectedPlaceId: (id) => set({ selectedPlaceId: id }),
  setTripDays: (days) => set({ tripDays: days }),
  setRightTab: (tab) => set({ rightTab: tab }),
}))

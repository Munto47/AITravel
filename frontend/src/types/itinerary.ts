import type { Place } from './place'

export interface TransportLeg {
  mode: 'driving' | 'walking' | 'transit'
  durationMins: number
  distanceKm: number
}

export interface WeatherInfo {
  condition: string     // "晴" / "多云" / "小雨"
  tempHigh: number
  tempLow: number
  suggestion: string    // "适合户外，建议带防晒"
}

export interface TimeSlot {
  placeId: string
  place: Place
  startTime: string     // "09:00"
  endTime: string       // "11:30"
  transport?: TransportLeg  // 与下一地点的交通（最后一个为 undefined）
}

export interface DayPlan {
  dayIndex: number      // 0-based
  date?: string         // ISO 8601，可选
  clusterId: number
  slots: TimeSlot[]
  weatherSummary?: WeatherInfo
}

export interface Itinerary {
  itineraryId: string
  threadId: string
  city: string
  days: DayPlan[]
  generatedAt: string   // ISO 8601
  version: number       // 每次重新排线递增
}

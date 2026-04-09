export type PlaceSource = 'amap_poi' | 'rag' | 'synthesized'
export type PlaceCategory = 'attraction' | 'food' | 'hotel' | 'transport'

export interface Coordinates {
  lng: number
  lat: number
}

export interface PlaceRAGMeta {
  tipSnippets: string[]       // 从游记提取的避坑/推荐语，最多3条
  sentimentScore: number      // -1 ~ 1
  sourceNoteIds: string[]     // 支撑该内容的游记文档 ID（可溯源）
}

export interface Place {
  placeId: string
  name: string
  category: PlaceCategory
  address: string
  coords: Coordinates
  city: string
  district?: string
  source: PlaceSource

  // 高德客观数据
  amapRating?: number         // 0-5
  amapPrice?: number          // 人均（元）
  openingHours?: string
  phone?: string
  amapPhotos: string[]

  // RAG 主观数据（无游记命中则为 undefined）
  ragMeta?: PlaceRAGMeta

  // Optimizer 节点填入
  clusterId?: number          // K-Means 日期簇 ID
  visitOrder?: number         // 簇内 TSP 排序序号
  estimatedDuration?: number  // 建议游览时长（分钟）
}

/** 将后端蛇形命名转换为前端驼峰命名 */
export function parsePlaceFromAPI(raw: Record<string, unknown>): Place {
  return {
    placeId: raw.place_id as string,
    name: raw.name as string,
    category: raw.category as PlaceCategory,
    address: raw.address as string,
    coords: raw.coords as Coordinates,
    city: raw.city as string,
    district: raw.district as string | undefined,
    source: (raw.source as PlaceSource) || 'synthesized',
    amapRating: raw.amap_rating as number | undefined,
    amapPrice: raw.amap_price as number | undefined,
    openingHours: raw.opening_hours as string | undefined,
    phone: raw.phone as string | undefined,
    amapPhotos: (raw.amap_photos as string[]) || [],
    ragMeta: raw.rag_meta
      ? {
          tipSnippets: (raw.rag_meta as Record<string, unknown>).tip_snippets as string[],
          sentimentScore: (raw.rag_meta as Record<string, unknown>).sentiment_score as number,
          sourceNoteIds: (raw.rag_meta as Record<string, unknown>).source_note_ids as string[],
        }
      : undefined,
    clusterId: raw.cluster_id as number | undefined,
    visitOrder: raw.visit_order as number | undefined,
    estimatedDuration: raw.estimated_duration as number | undefined,
  }
}

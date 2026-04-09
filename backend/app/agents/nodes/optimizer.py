"""
Optimizer 节点：K-Means 聚类 + 高德距离矩阵 + TSP 排线

此节点不在主 chat 图中，通过 POST /api/optimize 独立触发。

输入：places（Place 列表）, trip_days（天数）
输出：Itinerary（完整行程）

实现步骤：
1. K-Means 聚类（sklearn）：按经纬度将地点分为 trip_days 个簇
2. 高德距离矩阵：获取每个簇内部地点之间的真实驾车时间
3. TSP 最近邻启发式：每个簇内按最短路径排序
4. 时间表生成：09:00 开始，累加游览时长 + 交通时间

TODO (Sprint 4 完整实现):
- 高德距离矩阵 API 真实调用
- Redis 缓存距离矩阵结果（TTL 24h）
- 和风天气 API 获取 weatherSummary
"""

from datetime import datetime, timezone
import uuid

import numpy as np
from sklearn.cluster import KMeans

from app.schemas.place import Place, PlaceCategory
from app.schemas.itinerary import Itinerary, DayPlan, TimeSlot, TransportLeg
from app.config import settings

# 默认游览时长（分钟）
DEFAULT_DURATION = {
    PlaceCategory.ATTRACTION: 120,
    PlaceCategory.FOOD: 60,
    PlaceCategory.HOTEL: 30,
    PlaceCategory.TRANSPORT: 15,
}

# 默认交通时间（分钟）- 待 Sprint 4 替换为高德距离矩阵真实数据
DEFAULT_TRANSPORT_MINS = 20


def _kmeans_cluster(places: list[Place], trip_days: int) -> list[Place]:
    """K-Means 聚类，将地点按经纬度分为 trip_days 个簇"""
    if len(places) <= trip_days:
        # 地点数 ≤ 天数，每天一个地点
        for i, p in enumerate(places):
            places[i] = p.model_copy(update={"cluster_id": i})
        return places

    coords = np.array([[p.coords.lng, p.coords.lat] for p in places])
    n_clusters = min(trip_days, len(places))
    kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
    labels = kmeans.fit_predict(coords)

    result = []
    for place, label in zip(places, labels):
        result.append(place.model_copy(update={"cluster_id": int(label)}))
    return result


def _nearest_neighbor_tsp(places: list[Place]) -> list[Place]:
    """
    最近邻启发式 TSP 算法（使用经纬度直线距离作为代理，Sprint 4 替换为高德实际驾车时间）
    TODO: Sprint 4 - 接入高德距离矩阵 API，使用真实驾车时间
    """
    if len(places) <= 1:
        for i, p in enumerate(places):
            places[i] = p.model_copy(update={"visit_order": i})
        return places

    import math

    def dist(a: Place, b: Place) -> float:
        return math.sqrt((a.coords.lng - b.coords.lng) ** 2 + (a.coords.lat - b.coords.lat) ** 2)

    n = len(places)
    visited = [False] * n
    path = [0]
    visited[0] = True

    for _ in range(n - 1):
        last = path[-1]
        nearest = min(
            (i for i in range(n) if not visited[i]),
            key=lambda i: dist(places[last], places[i]),
        )
        path.append(nearest)
        visited[nearest] = True

    result = [None] * n
    for order, idx in enumerate(path):
        result[idx] = places[idx].model_copy(update={"visit_order": order})
    return result


def _generate_time_slots(places: list[Place]) -> list[TimeSlot]:
    """生成时间表（09:00 开始，按 estimated_duration + 交通时间累加）"""
    slots = []
    current_hour, current_minute = 9, 0

    sorted_places = sorted(places, key=lambda p: p.visit_order or 0)
    for i, place in enumerate(sorted_places):
        duration = place.estimated_duration or DEFAULT_DURATION.get(place.category, 90)
        start_str = f"{current_hour:02d}:{current_minute:02d}"
        end_hour = current_hour + (current_minute + duration) // 60
        end_minute = (current_minute + duration) % 60
        end_str = f"{end_hour:02d}:{end_minute:02d}"

        transport = None
        if i < len(sorted_places) - 1:
            transport = TransportLeg(
                mode="driving",
                duration_mins=DEFAULT_TRANSPORT_MINS,
                distance_km=round(DEFAULT_TRANSPORT_MINS * 0.5, 1),  # 粗估：0.5km/min
            )
            current_hour = end_hour + DEFAULT_TRANSPORT_MINS // 60
            current_minute = end_minute + DEFAULT_TRANSPORT_MINS % 60
            if current_minute >= 60:
                current_hour += 1
                current_minute -= 60
        else:
            current_hour = end_hour
            current_minute = end_minute

        slots.append(TimeSlot(
            place_id=place.place_id,
            place=place.model_dump(),
            start_time=start_str,
            end_time=end_str,
            transport=transport,
        ))
    return slots


async def run(places: list[Place], trip_days: int, thread_id: str) -> Itinerary:
    """Optimizer 节点入口函数（直接调用，非 LangGraph 节点）"""
    # 1. K-Means 聚类
    clustered = _kmeans_cluster(places, trip_days)

    # 2. 按簇分组
    clusters: dict[int, list[Place]] = {}
    for p in clustered:
        cid = p.cluster_id or 0
        clusters.setdefault(cid, []).append(p)

    # 3. 每个簇内 TSP 排线
    day_plans = []
    for day_index, (cluster_id, cluster_places) in enumerate(clusters.items()):
        ordered = _nearest_neighbor_tsp(cluster_places)
        slots = _generate_time_slots(ordered)

        day_plans.append(DayPlan(
            day_index=day_index,
            cluster_id=cluster_id,
            slots=slots,
            # TODO: Sprint 4 - weather_summary 从和风天气 API 获取
        ))

    # 按 day_index 排序
    day_plans.sort(key=lambda d: d.day_index)

    city = places[0].city if places else "未知"
    return Itinerary(
        itinerary_id=str(uuid.uuid4()),
        thread_id=thread_id,
        city=city,
        days=day_plans,
        generated_at=datetime.now(timezone.utc).isoformat(),
        version=1,
    )

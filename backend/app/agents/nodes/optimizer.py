"""
Optimizer 节点：K-Means 聚类 + 高德驾车时间 + TSP 排线 + 和风天气

此节点不在主 chat 图中，通过 POST /api/optimize 独立触发。

算法流程：
1. K-Means（sklearn）按经纬度聚类为 trip_days 个簇
2. 高德驾车 API 构建时间矩阵（N≤6 时调用真实 API，否则直线 × 1.3 系数估算）
3. 最近邻 TSP 在每个簇内按最短驾车时间排序
4. 时间表生成（09:00 起，累加游览时长 + 真实交通时间）
5. 和风天气（出发日期在未来 3 天内时填充 weather_summary）
"""

import asyncio
import math
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Optional

import aiohttp
import numpy as np
from sklearn.cluster import KMeans

from app.schemas.place import Place, PlaceCategory
from app.schemas.itinerary import Itinerary, DayPlan, TimeSlot, TransportLeg, WeatherInfo
from app.config import settings

# ===== 常量 =====

DEFAULT_DURATION = {
    PlaceCategory.ATTRACTION: 120,
    PlaceCategory.FOOD: 60,
    PlaceCategory.HOTEL: 30,
    PlaceCategory.TRANSPORT: 15,
}
DEFAULT_TRANSPORT_MINS = 20

WEATHER_SUGGESTIONS = {
    "晴": "天气晴好，建议带防晒霜和水",
    "多云": "天气舒适，适合全天户外游览",
    "阴": "天气阴凉，无需防晒，可放心游览",
    "小雨": "有小雨，建议携带雨伞",
    "中雨": "有中雨，注意路面防滑",
    "大雨": "有大雨，优先安排室内景点",
    "雨": "有降雨，建议携带雨具",
    "雪": "有降雪，注意保暖防滑",
    "雷": "有雷阵雨，避免开阔区域",
}

# ===== Redis 懒初始化 =====

_redis = None


async def _get_redis():
    global _redis
    if _redis is None:
        try:
            import redis.asyncio as aioredis
            _redis = aioredis.from_url(
                settings.redis_url, decode_responses=True, socket_connect_timeout=2
            )
            await _redis.ping()
        except Exception as e:
            print(f"[Optimizer] Redis 连接失败，跳过缓存：{e}")
            _redis = None
    return _redis


# ===== 距离/时间工具 =====

def _haversine_km(a: Place, b: Place) -> float:
    """球面距离（km）"""
    R = 6371.0
    lat1 = math.radians(a.coords.lat)
    lat2 = math.radians(b.coords.lat)
    dlat = math.radians(b.coords.lat - a.coords.lat)
    dlng = math.radians(b.coords.lng - a.coords.lng)
    x = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return R * 2 * math.asin(math.sqrt(x))


def _estimate_driving(a: Place, b: Place) -> tuple[int, float]:
    """直线距离 × 1.3（道路曲折系数）估算驾车时间和距离"""
    dist_km = _haversine_km(a, b) * 1.3
    duration_mins = max(5, int(dist_km / 30 * 60))  # 30 km/h 城市均速
    return duration_mins, round(dist_km, 1)


async def _fetch_amap_driving(
    session: aiohttp.ClientSession, a: Place, b: Place
) -> tuple[int, float]:
    """高德驾车路线 API；失败时降级到直线估算"""
    try:
        async with session.get(
            "https://restapi.amap.com/v3/direction/driving",
            params={
                "key": settings.amap_api_key,
                "origin": f"{a.coords.lng},{a.coords.lat}",
                "destination": f"{b.coords.lng},{b.coords.lat}",
                "output": "json",
            },
            timeout=aiohttp.ClientTimeout(total=5),
        ) as resp:
            data = await resp.json()
            if data.get("status") == "1":
                paths = data.get("route", {}).get("paths", [])
                if paths:
                    duration_mins = int(paths[0].get("duration", 1200)) // 60
                    distance_km = round(int(paths[0].get("distance", 5000)) / 1000, 1)
                    return max(1, duration_mins), distance_km
    except Exception as e:
        print(f"[Optimizer] 高德驾车 API 失败（{a.name}→{b.name}）：{e}")
    return _estimate_driving(a, b)


async def _get_driving_cached(
    session: aiohttp.ClientSession, semaphore: asyncio.Semaphore, a: Place, b: Place
) -> tuple[int, float]:
    """带 Redis 缓存（TTL 24h）的驾车查询"""
    ids = sorted([a.place_id, b.place_id])
    cache_key = f"dist:{ids[0]}:{ids[1]}"

    redis = await _get_redis()
    if redis:
        try:
            cached = await redis.get(cache_key)
            if cached:
                parts = cached.split(",")
                return int(parts[0]), float(parts[1])
        except Exception:
            pass

    async with semaphore:
        result = await _fetch_amap_driving(session, a, b)

    if redis:
        try:
            await redis.setex(cache_key, 86400, f"{result[0]},{result[1]}")
        except Exception:
            pass

    return result


# ===== 时间矩阵 =====

async def _build_time_matrix(
    session: aiohttp.ClientSession, places: list[Place]
) -> dict[tuple[str, str], tuple[int, float]]:
    """构建 (place_id_a, place_id_b) → (duration_mins, distance_km) 矩阵"""
    n = len(places)
    # N≤6 且有高德 key 时调用真实 API
    use_amap = n <= 6 and not settings.amap_mock and bool(settings.amap_api_key)

    matrix: dict[tuple[str, str], tuple[int, float]] = {}

    if use_amap:
        semaphore = asyncio.Semaphore(3)
        pairs = [(places[i], places[j]) for i in range(n) for j in range(i + 1, n)]

        async def fetch_pair(pair_a: Place, pair_b: Place) -> tuple[int, float]:
            return await _get_driving_cached(session, semaphore, pair_a, pair_b)

        results = await asyncio.gather(
            *[fetch_pair(a, b) for a, b in pairs], return_exceptions=True
        )

        for (a, b), result in zip(pairs, results):
            if isinstance(result, Exception):
                result = _estimate_driving(a, b)
            matrix[(a.place_id, b.place_id)] = result  # type: ignore[assignment]
            matrix[(b.place_id, a.place_id)] = result  # type: ignore[assignment]
    else:
        for i in range(n):
            for j in range(i + 1, n):
                result = _estimate_driving(places[i], places[j])
                matrix[(places[i].place_id, places[j].place_id)] = result
                matrix[(places[j].place_id, places[i].place_id)] = result

    return matrix


# ===== K-Means 聚类 =====

def _kmeans_cluster(places: list[Place], trip_days: int) -> list[Place]:
    if len(places) <= trip_days:
        return [p.model_copy(update={"cluster_id": i}) for i, p in enumerate(places)]

    coords = np.array([[p.coords.lng, p.coords.lat] for p in places])
    n_clusters = min(trip_days, len(places))
    kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
    labels = kmeans.fit_predict(coords)
    return [p.model_copy(update={"cluster_id": int(label)}) for p, label in zip(places, labels)]


# ===== TSP =====

def _nearest_neighbor_tsp(
    places: list[Place],
    time_matrix: dict[tuple[str, str], tuple[int, float]],
) -> list[Place]:
    if len(places) <= 1:
        return [p.model_copy(update={"visit_order": i}) for i, p in enumerate(places)]

    n = len(places)
    visited = [False] * n
    path = [0]
    visited[0] = True

    for _ in range(n - 1):
        last = path[-1]
        nearest = min(
            (i for i in range(n) if not visited[i]),
            key=lambda i: time_matrix.get(
                (places[last].place_id, places[i].place_id),
                (DEFAULT_TRANSPORT_MINS, 10.0),
            )[0],
        )
        path.append(nearest)
        visited[nearest] = True

    result = [None] * n
    for order, idx in enumerate(path):
        result[idx] = places[idx].model_copy(update={"visit_order": order})
    return result  # type: ignore[return-value]


# ===== 时间表生成 =====

def _generate_time_slots(
    places: list[Place],
    time_matrix: dict[tuple[str, str], tuple[int, float]],
) -> list[TimeSlot]:
    slots = []
    current_mins = 9 * 60  # 09:00

    sorted_places = sorted(places, key=lambda p: p.visit_order or 0)

    for i, place in enumerate(sorted_places):
        duration = place.estimated_duration or DEFAULT_DURATION.get(place.category, 90)
        start_str = f"{current_mins // 60:02d}:{current_mins % 60:02d}"
        end_mins = current_mins + duration
        end_str = f"{end_mins // 60:02d}:{end_mins % 60:02d}"

        transport = None
        if i < len(sorted_places) - 1:
            next_place = sorted_places[i + 1]
            key = (place.place_id, next_place.place_id)
            dur_mins, dist_km = time_matrix.get(key, _estimate_driving(place, next_place))
            transport = TransportLeg(
                mode="driving",
                duration_mins=dur_mins,
                distance_km=dist_km,
            )
            current_mins = end_mins + dur_mins
        else:
            current_mins = end_mins

        slots.append(TimeSlot(
            place_id=place.place_id,
            place=place.model_dump(),
            start_time=start_str,
            end_time=end_str,
            transport=transport,
        ))

    return slots


# ===== 天气 =====

def _weather_suggestion(condition: str) -> str:
    for key, suggestion in WEATHER_SUGGESTIONS.items():
        if key in condition:
            return suggestion
    return "注意查看出发前天气预报"


async def _fetch_weather(
    session: aiohttp.ClientSession, lat: float, lng: float, day_offset: int
) -> Optional[WeatherInfo]:
    if not settings.qweather_key or day_offset > 2:
        return None
    try:
        async with session.get(
            "https://devapi.qweather.com/v7/weather/3d",
            params={"location": f"{lng},{lat}", "key": settings.qweather_key},
            timeout=aiohttp.ClientTimeout(total=5),
        ) as resp:
            data = await resp.json()
            if data.get("code") == "200":
                daily = data.get("daily", [])
                if day_offset < len(daily):
                    d = daily[day_offset]
                    return WeatherInfo(
                        condition=d.get("textDay", "晴"),
                        temp_high=int(d.get("tempMax", 25)),
                        temp_low=int(d.get("tempMin", 15)),
                        suggestion=_weather_suggestion(d.get("textDay", "晴")),
                    )
    except Exception as e:
        print(f"[Optimizer] 和风天气 API 失败：{e}")
    return None


# ===== 主入口 =====

async def run(
    places: list[Place],
    trip_days: int,
    thread_id: str,
    start_date: Optional[str] = None,
) -> Itinerary:
    """Optimizer 入口（直接调用，非 LangGraph 节点）"""
    async with aiohttp.ClientSession() as session:
        # 1. K-Means 聚类
        clustered = _kmeans_cluster(places, trip_days)

        # 2. 按簇分组（重新连续编号）
        clusters: dict[int, list[Place]] = {}
        for p in clustered:
            cid = p.cluster_id or 0
            clusters.setdefault(cid, []).append(p)

        sorted_cluster_items = sorted(clusters.items())

        # 3. 计算中心坐标（用于天气查询）
        center_lat = sum(p.coords.lat for p in places) / len(places)
        center_lng = sum(p.coords.lng for p in places) / len(places)

        # 4. 确定天气查询范围
        today = date.today()
        weather_enabled = bool(settings.qweather_key) and start_date is not None

        day_plans: list[DayPlan] = []

        for day_index, (cluster_id, cluster_places) in enumerate(sorted_cluster_items):
            # 4a. 构建时间矩阵
            time_matrix = await _build_time_matrix(session, cluster_places)

            # 4b. TSP 排线
            ordered = _nearest_neighbor_tsp(cluster_places, time_matrix)

            # 4c. 生成时间表
            slots = _generate_time_slots(ordered, time_matrix)

            # 4d. 天气
            weather_summary: Optional[WeatherInfo] = None
            day_date_str: Optional[str] = None

            if start_date:
                try:
                    trip_start = date.fromisoformat(start_date)
                    day_date = trip_start + timedelta(days=day_index)
                    day_date_str = day_date.isoformat()
                    if weather_enabled:
                        offset = (day_date - today).days
                        if 0 <= offset <= 2:
                            weather_summary = await _fetch_weather(
                                session, center_lat, center_lng, offset
                            )
                except Exception as e:
                    print(f"[Optimizer] 日期/天气处理失败：{e}")

            day_plans.append(DayPlan(
                day_index=day_index,
                date=day_date_str,
                cluster_id=cluster_id,
                slots=slots,
                weather_summary=weather_summary,
            ))

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

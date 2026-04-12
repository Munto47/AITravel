"""
POST /api/recommend - 城市候选地点推荐接口

进入规划房间后自动调用，根据城市和天数返回分类推荐（美景/美食/美梦）。
Mock 模式从 fixture 读取，真实模式调用高德 POI 搜索。
"""

import json
from pathlib import Path
from typing import Optional

import aiohttp
from fastapi import APIRouter
from pydantic import BaseModel

from app.config import settings
from app.schemas.place import Place, Coordinates, PlaceCategory, PlaceSource

router = APIRouter()

MOCK_DATA_PATH = Path(__file__).parent.parent.parent / "tests" / "fixtures" / "amap_mock_places.json"

# 高德 POI 大类 → 系统 category 映射
AMAP_TYPE_MAP = {
    "餐饮": PlaceCategory.FOOD,
    "美食": PlaceCategory.FOOD,
    "景区": PlaceCategory.ATTRACTION,
    "风景名胜": PlaceCategory.ATTRACTION,
    "旅游景点": PlaceCategory.ATTRACTION,
    "住宿": PlaceCategory.HOTEL,
    "酒店": PlaceCategory.HOTEL,
    "交通": PlaceCategory.TRANSPORT,
}

DEFAULT_DURATION = {
    PlaceCategory.ATTRACTION: 120,
    PlaceCategory.FOOD: 60,
    PlaceCategory.HOTEL: 30,
    PlaceCategory.TRANSPORT: 15,
}


class RecommendRequest(BaseModel):
    city: str
    trip_days: int = 3


class RecommendResponse(BaseModel):
    city: str
    places: list[Place]


def _parse_amap_type(type_str: str) -> PlaceCategory:
    for key, cat in AMAP_TYPE_MAP.items():
        if key in type_str:
            return cat
    return PlaceCategory.ATTRACTION


def _parse_amap_place(raw: dict, city: str) -> Optional[Place]:
    try:
        location = raw.get("location", "")
        if not location:
            return None
        lng_str, lat_str = location.split(",")
        biz_ext = raw.get("biz_ext")
        if not isinstance(biz_ext, dict):
            biz_ext = {}
        rating_str = biz_ext.get("rating", "")
        price_str = biz_ext.get("cost", "")
        photos = []
        if raw.get("photos"):
            photos = [p.get("url", "") for p in raw["photos"][:3] if p.get("url")]
        category = _parse_amap_type(raw.get("type", ""))
        return Place(
            place_id=raw.get("id", ""),
            name=raw.get("name", ""),
            category=category,
            address=raw.get("address", "") or "",
            coords=Coordinates(lng=float(lng_str), lat=float(lat_str)),
            city=city,
            district=raw.get("adname"),
            source=PlaceSource.AMAP_POI,
            amap_rating=float(rating_str) if rating_str and str(rating_str).replace('.', '', 1).isdigit() else None,
            amap_price=float(price_str) if price_str and str(price_str).replace('.', '', 1).isdigit() else None,
            opening_hours=raw.get("biz_opentime") if isinstance(raw.get("biz_opentime"), str) else None,
            phone=raw.get("tel") if isinstance(raw.get("tel"), str) else None,
            amap_photos=photos,
            estimated_duration=DEFAULT_DURATION.get(category, 90),
        )
    except Exception as e:
        print(f"[Recommend] 解析 POI 失败：{e}")
        return None


async def _fetch_amap_poi(keywords: str, city: str, types: str = "") -> list[Place]:
    """调用高德 POI 搜索 API"""
    url = "https://restapi.amap.com/v3/place/text"
    params = {
        "key": settings.amap_api_key,
        "keywords": keywords,
        "city": city,
        "output": "json",
        "extensions": "all",
        "offset": 5,
    }
    if types:
        params["types"] = types
    async with aiohttp.ClientSession() as session:
        async with session.get(url, params=params, timeout=aiohttp.ClientTimeout(total=8)) as resp:
            data = await resp.json()
            if data.get("status") != "1" or not data.get("pois"):
                return []
            places = [_parse_amap_place(p, city) for p in data["pois"]]
            return [p for p in places if p is not None]


def _load_mock_places(city: str) -> list[Place]:
    """从 fixture 文件加载 Mock 推荐数据"""
    if not MOCK_DATA_PATH.exists():
        return []
    with open(MOCK_DATA_PATH, "r", encoding="utf-8") as f:
        mock_data = json.load(f)
    city_places = mock_data.get(city, mock_data.get("成都", []))
    return [Place(**p) for p in city_places]


@router.post("/recommend", response_model=RecommendResponse)
async def recommend(request: RecommendRequest):
    """
    城市候选地点推荐接口。

    进入房间后自动调用，返回该城市的基础推荐地点（景点+美食+住宿）。
    Mock 模式直接返回 fixture 数据，真实模式依次搜索三个品类。
    """
    city = request.city or "成都"

    if settings.amap_mock or settings.demo_mode:
        places = _load_mock_places(city)
        print(f"[Recommend] Mock 模式，city={city}，返回 {len(places)} 个地点")
        return RecommendResponse(city=city, places=places)

    if not settings.amap_api_key:
        print("[Recommend] 未配置 AMAP_API_KEY，降级到 Mock")
        return RecommendResponse(city=city, places=_load_mock_places(city))

    # 真实模式：分品类顺序搜索（避免并发限制）
    all_places: list[Place] = []
    search_queries = [
        (f"{city}必去景点", ""),
        (f"{city}特色美食餐厅", ""),
        (f"{city}酒店", ""),
    ]

    for keywords, types in search_queries:
        try:
            results = await _fetch_amap_poi(keywords, city, types)
            all_places.extend(results)
        except Exception as e:
            print(f"[Recommend] 搜索 {keywords} 失败：{e}")

    if not all_places:
        print(f"[Recommend] 真实 API 无结果，降级 Mock，city={city}")
        all_places = _load_mock_places(city)

    print(f"[Recommend] city={city}，返回 {len(all_places)} 个地点")
    return RecommendResponse(city=city, places=all_places)

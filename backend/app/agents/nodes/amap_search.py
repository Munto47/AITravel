"""
AmapSearch 节点：高德 POI 搜索

输入：state.query_rewrite（改写后的查询）, state.messages（从历史中提取城市）
输出：state.amap_places（Place 列表）

Mock 模式（AMAP_MOCK=true）：
  从 backend/tests/fixtures/amap_mock_places.json 读取预设数据
  按城市关键词过滤，返回匹配的地点

真实模式：
  调用高德 POI 搜索 API: https://restapi.amap.com/v3/place/text
  参数: keywords, city, output=json, extensions=all
"""

import json
import re
from pathlib import Path
from typing import Optional

import aiohttp

from app.agents.state import AgentState
from app.config import settings
from app.schemas.place import Place, Coordinates, PlaceCategory, PlaceSource

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

MOCK_DATA_PATH = Path(__file__).parent.parent.parent.parent / "tests" / "fixtures" / "amap_mock_places.json"

# 默认游览时长（分钟），按 category
DEFAULT_DURATION = {
    PlaceCategory.ATTRACTION: 120,
    PlaceCategory.FOOD: 60,
    PlaceCategory.HOTEL: 30,
    PlaceCategory.TRANSPORT: 15,
}


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
        rating_str = raw.get("biz_ext", {}).get("rating", "") if raw.get("biz_ext") else ""
        price_str = raw.get("biz_ext", {}).get("cost", "") if raw.get("biz_ext") else ""
        photos = []
        if raw.get("photos"):
            photos = [p.get("url", "") for p in raw["photos"][:3] if p.get("url")]

        category = _parse_amap_type(raw.get("type", ""))
        return Place(
            place_id=raw.get("id", ""),
            name=raw.get("name", ""),
            category=category,
            address=raw.get("address", ""),
            coords=Coordinates(lng=float(lng_str), lat=float(lat_str)),
            city=city,
            district=raw.get("adname"),
            source=PlaceSource.AMAP_POI,
            amap_rating=float(rating_str) if rating_str and rating_str != [] else None,
            amap_price=float(price_str) if price_str and price_str != [] else None,
            opening_hours=raw.get("biz_opentime"),
            phone=raw.get("tel"),
            amap_photos=photos,
            estimated_duration=DEFAULT_DURATION.get(category, 90),
        )
    except Exception as e:
        print(f"[AmapSearch] 解析 POI 失败：{e}，原始数据：{raw.get('name')}")
        return None


def _extract_city(state: AgentState) -> str:
    """从对话历史中提取城市名（简单关键词匹配）"""
    known_cities = ["北京", "上海", "成都", "厦门", "广州", "深圳", "杭州", "西安", "重庆"]
    for msg in reversed(state["messages"]):
        content = str(msg.content)
        for city in known_cities:
            if city in content:
                return city
    return "成都"  # 默认城市（面试 Demo 主城市）


async def _fetch_amap_poi(keywords: str, city: str) -> list[Place]:
    """调用高德 POI 搜索 API"""
    url = "https://restapi.amap.com/v3/place/text"
    params = {
        "key": settings.amap_api_key,
        "keywords": keywords,
        "city": city,
        "output": "json",
        "extensions": "all",
        "offset": 10,
    }
    async with aiohttp.ClientSession() as session:
        async with session.get(url, params=params, timeout=aiohttp.ClientTimeout(total=8)) as resp:
            data = await resp.json()
            if data.get("status") != "1" or not data.get("pois"):
                return []
            places = [_parse_amap_place(p, city) for p in data["pois"]]
            return [p for p in places if p is not None]


def _load_mock_places(city: str, keywords: str) -> list[Place]:
    """从本地 fixture 文件加载 Mock 数据"""
    if not MOCK_DATA_PATH.exists():
        # Fixture 未生成时返回空（后续 Sprint 补充）
        print(f"[AmapSearch] Mock 文件不存在：{MOCK_DATA_PATH}")
        return []
    with open(MOCK_DATA_PATH, "r", encoding="utf-8") as f:
        mock_data = json.load(f)
    # 优先返回匹配城市的数据
    city_places = mock_data.get(city, mock_data.get("成都", []))
    return [Place(**p) for p in city_places[:8]]


async def run(state: AgentState) -> dict:
    """AmapSearch 节点入口函数"""
    query = state.get("query_rewrite") or ""
    city = _extract_city(state)

    if settings.amap_mock or settings.demo_mode:
        places = _load_mock_places(city, query)
    else:
        try:
            places = await _fetch_amap_poi(query, city)
        except Exception as e:
            print(f"[AmapSearch] 高德 API 调用失败：{e}")
            places = _load_mock_places(city, query)  # 降级到 Mock

    print(f"[AmapSearch] city={city}, query={query}, 返回 {len(places)} 个地点")
    return {"amap_places": places}

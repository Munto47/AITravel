"""
GET /api/weather?city=成都 — 城市天气查询

两步调用和风天气 API：
  1. GeoAPI /geo/v2/city/lookup  城市名 → LocationID（内存缓存，避免重复查询）
  2. /v7/weather/3d               LocationID → 3 天预报

认证方式：Authorization: Bearer {QWEATHER_API_KEY}（新版推荐，无 Host 白名单限制）
未配置 QWEATHER_API_KEY 或城市查不到时返回 null，前端静默不显示天气条。
"""

from typing import Optional

import aiohttp
from fastapi import APIRouter
from pydantic import BaseModel

from app.config import settings

router = APIRouter()

# 城市名 → LocationID 内存缓存（进程内有效，重启清空）
_location_id_cache: dict[str, str] = {}

WEATHER_ICON: dict[str, str] = {
    "晴":  "☀️",
    "多云": "⛅",
    "阴":  "☁️",
    "小雨": "🌧️",
    "中雨": "🌧️",
    "大雨": "⛈️",
    "雨":  "🌧️",
    "雪":  "❄️",
    "雷":  "⛈️",
    "雾":  "🌫️",
    "霾":  "🌫️",
}

WEATHER_SUGGESTIONS: dict[str, str] = {
    "晴":  "天气晴好，出门别忘防晒",
    "多云": "天气舒适，适合全天游览",
    "阴":  "天气阴凉，无需防晒可放心出行",
    "小雨": "有小雨，建议带伞",
    "中雨": "有中雨，注意防滑",
    "大雨": "有大雨，优先安排室内景点",
    "雨":  "有降雨，记得带伞",
    "雪":  "有降雪，注意保暖防滑",
    "雷":  "有雷阵雨，避免空旷区域",
    "雾":  "有雾，高速谨慎，景区能见度低",
    "霾":  "空气质量较差，敏感人群减少户外活动",
}


class DayWeather(BaseModel):
    date: str        # "2026-04-15"
    condition: str   # "多云"
    icon: str        # "⛅"
    temp_high: int
    temp_low: int
    suggestion: str


class WeatherResponse(BaseModel):
    city: str
    days: list[DayWeather]   # 长度 1-3（今日 + 明日 + 后日）


def _get_icon(condition: str) -> str:
    for key, icon in WEATHER_ICON.items():
        if key in condition:
            return icon
    return "🌤️"


def _get_suggestion(condition: str) -> str:
    for key, suggestion in WEATHER_SUGGESTIONS.items():
        if key in condition:
            return suggestion
    return "注意查看出行前天气预报"


def _auth_headers() -> dict:
    """构造 Bearer 认证 header，解除 Host 白名单限制。"""
    return {"Authorization": f"Bearer {settings.qweather_api_key}"}


async def _lookup_location_id(city: str) -> Optional[str]:
    """
    调用和风 GeoAPI，城市名 → LocationID。
    结果缓存在进程内存，避免每次天气请求都触发 GeoAPI。
    """
    if city in _location_id_cache:
        return _location_id_cache[city]

    url = f"https://{settings.qweather_api_host}/geo/v2/city/lookup"
    params = {"location": city, "range": "cn", "number": "1", "lang": "zh"}

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                url,
                params=params,
                headers=_auth_headers(),
                timeout=aiohttp.ClientTimeout(total=6),
            ) as resp:
                data = await resp.json(content_type=None)
                if data.get("code") != "200" or not data.get("location"):
                    print(f"[Weather] GeoAPI 未找到城市「{city}」code={data.get('code')}")
                    return None
                loc_id: str = data["location"][0]["id"]
                _location_id_cache[city] = loc_id
                return loc_id
    except Exception as e:
        print(f"[Weather] GeoAPI 异常（{city}）：{e}")
        return None


async def _fetch_forecast(location_id: str) -> Optional[list[DayWeather]]:
    """用 LocationID 查询 3 天天气预报。"""
    url = f"https://{settings.qweather_api_host}/v7/weather/3d"
    params = {"location": location_id}

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                url,
                params=params,
                headers=_auth_headers(),
                timeout=aiohttp.ClientTimeout(total=6),
            ) as resp:
                data = await resp.json(content_type=None)
                if data.get("code") != "200" or not data.get("daily"):
                    print(f"[Weather] 天气预报非 200 code={data.get('code')}")
                    return None

                days = []
                for d in data["daily"][:3]:
                    condition = d.get("textDay", "多云")
                    days.append(DayWeather(
                        date=d.get("fxDate", ""),
                        condition=condition,
                        icon=_get_icon(condition),
                        temp_high=int(d.get("tempMax", 25)),
                        temp_low=int(d.get("tempMin", 15)),
                        suggestion=_get_suggestion(condition),
                    ))
                return days
    except Exception as e:
        print(f"[Weather] 天气预报异常（{location_id}）：{e}")
        return None


@router.get("/weather", response_model=Optional[WeatherResponse])
async def get_weather(city: str = "成都"):
    """
    查询城市未来 3 天天气。
    先通过 GeoAPI 将城市名解析为 LocationID，再查天气预报。
    未配置 QWEATHER_API_KEY 或城市/API 调用失败时返回 null，前端静默降级。
    """
    if not settings.qweather_api_key:
        return None

    location_id = await _lookup_location_id(city)
    if not location_id:
        return None

    days = await _fetch_forecast(location_id)
    if not days:
        return None

    return WeatherResponse(city=city, days=days)

"""
GET /api/weather?city=成都 — 城市天气查询

调用和风天气 v7 API，返回当日及未来 2 天预报。
未配置 QWEATHER_KEY 时返回 null，前端静默降级不显示天气条。
"""

from typing import Optional

import aiohttp
from fastapi import APIRouter
from pydantic import BaseModel

from app.config import settings

router = APIRouter()

# 城市名 → 经纬度（和风天气 location 参数格式：lng,lat）
CITY_COORDS: dict[str, tuple[float, float]] = {
    "成都": (104.066, 30.659),
    "北京": (116.397, 39.908),
    "上海": (121.473, 31.230),
    "厦门": (118.089, 24.479),
    "广州": (113.264, 23.129),
    "深圳": (114.057, 22.543),
    "杭州": (120.155, 30.274),
    "西安": (108.940, 34.341),
    "重庆": (106.551, 29.563),
}

WEATHER_ICON: dict[str, str] = {
    "晴": "☀️",
    "多云": "⛅",
    "阴": "☁️",
    "小雨": "🌧️",
    "中雨": "🌧️",
    "大雨": "⛈️",
    "雨": "🌧️",
    "雪": "❄️",
    "雷": "⛈️",
    "雾": "🌫️",
    "霾": "🌫️",
}

WEATHER_SUGGESTIONS: dict[str, str] = {
    "晴": "天气晴好，出门别忘防晒",
    "多云": "天气舒适，适合全天游览",
    "阴": "天气阴凉，无需防晒可放心出行",
    "小雨": "有小雨，建议带伞",
    "中雨": "有中雨，注意防滑",
    "大雨": "有大雨，优先安排室内景点",
    "雨": "有降雨，记得带伞",
    "雪": "有降雪，注意保暖防滑",
    "雷": "有雷阵雨，避免空旷区域",
    "雾": "有雾，高速谨慎，景区能见度低",
    "霾": "空气质量较差，敏感人群减少户外活动",
}


class DayWeather(BaseModel):
    date: str           # "2026-04-15"
    condition: str      # "多云"
    icon: str           # "⛅"
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


@router.get("/weather", response_model=Optional[WeatherResponse])
async def get_weather(city: str = "成都"):
    """
    查询城市未来 3 天天气。
    未配置 QWEATHER_KEY 或城市不在列表中时返回 null。
    """
    if not settings.qweather_key:
        return None

    coords = CITY_COORDS.get(city)
    if not coords:
        return None

    lng, lat = coords
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                "https://devapi.qweather.com/v7/weather/3d",
                params={"location": f"{lng},{lat}", "key": settings.qweather_key},
                timeout=aiohttp.ClientTimeout(total=6),
            ) as resp:
                data = await resp.json()
                if data.get("code") != "200" or not data.get("daily"):
                    return None

                days = []
                for d in data["daily"][:3]:
                    condition = d.get("textDay", "晴")
                    days.append(DayWeather(
                        date=d.get("fxDate", ""),
                        condition=condition,
                        icon=_get_icon(condition),
                        temp_high=int(d.get("tempMax", 25)),
                        temp_low=int(d.get("tempMin", 15)),
                        suggestion=_get_suggestion(condition),
                    ))

                return WeatherResponse(city=city, days=days)
    except Exception as e:
        print(f"[Weather] 和风天气 API 失败（{city}）：{e}")
        return None

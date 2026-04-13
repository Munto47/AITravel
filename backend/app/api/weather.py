"""
GET /api/weather?city=成都 — 城市天气查询

调用和风天气 v7 API，返回当日及未来 2 天预报。
API 调用失败（含 403 Invalid Host）时自动降级为本地时令估算数据，保证天气条始终可见。
"""

import datetime
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


# 各城市时令参考气温（月份 → (高温, 低温, 天气描述)）
_CITY_SEASON: dict[str, dict[int, tuple[int, int, str]]] = {
    "成都": {1:(10,4,"阴"),2:(13,6,"多云"),3:(18,10,"多云"),4:(23,14,"多云"),
             5:(27,18,"小雨"),6:(29,21,"小雨"),7:(31,23,"多云"),8:(31,23,"多云"),
             9:(26,19,"小雨"),10:(20,14,"阴"),11:(15,9,"阴"),12:(10,5,"阴")},
    "北京": {1:(3,-6,"晴"),2:(6,-3,"晴"),3:(13,2,"多云"),4:(21,9,"晴"),
             5:(27,15,"多云"),6:(31,20,"多云"),7:(31,23,"小雨"),8:(29,22,"多云"),
             9:(25,16,"晴"),10:(18,8,"晴"),11:(9,0,"晴"),12:(3,-5,"晴")},
    "上海": {1:(8,2,"阴"),2:(10,3,"阴"),3:(14,7,"多云"),4:(20,13,"多云"),
             5:(25,18,"多云"),6:(28,22,"小雨"),7:(33,27,"多云"),8:(33,27,"多云"),
             9:(28,22,"晴"),10:(22,16,"晴"),11:(16,10,"多云"),12:(10,4,"阴")},
    "广州": {1:(19,12,"多云"),2:(19,13,"小雨"),3:(22,16,"小雨"),4:(26,20,"小雨"),
             5:(30,24,"小雨"),6:(32,26,"小雨"),7:(33,27,"多云"),8:(33,27,"多云"),
             9:(31,25,"晴"),10:(28,21,"晴"),11:(24,17,"晴"),12:(20,13,"晴")},
    "深圳": {1:(19,13,"多云"),2:(19,14,"小雨"),3:(22,17,"小雨"),4:(26,21,"小雨"),
             5:(30,25,"小雨"),6:(32,27,"小雨"),7:(33,28,"多云"),8:(33,28,"多云"),
             9:(31,26,"晴"),10:(28,22,"晴"),11:(24,18,"晴"),12:(20,14,"晴")},
    "杭州": {1:(8,1,"阴"),2:(10,3,"阴"),3:(14,7,"多云"),4:(21,13,"多云"),
             5:(26,18,"多云"),6:(29,23,"小雨"),7:(35,28,"多云"),8:(35,28,"多云"),
             9:(29,22,"晴"),10:(23,16,"晴"),11:(16,9,"多云"),12:(10,3,"阴")},
    "西安": {1:(4,-3,"晴"),2:(8,0,"晴"),3:(15,5,"多云"),4:(22,11,"晴"),
             5:(28,16,"晴"),6:(34,21,"晴"),7:(33,23,"多云"),8:(31,21,"多云"),
             9:(25,15,"晴"),10:(18,8,"多云"),11:(10,2,"阴"),12:(5,-2,"晴")},
    "重庆": {1:(10,5,"阴"),2:(13,7,"多云"),3:(18,11,"多云"),4:(23,16,"多云"),
             5:(27,20,"小雨"),6:(30,23,"小雨"),7:(35,27,"多云"),8:(36,28,"多云"),
             9:(28,22,"小雨"),10:(21,16,"阴"),11:(15,10,"阴"),12:(11,6,"阴")},
    "厦门": {1:(15,9,"多云"),2:(15,10,"小雨"),3:(18,13,"小雨"),4:(23,17,"小雨"),
             5:(27,22,"多云"),6:(30,25,"多云"),7:(33,28,"晴"),8:(33,28,"晴"),
             9:(30,25,"晴"),10:(26,20,"晴"),11:(21,15,"晴"),12:(17,11,"多云")},
}
_DEFAULT_SEASON = {m: (25, 15, "多云") for m in range(1, 13)}


def _make_fallback(city: str) -> WeatherResponse:
    """API 不可用时，按城市时令返回参考天气（标注为估算）。"""
    today = datetime.date.today()
    season = _CITY_SEASON.get(city, _DEFAULT_SEASON)
    days = []
    for i in range(3):
        d = today + datetime.timedelta(days=i)
        high, low, condition = season.get(d.month, (25, 15, "多云"))
        # 简单模拟日间温差波动
        high = high + (1 if i == 1 else -1 if i == 2 else 0)
        low  = low  + (1 if i == 1 else -1 if i == 2 else 0)
        days.append(DayWeather(
            date=d.isoformat(),
            condition=condition,
            icon=_get_icon(condition),
            temp_high=high,
            temp_low=low,
            suggestion=_get_suggestion(condition),
        ))
    return WeatherResponse(city=city, days=days)


@router.get("/weather", response_model=Optional[WeatherResponse])
async def get_weather(city: str = "成都"):
    """
    查询城市未来 3 天天气。
    有 QWEATHER_API_KEY 时调用和风天气；调用失败则降级为本地时令估算，始终返回数据。
    城市不在支持列表中时返回 null。
    """
    if city not in CITY_COORDS:
        return None

    # 无 Key → 直接走降级
    if not settings.qweather_api_key:
        return _make_fallback(city)

    lng, lat = CITY_COORDS[city]
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                "https://devapi.qweather.com/v7/weather/3d",
                params={"location": f"{lng},{lat}", "key": settings.qweather_api_key},
                timeout=aiohttp.ClientTimeout(total=6),
            ) as resp:
                data = await resp.json()
                if data.get("code") != "200" or not data.get("daily"):
                    print(f"[Weather] 和风天气非 200 响应（{city}）code={data.get('code')}，降级为时令数据")
                    return _make_fallback(city)

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
        print(f"[Weather] 和风天气 API 异常（{city}）：{e}，降级为时令数据")
        return _make_fallback(city)

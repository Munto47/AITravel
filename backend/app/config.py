from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # LLM
    openai_api_key: str = ""
    openai_api_url: str = "https://api.openai.com/v1"

    # 高德地图
    amap_api_key: str = ""
    amap_js_key: str = ""
    amap_mock: bool = True  # 默认 Mock，保护配额

    # 和风天气
    qweather_key: str = ""

    # 数据库
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/travel_agent"
    redis_url: str = "redis://localhost:6379"

    # Demo 模式
    demo_mode: bool = False

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

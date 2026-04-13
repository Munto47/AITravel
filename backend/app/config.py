from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # LLM — OpenAI 兼容接口（Router / Synthesizer / RAG Embedding）
    # 支持 OpenAI 官方 / SiliconFlow / DeepSeek / 其他兼容服务
    openai_api_key: str = ""
    openai_api_url: str = "https://api.openai.com/v1"

    # LLM 模型名称（OpenAI 兼容模式下使用）
    # SiliconFlow 推荐：Qwen/Qwen2.5-7B-Instruct 或 deepseek-ai/DeepSeek-V3
    llm_model_router: str = "Qwen/Qwen2.5-7B-Instruct"
    llm_model_synthesizer: str = "Qwen/Qwen2.5-7B-Instruct"

    # 高德地图
    amap_api_key: str = ""
    amap_js_key: str = ""
    amap_mock: bool = True  # 默认 Mock，保护配额

    # 和风天气
    qweather_api_key: str = ""

    # 数据库
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/travel_agent"
    redis_url: str = "redis://localhost:6379"

    # Demo 模式
    demo_mode: bool = False

    # CORS — 允许的前端 Origin（正则），生产环境按实际域名覆盖
    # 示例：https://(your-app\.vercel\.app|localhost(:\d+)?)
    cors_origin_regex: str = r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

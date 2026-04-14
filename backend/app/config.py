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
    qweather_api_host: str = "devapi.qweather.com"
    qweather_auth_type: str = "jwt"          # "jwt"（推荐）或 "apikey"
    # JWT 凭据（Ed25519）—— 私钥存 base64 正文，代码中拼接 PEM 头尾
    qweather_private_key: str = ""           # PKCS8 Ed25519 私钥 base64 正文
    qweather_key_id: str = ""               # 控制台凭据 ID（kid）
    qweather_project_id: str = ""           # 控制台项目 ID（sub）

    # 数据库
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/travel_agent"
    redis_url: str = "redis://localhost:6379"

    # Demo 模式
    demo_mode: bool = False

    # CORS — 允许的前端 Origin（正则）；自定义域名请在 Variables 中覆盖
    # 默认含 localhost 与 *.railway.app（含 up.railway.app）
    cors_origin_regex: str = (
        r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"
        r"|^https://([a-zA-Z0-9.-]+\.)*railway\.app$"
    )

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

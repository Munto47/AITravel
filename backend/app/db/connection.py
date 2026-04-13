"""
asyncpg 连接池初始化，含 pgvector 自动注册。
"""

import asyncpg
from pgvector.asyncpg import register_vector
from app.config import settings

_pool = None


async def get_pool() -> asyncpg.Pool:
    """获取全局连接池（懒初始化）"""
    global _pool
    if _pool is None:
        # asyncpg 使用 postgresql:// 格式（不带 +asyncpg）
        dsn = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
        # init=register_vector 使所有连接自动支持 pgvector 类型，无需每次手动注册
        _pool = await asyncpg.create_pool(dsn, min_size=2, max_size=10, init=register_vector)
    return _pool


async def close_pool():
    global _pool
    if _pool:
        await _pool.close()
        _pool = None

"""
asyncpg 连接池初始化

TODO (Sprint 1): 配置 asyncpg 连接池
当前为骨架，各节点直接使用 asyncpg 连接。
"""

import asyncpg
from app.config import settings

_pool = None


async def get_pool() -> asyncpg.Pool:
    """获取全局连接池（懒初始化）"""
    global _pool
    if _pool is None:
        # asyncpg 使用 postgresql:// 格式（不带 +asyncpg）
        dsn = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
        _pool = await asyncpg.create_pool(dsn, min_size=2, max_size=10)
    return _pool


async def close_pool():
    global _pool
    if _pool:
        await _pool.close()
        _pool = None

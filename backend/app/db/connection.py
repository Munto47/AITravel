"""
asyncpg 连接池初始化，含 pgvector 自动注册。
"""

import asyncpg
from pgvector.asyncpg import register_vector
from app.config import settings
from app.db.dsn import asyncpg_dsn_and_ssl

_pool = None


async def get_pool() -> asyncpg.Pool:
    """获取全局连接池（懒初始化）"""
    global _pool
    if _pool is None:
        dsn, ssl_arg = asyncpg_dsn_and_ssl(settings.database_url)
        kwargs: dict = {"min_size": 2, "max_size": 10, "init": register_vector}
        if ssl_arg is not None:
            kwargs["ssl"] = ssl_arg
        _pool = await asyncpg.create_pool(dsn, **kwargs)
    return _pool


async def close_pool():
    global _pool
    if _pool:
        await _pool.close()
        _pool = None

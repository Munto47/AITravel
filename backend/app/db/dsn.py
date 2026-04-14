"""
PostgreSQL 连接串归一化：去掉 SQLAlchemy async 前缀、根据 sslmode 推导 asyncpg 的 ssl 参数。
托管库（Railway / Neon 等）常见 ?sslmode=require。
"""

from __future__ import annotations

from urllib.parse import parse_qs, urlencode, urlparse, urlunparse


def strip_sqlalchemy_async_prefix(url: str) -> str:
    if url.startswith("postgresql+asyncpg://"):
        return "postgresql://" + url[len("postgresql+asyncpg://") :]
    return url


def asyncpg_dsn_and_ssl(database_url: str) -> tuple[str, bool | None]:
    """
    返回 asyncpg 可用的 DSN 与 ssl 参数。
    ssl 为 None 时不传 ssl 关键字，由驱动按 URL 默认行为处理。
    """
    dsn = strip_sqlalchemy_async_prefix(database_url)
    parsed = urlparse(dsn)
    qs = parse_qs(parsed.query, keep_blank_values=True)
    mode = (qs.get("sslmode") or [""])[0].lower()

    ssl_arg: bool | None = None
    if mode in ("require", "verify-ca", "verify-full"):
        ssl_arg = True
    elif mode == "disable":
        ssl_arg = False

    # 显式传 ssl= 时去掉 sslmode，避免与部分 asyncpg 版本重复解析
    if ssl_arg is not None and "sslmode" in qs:
        qs = {k: v for k, v in qs.items() if k != "sslmode"}
        new_query = urlencode(qs, doseq=True)
        clean = urlunparse(
            (
                parsed.scheme,
                parsed.netloc,
                parsed.path,
                parsed.params,
                new_query,
                parsed.fragment,
            )
        )
        return clean, ssl_arg
    return dsn, ssl_arg


def langgraph_postgres_dsn(database_url: str) -> str:
    """LangGraph AsyncPostgresSaver / psycopg 使用的 postgresql:// 连接串（保留 sslmode 等查询参数）。"""
    return strip_sqlalchemy_async_prefix(database_url)

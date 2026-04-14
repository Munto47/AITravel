"""
一次性执行 app/db/init.sql（托管 Postgres 空库首次部署时使用）。

用法（在 backend 目录下，已配置 DATABASE_URL）：
  python scripts/apply_init_sql.py

需已安装 psycopg（requirements 已包含）。依赖 app.config 读取 .env。
"""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from psycopg import connect  # noqa: E402

from app.config import settings  # noqa: E402
from app.db.dsn import langgraph_postgres_dsn  # noqa: E402


def main() -> None:
    dsn = langgraph_postgres_dsn(settings.database_url)
    init_path = BACKEND_ROOT / "app" / "db" / "init.sql"
    sql = init_path.read_text(encoding="utf-8")
    # CREATE EXTENSION 等在部分环境下需 autocommit
    with connect(dsn, autocommit=True) as conn:
        conn.execute(sql)
    print(f"[apply_init_sql] OK: {init_path}")


if __name__ == "__main__":
    main()

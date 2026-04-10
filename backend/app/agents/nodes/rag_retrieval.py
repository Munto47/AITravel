"""
RAGRetrieval 节点：游记向量检索

输入：state.query_rewrite, state.messages（提取城市）
输出：state.rag_chunks（chunk 列表）

每个 chunk 结构：
{
    "content": str,         # 游记段落文本
    "place_ids": list[str], # 关联的高德 POI IDs（Entity Linking 结果）
    "note_id": str,         # 游记文档 ID（可溯源）
    "similarity": float,    # 余弦相似度（0~1）
}

检索逻辑：
1. 调用 text-embedding-3-small 生成查询向量
2. pgvector IVFFlat 索引检索（先 city 过滤，再余弦距离排序）
3. 过滤 similarity < 0.7 的低相关结果
"""

from openai import AsyncOpenAI

from app.agents.state import AgentState
from app.config import settings
from app.db.connection import get_pool

# 已知城市列表（与 amap_search.py 保持一致）
_KNOWN_CITIES = ["北京", "上海", "成都", "厦门", "广州", "深圳", "杭州", "西安", "重庆"]
_SIMILARITY_THRESHOLD = 0.7

_openai_client: AsyncOpenAI | None = None


def _get_openai_client() -> AsyncOpenAI:
    global _openai_client
    if _openai_client is None:
        _openai_client = AsyncOpenAI(
            api_key=settings.openai_api_key,
            base_url=settings.openai_api_url,
        )
    return _openai_client


def _extract_city(state: AgentState) -> str:
    """从对话历史中提取城市名（简单关键词匹配）"""
    for msg in reversed(state["messages"]):
        content = str(msg.content)
        for city in _KNOWN_CITIES:
            if city in content:
                return city
    return "成都"  # 默认城市（面试 Demo 主城市）


async def run(state: AgentState) -> dict:
    """RAGRetrieval 节点入口函数"""
    query = state.get("query_rewrite") or ""
    city = _extract_city(state)

    if not query:
        return {"rag_chunks": []}

    # Demo 模式跳过（避免无 API key 时报错）
    if settings.demo_mode:
        print("[RAGRetrieval] Demo 模式，返回空 chunks")
        return {"rag_chunks": []}

    if not settings.openai_api_key:
        print("[RAGRetrieval] 未配置 OPENAI_API_KEY，返回空 chunks")
        return {"rag_chunks": []}

    try:
        # 1. 生成查询向量
        client = _get_openai_client()
        emb_resp = await client.embeddings.create(
            model="text-embedding-3-small",
            input=query,
        )
        query_vector = emb_resp.data[0].embedding

        # 2. pgvector 检索（city 精确过滤 + 余弦距离升序 = 相似度降序）
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT content, place_ids, note_id,
                       1 - (embedding <=> $1::vector) AS similarity
                FROM travel_notes_chunks
                WHERE city = $2
                ORDER BY embedding <=> $1::vector
                LIMIT 8
                """,
                query_vector,
                city,
            )

        # 3. 过滤低相关结果
        chunks = [
            {
                "content": row["content"],
                "place_ids": list(row["place_ids"] or []),
                "note_id": row["note_id"],
                "similarity": float(row["similarity"]),
            }
            for row in rows
            if float(row["similarity"]) >= _SIMILARITY_THRESHOLD
        ]

        print(f"[RAGRetrieval] city={city}, query={query[:30]}..., 命中 {len(chunks)}/{len(rows)} 条 chunks")
        return {"rag_chunks": chunks}

    except Exception as e:
        print(f"[RAGRetrieval] 检索失败，返回空 chunks：{e}")
        return {"rag_chunks": []}

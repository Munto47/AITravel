"""
RAGRetrieval 节点：游记向量检索

输入：state.query_rewrite, state.messages（提取城市）
输出：state.rag_chunks（chunk 列表）

每个 chunk 结构：
{
    "content": str,         # 游记段落文本
    "place_ids": list[str], # 关联的高德 POI IDs
    "note_id": str,         # 游记文档 ID（可溯源）
    "similarity": float,    # 向量相似度
}

TODO (Sprint 3):
1. 连接 asyncpg 连接池
2. 调用 OpenAI text-embedding-3-small 生成查询向量
3. pgvector 相似度检索（ivfflat 索引）
4. 过滤 similarity < 0.7 的结果
"""

from app.agents.state import AgentState
from app.config import settings


async def run(state: AgentState) -> dict:
    """RAGRetrieval 节点入口函数（骨架，Sprint 3 实现）"""
    # TODO: Sprint 3 实现
    # 1. 从 state.messages 提取城市
    # 2. 生成查询向量（embedding）
    # 3. pgvector 检索：
    #    SELECT id, content, place_ids, note_id,
    #           1 - (embedding <=> $1::vector) AS similarity
    #    FROM travel_notes_chunks
    #    WHERE city = $2
    #    ORDER BY similarity DESC
    #    LIMIT 8
    # 4. 过滤低相关结果（similarity < 0.7）

    print("[RAGRetrieval] 骨架节点，返回空 chunks（Sprint 3 实现）")
    return {"rag_chunks": []}

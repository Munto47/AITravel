"""
Synthesizer 节点：数据合并 + 回复生成

输入：state.amap_places, state.rag_chunks
输出：state.synthesized_places（Place 列表，含 rag_meta）, state.final_response（回复文本）

工作流程：
1. 将 rag_chunks 中的内容与 amap_places 关联（通过 place_ids 字段）
2. LLM 提取每个地点的 tip_snippets（1-3条避坑语）+ sentiment_score
3. 生成用户友好的推荐说明文字
4. 输出填充了 rag_meta 的 Place 列表

TODO (Sprint 2-3 完善):
- 真实 LLM 调用生成 tip_snippets 和 final_response
- RAG chunks 与 Place 的 entity 关联逻辑
"""

import json
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage

from app.agents.state import AgentState
from app.config import settings
from app.schemas.place import Place, PlaceRAGMeta

SYNTHESIZER_PROMPT = """你是旅行规划助手。根据以下 POI 数据和游记摘录，生成简洁的推荐回复。

高德 POI 数据（客观）：
{amap_places_json}

游记经验摘录（主观，可能为空）：
{rag_chunks_text}

任务：
1. 如果有游记数据，为相关 POI 提取 1-3 条避坑/推荐语
2. 生成一段自然的推荐说明文字（150字以内，友好亲切）
3. 必须返回合法 JSON，格式：
   {{"response_text": "...", "place_updates": [{{"place_id": "...", "tip_snippets": [...], "sentiment_score": 0.8}}]}}
不要包含任何其他文字。"""

_llm = None


def get_llm():
    global _llm
    if _llm is None:
        _llm = ChatAnthropic(
            model="claude-sonnet-4-6",
            api_key=settings.anthropic_api_key,
            max_tokens=1000,
        )
    return _llm


async def run(state: AgentState) -> dict:
    """Synthesizer 节点入口函数"""
    amap_places: list[Place] = state.get("amap_places", [])
    rag_chunks: list[dict] = state.get("rag_chunks", [])

    if not amap_places:
        return {
            "synthesized_places": [],
            "final_response": "抱歉，暂时没有找到相关地点，请换个描述方式试试。",
        }

    # Demo 模式：直接返回 amap_places，不调用 LLM
    if settings.demo_mode:
        return {
            "synthesized_places": amap_places,
            "final_response": f"为您找到了 {len(amap_places)} 个相关地点，请查看右侧地点列表。",
        }

    try:
        amap_json = json.dumps(
            [p.model_dump(exclude={"rag_meta", "cluster_id", "visit_order"}) for p in amap_places[:8]],
            ensure_ascii=False,
            indent=2,
        )
        rag_text = "\n\n".join(c["content"] for c in rag_chunks[:5]) if rag_chunks else "（无游记数据）"

        llm = get_llm()
        response = await llm.ainvoke([
            SystemMessage(content="你是旅行规划助手，返回格式严格的 JSON。"),
            HumanMessage(content=SYNTHESIZER_PROMPT.format(
                amap_places_json=amap_json,
                rag_chunks_text=rag_text,
            )),
        ])

        raw = response.content.strip()
        import re
        json_match = re.search(r'\{.*\}', raw, re.DOTALL)
        if json_match:
            result = json.loads(json_match.group())
            # 将 tip_snippets 填入 Place 对象
            updates = {u["place_id"]: u for u in result.get("place_updates", [])}
            enriched = []
            for place in amap_places:
                if place.place_id in updates:
                    u = updates[place.place_id]
                    place = place.model_copy(update={
                        "rag_meta": PlaceRAGMeta(
                            tip_snippets=u.get("tip_snippets", [])[:3],
                            sentiment_score=u.get("sentiment_score", 0.0),
                            source_note_ids=[c["note_id"] for c in rag_chunks if place.place_id in c.get("place_ids", [])],
                        )
                    })
                enriched.append(place)

            return {
                "synthesized_places": enriched,
                "final_response": result.get("response_text", f"为您找到了 {len(enriched)} 个相关地点。"),
            }
    except Exception as e:
        print(f"[Synthesizer] LLM 调用失败：{e}")

    # 降级：直接返回 amap 数据，无 rag_meta
    return {
        "synthesized_places": amap_places,
        "final_response": f"为您找到了 {len(amap_places)} 个相关地点，请查看地点列表。",
    }

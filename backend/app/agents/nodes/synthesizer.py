"""
Synthesizer 节点：数据合并 + 回复生成

输入：state.amap_places, state.rag_chunks
输出：state.synthesized_places（Place 列表，含 rag_meta）, state.final_response（回复文本）

LLM 优先级：
1. Anthropic Claude Sonnet（若 ANTHROPIC_API_KEY 有效）
2. OpenAI 兼容接口（SiliconFlow / OpenAI，使用 llm_model_synthesizer）
3. 降级：直接返回 amap_places
"""

import json
import re
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
2. 生成一段自然的推荐说明文字（150字以内，友好亲切，用中文）
3. 必须返回合法 JSON，格式：
   {{"response_text": "...", "place_updates": [{{"place_id": "...", "tip_snippets": [...], "sentiment_score": 0.8}}]}}
不要包含任何其他文字。"""


def _is_anthropic_key_valid() -> bool:
    """检查 Anthropic API Key 是否像是有效 key（非占位符）"""
    key = settings.anthropic_api_key
    return bool(key) and key.startswith("sk-ant-") and len(key) > 30 and "your-key" not in key


def _get_llm():
    """
    获取 LLM 实例：优先 Anthropic Claude Sonnet，回退到 OpenAI 兼容接口。
    """
    if _is_anthropic_key_valid():
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(
            model="claude-sonnet-4-6",
            api_key=settings.anthropic_api_key,
            max_tokens=1000,
        )
    elif settings.openai_api_key:
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            model=settings.llm_model_synthesizer,
            api_key=settings.openai_api_key,
            base_url=settings.openai_api_url,
            max_tokens=1000,
            temperature=0.3,
        )
    return None


async def run(state: AgentState) -> dict:
    """Synthesizer 节点入口函数"""
    amap_places: list[Place] = state.get("amap_places", [])
    rag_chunks: list[dict] = state.get("rag_chunks", [])
    trip_city: str = state.get("trip_city") or "该城市"

    if not amap_places:
        return {
            "synthesized_places": [],
            "final_response": "抱歉，暂时没有找到相关地点，请换个描述方式试试。",
        }

    # Demo 模式：直接返回 amap_places，不调用 LLM
    if settings.demo_mode:
        return {
            "synthesized_places": amap_places,
            "final_response": f"为您找到了 {len(amap_places)} 个{trip_city}相关地点，请查看右侧地点列表。",
        }

    try:
        llm = _get_llm()
        if llm is None:
            raise RuntimeError("无可用 LLM")

        amap_json = json.dumps(
            [p.model_dump(exclude={"rag_meta", "cluster_id", "visit_order"}) for p in amap_places[:8]],
            ensure_ascii=False,
            indent=2,
        )
        rag_text = "\n\n".join(c["content"] for c in rag_chunks[:5]) if rag_chunks else "（无游记数据）"

        response = await llm.ainvoke([
            SystemMessage(content="你是旅行规划助手，返回格式严格的 JSON，不要加 markdown 代码块。"),
            HumanMessage(content=SYNTHESIZER_PROMPT.format(
                amap_places_json=amap_json,
                rag_chunks_text=rag_text,
            )),
        ])

        raw = response.content.strip()
        # 去掉可能的 markdown 代码块
        raw = re.sub(r'^```(?:json)?\s*', '', raw, flags=re.MULTILINE)
        raw = re.sub(r'\s*```$', '', raw, flags=re.MULTILINE)
        raw = raw.strip()

        json_match = re.search(r'\{.*\}', raw, re.DOTALL)
        if json_match:
            result = json.loads(json_match.group())
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

            response_text = result.get("response_text", f"为您找到了 {len(enriched)} 个相关地点。")
            return {
                "synthesized_places": enriched,
                "final_response": response_text,
            }
    except Exception as e:
        print(f"[Synthesizer] LLM 调用失败，直接返回高德数据：{e}")

    # 降级：直接返回 amap 数据，无 rag_meta
    return {
        "synthesized_places": amap_places,
        "final_response": f"为您找到了 {len(amap_places)} 个{trip_city}地点，请查看地点列表选择感兴趣的。",
    }

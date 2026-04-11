"""
Router 节点：意图分类 + 查询改写

输入：state.messages（取最后一条 human 消息）
输出：state.intent ("rag" | "amap" | "both"), state.query_rewrite

路由逻辑：
- "rag"  → 主观/体验类（避坑、攻略、适合人群、游记经验）→ RAGRetrieval 节点
- "amap" → 客观/属性类（找餐厅、附近景点、评分、营业时间）→ AmapSearch 节点
- "both" → 两者都需要 → AmapSearch 节点（完成后再走 RAGRetrieval）

LLM 优先级：
1. Anthropic Claude Haiku（若 ANTHROPIC_API_KEY 有效）
2. OpenAI 兼容接口（SiliconFlow / OpenAI，使用 llm_model_router）
3. Demo 模式降级
"""

import json
import re
from langchain_core.messages import HumanMessage, SystemMessage

from app.agents.state import AgentState
from app.config import settings

ROUTER_SYSTEM_PROMPT = """你是一个旅行助手的意图分类器。

分析用户的问题，判断需要：
- "rag"：主要依赖游记、旅行经验、避坑攻略（主观/体验类问题）
  例：带老人有什么注意、哪里人少、当地人推荐的地方
- "amap"：主要依赖真实 POI 数据（客观属性类问题）
  例：找个附近的火锅、评分高的景点、几点开门、推荐景点
- "both"：两者都需要
  例：找个口碑好的景点（需要 POI 评分 + 游记体验）

同时，将用户查询改写为更适合高德 POI 搜索的形式（去除口语、提取核心 POI 关键词，如"宽窄巷子""火锅""熊猫基地"）。

必须返回合法 JSON，格式：{"intent": "rag|amap|both", "rewritten_query": "改写后的查询"}
不要包含任何其他文字。"""


def _is_anthropic_key_valid() -> bool:
    """检查 Anthropic API Key 是否像是有效 key（非占位符）"""
    key = settings.anthropic_api_key
    return bool(key) and key.startswith("sk-ant-") and len(key) > 30 and "your-key" not in key


def _get_llm():
    """
    获取 LLM 实例：优先 Anthropic Claude Haiku，回退到 OpenAI 兼容接口。
    """
    if _is_anthropic_key_valid():
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(
            model="claude-haiku-4-5-20251001",
            api_key=settings.anthropic_api_key,
            max_tokens=200,
        )
    elif settings.openai_api_key:
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            model=settings.llm_model_router,
            api_key=settings.openai_api_key,
            base_url=settings.openai_api_url,
            max_tokens=200,
            temperature=0,
        )
    return None


async def run(state: AgentState) -> dict:
    """Router 节点入口函数"""
    # 取最后一条用户消息
    human_messages = [m for m in state["messages"] if isinstance(m, HumanMessage)]
    if not human_messages:
        return {"intent": "amap", "query_rewrite": "旅游景点推荐"}

    last_query = human_messages[-1].content
    trip_city = state.get("trip_city") or "成都"

    # Demo 模式跳过 LLM
    if settings.demo_mode:
        return {"intent": "amap", "query_rewrite": last_query}

    try:
        llm = _get_llm()
        if llm is None:
            print("[Router] 无可用 LLM，回退到 amap 模式")
            return {"intent": "amap", "query_rewrite": last_query}

        response = await llm.ainvoke([
            SystemMessage(content=ROUTER_SYSTEM_PROMPT),
            HumanMessage(content=f"目的地城市：{trip_city}\n用户问题：{last_query}"),
        ])

        # 解析 JSON 响应
        raw = response.content.strip()
        json_match = re.search(r'\{.*\}', raw, re.DOTALL)
        if json_match:
            result = json.loads(json_match.group())
            intent = result.get("intent", "amap")
            if intent not in ("rag", "amap", "both"):
                intent = "amap"
            rewritten = result.get("rewritten_query", last_query)
            print(f"[Router] intent={intent}, rewritten_query={rewritten}")
            return {
                "intent": intent,
                "query_rewrite": rewritten,
            }
    except Exception as e:
        print(f"[Router] LLM 调用失败，回退到 amap：{e}")

    return {"intent": "amap", "query_rewrite": last_query}

"""
Router 节点：意图分类 + 查询改写

输入：state.messages（取最后一条 human 消息）
输出：state.intent ("rag" | "amap" | "both"), state.query_rewrite

路由逻辑：
- "rag"  → 主观/体验类（避坑、攻略、适合人群、游记经验）→ RAGRetrieval 节点
- "amap" → 客观/属性类（找餐厅、附近景点、评分、营业时间）→ AmapSearch 节点
- "both" → 两者都需要 → AmapSearch 节点（完成后再走 RAGRetrieval）
"""

import json
import re
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage

from app.agents.state import AgentState
from app.config import settings

ROUTER_SYSTEM_PROMPT = """你是一个旅行助手的意图分类器。

分析用户的问题，判断需要：
- "rag"：主要依赖游记、旅行经验、避坑攻略（主观/体验类问题）
  例：带老人有什么注意、哪里人少、当地人推荐的地方
- "amap"：主要依赖真实 POI 数据（客观属性类问题）
  例：找个附近的火锅、评分高的景点、几点开门
- "both"：两者都需要
  例：找个口碑好的景点（需要 POI 评分 + 游记体验）

同时，将用户查询改写为更适合数据库检索的形式（去除口语、提取核心需求）。

必须返回合法 JSON，格式：{"intent": "rag|amap|both", "rewritten_query": "改写后的查询"}
不要包含任何其他文字。"""


_llm = None


def get_llm():
    global _llm
    if _llm is None:
        _llm = ChatAnthropic(
            model="claude-haiku-4-5-20251001",  # 用 Haiku 做分类，成本低速度快
            api_key=settings.anthropic_api_key,
            max_tokens=200,
        )
    return _llm


async def run(state: AgentState) -> dict:
    """Router 节点入口函数"""
    # 取最后一条用户消息
    human_messages = [m for m in state["messages"] if isinstance(m, HumanMessage)]
    if not human_messages:
        return {"intent": "amap", "query_rewrite": "旅游景点推荐"}

    last_query = human_messages[-1].content

    # Demo 模式跳过 LLM
    if settings.demo_mode:
        return {"intent": "amap", "query_rewrite": last_query}

    try:
        llm = get_llm()
        response = await llm.ainvoke([
            SystemMessage(content=ROUTER_SYSTEM_PROMPT),
            HumanMessage(content=last_query),
        ])

        # 解析 JSON 响应
        raw = response.content.strip()
        # 尝试提取 JSON（防止 LLM 加了多余文字）
        json_match = re.search(r'\{.*\}', raw, re.DOTALL)
        if json_match:
            result = json.loads(json_match.group())
            intent = result.get("intent", "amap")
            if intent not in ("rag", "amap", "both"):
                intent = "amap"
            return {
                "intent": intent,
                "query_rewrite": result.get("rewritten_query", last_query),
            }
    except Exception as e:
        print(f"[Router] LLM 调用失败，回退到 amap：{e}")

    return {"intent": "amap", "query_rewrite": last_query}

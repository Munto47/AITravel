"""
游记入库脚本骨架

用法：python -m scripts.ingest_notes

TODO (Sprint 3 完整实现):
1. 调用 LLM 批量生成游记 JSON（北京/上海/成都/厦门各 20 篇）
2. Entity Linking：地点名 → 高德 POI ID
3. 分块（chunk_size=500, overlap=50）+ Embedding
4. 写入 pgvector
"""

import asyncio
import json
import uuid
from pathlib import Path

# ===== 游记数据示例（Sprint 3 用 LLM 批量生成替换）=====
SAMPLE_NOTES = [
    {
        "id": "note-cd-001",
        "title": "成都 3 日亲子游全攻略",
        "city": "成都",
        "content": """第一天去熊猫基地，建议早上 8 点前到，大熊猫在早晨最活跃。
门口有很多黄牛卖票，不要上当，直接官网预约。
里面很大，建议带婴儿车，否则孩子走累了很麻烦。
下午去春熙路和太古里逛逛，这里购物方便，周边餐厅也多。
推荐吃芙蓉树下的串串，份量足，价格实惠，老店排队但值得等。

第二天去都江堰，离市区约 1 小时车程，建议打车或拼车。
景区内爬山路段较多，带老人和孩子要注意安全，穿舒适的鞋。
午饭在景区外面吃，比里面便宜一半，有正宗的土鸡汤。
下午可以去青城山，但山路较陡，不适合带婴儿车的家庭。

第三天宽窄巷子，人很多但值得去感受成都烟火气。
窄巷子有很多特色小吃，糖油果子必吃，一串 5 元。
注意：宽巷子商业化较重，推荐重点逛窄巷子和井巷子。
下午锦里也可以逛逛，里面有三国文化元素，孩子会喜欢。""",
        "tags": ["亲子", "成都", "熊猫基地", "宽窄巷子"],
        "places_mentioned": ["熊猫基地", "春熙路", "太古里", "都江堰", "青城山", "宽窄巷子", "锦里"],
    }
]

GENERATE_PROMPT = """生成一篇真实感强的{city} {days}日游记，要求：
1. 包含具体地点名称（使用当地常见景点/餐厅名）
2. 包含至少 3 条具体避坑经验（如"xx景点北门排队少，建议走北门"）
3. 包含适合人群描述（亲子/带老人/年轻人/情侣）
4. 字数 800-1000 字，第一人称叙述
返回 JSON：{{"id": "note-{city_en}-{idx:03d}", "title": "...", "city": "{city}", "content": "...", "tags": [...], "places_mentioned": [地点名列表]}}
不要包含其他文字。"""


async def generate_notes():
    """TODO: Sprint 3 实现 - 调用 LLM 批量生成游记"""
    print("TODO: 使用 SAMPLE_NOTES 占位，Sprint 3 用 LLM 批量生成")
    return SAMPLE_NOTES


async def entity_linking(note: dict) -> dict:
    """TODO: Sprint 3 实现 - 地点名 → 高德 POI ID 关联"""
    print(f"TODO: Entity Linking for {note['title']}")
    # 示例：调用高德 POI 搜索，取第一个结果的 id
    # place_id_map = {}
    # for place_name in note["places_mentioned"]:
    #     pois = await amap_client.search_poi(keywords=place_name, city=note["city"])
    #     if pois:
    #         place_id_map[place_name] = pois[0]["id"]
    return note


async def ingest_to_pgvector(note: dict):
    """TODO: Sprint 3 实现 - 分块 + Embedding + 写入 pgvector"""
    print(f"TODO: 入库 {note['title']}")
    # 1. 按句子分块（chunk_size=500, overlap=50）
    # 2. 调用 OpenAI text-embedding-3-small 获取 embedding
    # 3. asyncpg 批量插入 travel_notes_chunks


async def main():
    print("=== 游记入库脚本（骨架）===")
    notes = await generate_notes()
    for note in notes:
        linked = await entity_linking(note)
        await ingest_to_pgvector(linked)
    print(f"处理完成：{len(notes)} 篇游记")


if __name__ == "__main__":
    asyncio.run(main())

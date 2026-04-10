"""
GET /api/room/{room_id}/state - 房间状态查询
POST /api/room              - 创建房间

房间元数据持久化到 PostgreSQL rooms 表（schema 见 db/init.sql）。
place_count 字段由 Yjs 层管理，后端固定返回 0。
"""

from fastapi import APIRouter, HTTPException

from app.db.connection import get_pool
from app.schemas.api import RoomStateResponse

router = APIRouter()


@router.get("/room/{room_id}/state", response_model=RoomStateResponse)
async def get_room_state(room_id: str):
    """获取房间状态元数据"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT room_id, thread_id, phase, trip_city, trip_days FROM rooms WHERE room_id = $1",
            room_id,
        )
    if not row:
        raise HTTPException(status_code=404, detail=f"房间 {room_id} 不存在")
    return RoomStateResponse(**dict(row), place_count=0)


@router.post("/room")
async def create_room(body: dict):
    """
    创建新房间（幂等）。

    请求体：{room_id, thread_id, trip_city?, trip_days?}
    """
    room_id = body.get("room_id")
    thread_id = body.get("thread_id")
    if not room_id or not thread_id:
        raise HTTPException(status_code=400, detail="room_id 和 thread_id 必填")

    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO rooms (room_id, thread_id, trip_city, trip_days, phase)
            VALUES ($1, $2, $3, $4, 'exploring')
            ON CONFLICT (room_id) DO NOTHING
            """,
            room_id,
            thread_id,
            body.get("trip_city"),
            body.get("trip_days", 3),
        )
    return {"status": "ok", "room_id": room_id}

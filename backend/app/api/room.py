"""
GET /api/room/{room_id}/state - 房间状态查询

用于前端初始化时获取房间元数据（thread_id 等）。
Yjs 协同数据存在 y-websocket，此接口只返回元数据。
"""

from fastapi import APIRouter, HTTPException

from app.schemas.api import RoomStateResponse

router = APIRouter()

# 内存存储（开发阶段，Sprint 4 替换为 PostgreSQL）
_rooms: dict[str, dict] = {}


@router.get("/room/{room_id}/state", response_model=RoomStateResponse)
async def get_room_state(room_id: str):
    """获取房间状态元数据"""
    if room_id not in _rooms:
        raise HTTPException(status_code=404, detail=f"房间 {room_id} 不存在")
    room = _rooms[room_id]
    return RoomStateResponse(**room)


@router.post("/room")
async def create_room(body: dict):
    """
    创建新房间。

    请求体：{room_id, thread_id, trip_city?, trip_days?}
    """
    room_id = body.get("room_id")
    thread_id = body.get("thread_id")
    if not room_id or not thread_id:
        raise HTTPException(status_code=400, detail="room_id 和 thread_id 必填")

    _rooms[room_id] = {
        "room_id": room_id,
        "thread_id": thread_id,
        "phase": "exploring",
        "trip_city": body.get("trip_city"),
        "trip_days": body.get("trip_days", 3),
        "place_count": 0,
    }
    return {"status": "ok", "room_id": room_id}

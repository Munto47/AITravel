from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import chat, optimize, room

app = FastAPI(
    title="AI 智能旅行协同规划系统",
    description="基于 LangGraph 多 Agent + Yjs 实时协同的旅行规划 MVP",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat.router, prefix="/api", tags=["chat"])
app.include_router(optimize.router, prefix="/api", tags=["optimize"])
app.include_router(room.router, prefix="/api", tags=["room"])


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "agentTravel-backend"}

"""FastAPI application factory. The REST API is the single point of business
logic, authorization, and audit — every other surface (GUI, MCP, agent) will be
a client of it."""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routers import (
    auth,
    catalog,
    chat,
    comments,
    metrics,
    notifications,
    organizations,
    projects,
    search,
    security,
    tasks,
    teams,
    users,
    voice,
)
from app.config import settings
from app.errors import AppError

logging.basicConfig(level=logging.INFO)


def create_app() -> FastAPI:
    app = FastAPI(
        title="AI-Native Task Management — REST API",
        version="0.1.0",
        description="Phase 1: business logic + authorization + audit over PostgreSQL (RLS).",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(AppError)
    async def _app_error_handler(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": exc.code, "message": exc.message}},
        )

    @app.get("/health", tags=["meta"])
    def health() -> dict:
        return {"status": "ok", "env": settings.ENV}

    app.include_router(auth.router)
    app.include_router(organizations.router)
    app.include_router(teams.router)
    app.include_router(projects.router)
    app.include_router(tasks.router)
    app.include_router(catalog.router)
    app.include_router(users.router)
    app.include_router(comments.router)
    app.include_router(security.router)
    app.include_router(notifications.router)
    app.include_router(metrics.router)
    app.include_router(chat.router)
    app.include_router(voice.router)
    app.include_router(search.router)
    return app


app = create_app()

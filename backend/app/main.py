"""FastAPI entry point for the PRISM desktop service."""

from __future__ import annotations

import logging
import sys
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api.compute import router as compute_router
from app.api.export_cfg import router as export_router
from app.api.import_csv import router as import_router
from app.api.project import router as project_router
from app.api.topology import router as topology_router
from app.core.config import get_settings
from app.core.exceptions import LspSimulatorError
from app.core.models import ErrorResponse


def _configure_logging() -> None:
    settings = get_settings()
    level = logging.INFO
    if settings.log_json:
        fmt = '{"level":"%(levelname)s","msg":"%(message)s","logger":"%(name)s"}'
    else:
        fmt = "%(asctime)s %(levelname)s %(name)s %(message)s"
    logging.basicConfig(level=level, format=fmt)


def _static_dir() -> Path | None:
    settings = get_settings()
    if settings.static_dir and settings.static_dir.is_dir():
        return settings.static_dir
    if getattr(sys, "frozen", False):
        dist = Path(sys._MEIPASS) / "frontend_dist"  # type: ignore[attr-defined]
        if dist.is_dir():
            return dist
        return None
    here = Path(__file__).resolve().parent.parent.parent
    dist = here / "frontend" / "dist"
    if dist.is_dir():
        return dist
    return None


def create_app() -> FastAPI:
    """Application factory used by uvicorn and PyInstaller."""

    _configure_logging()
    log = logging.getLogger(__name__)
    settings = get_settings()
    app = FastAPI(title="PRISM", version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(LspSimulatorError)
    async def lsp_error_handler(_request: Request, exc: LspSimulatorError) -> JSONResponse:
        body = ErrorResponse(error=exc.__class__.__name__, detail=exc.message).model_dump()
        return JSONResponse(status_code=exc.status_code, content=body)

    @app.exception_handler(RequestValidationError)
    async def validation_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
        body = ErrorResponse(error="ValidationError", detail=str(exc)).model_dump()
        return JSONResponse(status_code=422, content=body)

    app.include_router(import_router)
    app.include_router(project_router)
    app.include_router(compute_router)
    app.include_router(export_router)
    app.include_router(topology_router)

    @app.get("/api/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    static = _static_dir()
    if static is not None:
        app.mount("/", StaticFiles(directory=str(static), html=True), name="static")
        log.info("Serving static frontend from %s", static)
    else:
        log.warning("Static frontend not found; API-only mode")

    return app


app = create_app()


def run() -> None:
    """CLI entry point for packaged executable."""

    import uvicorn

    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        log_level="info",
        reload=False,
    )


if __name__ == "__main__" and not getattr(sys, "frozen", False):
    run()

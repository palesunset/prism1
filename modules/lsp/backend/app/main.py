"""FastAPI entry point for the PRISM desktop service."""

from __future__ import annotations

import logging
import sys
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse

from app.api.compute import router as compute_router
from app.api.export_cfg import router as export_router
from app.api.import_csv import router as import_router
from app.api.project import router as project_router
from app.api.topology import router as topology_router
from app.api.traffic_relief import router as traffic_relief_router
from app.api.traffic_paths import router as traffic_paths_router
from app.api.traffic_simulate import router as traffic_sim_router
from app.core.config import get_settings
from app.core.exceptions import LspSimulatorError
from app.core.models import ErrorResponse
from contextlib import asynccontextmanager

from app.state import topology
from app.services import topology_store


def _configure_logging() -> None:
    settings = get_settings()
    level = logging.INFO
    if settings.log_json:
        fmt = '{"level":"%(levelname)s","msg":"%(message)s","logger":"%(name)s"}'
    else:
        fmt = "%(asctime)s %(levelname)s %(name)s %(message)s"
    logging.basicConfig(level=level, format=fmt)


def _repo_root() -> Path:
    """Resolve repository root from backend/app/main.py (supports modules/lsp layout)."""
    start = Path(__file__).resolve()
    for candidate in start.parents:
        if (candidate / "package.json").is_file() and (candidate / "platform").is_dir():
            return candidate
    return start.parent.parent.parent


def _static_dir() -> Path | None:
    settings = get_settings()
    if settings.static_dir and settings.static_dir.is_dir():
        return settings.static_dir
    if getattr(sys, "frozen", False):
        dist = Path(sys._MEIPASS) / "frontend_dist"  # type: ignore[attr-defined]
        if dist.is_dir():
            return dist
        return None
    root = _repo_root()
    for candidate in (
        root / "platform" / "frontend" / "dist",
        root / "modules" / "lsp" / "frontend" / "dist",
    ):
        if candidate.is_dir():
            return candidate
    return None


def _register_spa_routes(app: FastAPI, log: logging.Logger) -> None:
    """Serve built UI with index.html fallback so /lsp and /inventory survive refresh."""

    static = _static_dir()
    dev_ui_html = """<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>PRISM — dev UI</title></head>
<body style="font-family:system-ui;background:#0f172a;color:#e2e8f0;padding:2rem">
  <h1>PRISM API only</h1>
  <p>The web UI is not built on this server. For development, run from the repo root:</p>
  <pre style="background:#1e293b;padding:1rem;border-radius:8px">npm run dev</pre>
  <p>Then open <a href="http://localhost:5173/lsp" style="color:#38bdf8">http://localhost:5173/lsp</a>
  (not port 5000).</p>
</body>
</html>"""

    if static is None:

        @app.get("/{full_path:path}", include_in_schema=False)
        async def dev_ui_hint(full_path: str = "") -> HTMLResponse:
            if full_path.startswith("api") or full_path.startswith("api/"):
                raise HTTPException(status_code=404, detail="Not Found")
            return HTMLResponse(content=dev_ui_html, status_code=503)

        log.warning("Static frontend not found; API-only mode (use http://localhost:5173 in dev)")
        return

    index_html = static / "index.html"
    if not index_html.is_file():
        log.warning("Static dir %s missing index.html", static)
        return

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str = "") -> FileResponse:
        if full_path.startswith("api") or full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not Found")
        if full_path:
            asset = static / full_path
            if asset.is_file():
                return FileResponse(asset)
        return FileResponse(index_html)

    log.info("Serving static frontend from %s (SPA fallback enabled)", static)


def create_app() -> FastAPI:
    """Application factory used by uvicorn and PyInstaller."""

    _configure_logging()
    log = logging.getLogger(__name__)
    settings = get_settings()

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        if topology_store.try_load_topology(topology):
            log.info("Restored LSP topology from database")
        yield

    app = FastAPI(title="PRISM", version="0.1.0", lifespan=lifespan)

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
    app.include_router(traffic_sim_router)
    app.include_router(traffic_relief_router)
    app.include_router(traffic_paths_router)

    @app.get("/api/lsp/health")
    async def health() -> dict[str, str]:
        mode = "postgres" if topology_store.is_enabled() else "memory"
        return {"status": "ok", "storage": mode}

    _register_spa_routes(app, log)

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

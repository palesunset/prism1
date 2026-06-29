import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "modules" / "lsp" / "backend"
sys.path.insert(0, str(BACKEND))

from app.main import app  # noqa: E402 — Vercel ASGI entry

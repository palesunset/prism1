"""Desktop bootstrap: starts uvicorn and opens the local UI in a browser."""

from __future__ import annotations

import os
import sys
import threading
import time
import webbrowser


def main() -> None:
    backend = os.path.dirname(os.path.abspath(__file__))
    if backend not in sys.path:
        sys.path.insert(0, backend)

    import uvicorn

    from app.core.config import get_settings
    from app.main import app

    settings = get_settings()

    def open_browser() -> None:
        time.sleep(1.2)
        webbrowser.open(f"http://{settings.host}:{settings.port}/")

    threading.Thread(target=open_browser, daemon=True).start()
    uvicorn.run(app, host=settings.host, port=settings.port, log_level="info")


if __name__ == "__main__":
    main()

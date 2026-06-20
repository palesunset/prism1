# -*- mode: python ; coding: utf-8 -*-
# Single-file Windows build (see README). Run from repo root after: npm run build:platform
import os
from pathlib import Path

spec_dir = Path(os.path.abspath(SPEC)).resolve().parent
repo = spec_dir.parent
backend = repo / "modules" / "lsp" / "backend"

platform_dist = repo / "platform" / "frontend" / "dist"
lsp_dist = repo / "modules" / "lsp" / "frontend" / "dist"
frontend_dist = platform_dist if platform_dist.is_dir() else lsp_dist

block_cipher = None

datas = [
    (str(backend / "app" / "templates"), "app/templates"),
    (str(frontend_dist), "frontend_dist"),
    (str(repo / "modules" / "lsp" / "sample_data"), "sample_data"),
]

a = Analysis(
    [str(backend / "run_desktop.py")],
    pathex=[str(backend)],
    binaries=[],
    datas=datas,
    hiddenimports=[
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespan",
        "uvicorn.lifespan.on",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="prism",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

"""
NPS Digital Onboarding — FastAPI Application Entry Point

Aggregates all routers, configures middleware, serves static frontend,
and initializes the database on startup.
"""
import os
import time
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.config import get_settings
from app.database import init_db
from app.routes import session_router, kyc_router, payment_router, esign_router, admin_router, notification_router, pop_router

settings = get_settings()

# ─── Application Instance ───────────────────────────────────────────
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description=(
        "Production-grade API for NPS (National Pension System) digital onboarding. "
        "Covers session management, multi-path KYC (CKYC, Aadhaar, AI OCR, DigiLocker), "
        "risk assessment, e-Sign, UPI/UPI Lite/Netbanking payments, and PRAN generation."
    ),
    docs_url="/docs",
    redoc_url="/redoc",
)

# ─── Startup ─────────────────────────────────────────────────────────
BOOT_TIME = time.time()


@app.on_event("startup")
def on_startup():
    """Initialize database tables and log boot info."""
    init_db()

    # Ensure log directory
    os.makedirs(settings.LOG_DIR, exist_ok=True)

    boot_msg = (
        f"\n{'='*60}\n"
        f"  {settings.APP_NAME} v{settings.APP_VERSION}\n"
        f"  TIME: {datetime.now().isoformat()}\n"
        f"  GEMINI KEY: {'[OK] Loaded' if settings.GEMINI_API_KEY else '[!] Missing'}\n"
        f"  DATABASE: {settings.DATABASE_URL}\n"
        f"  DEBUG: {settings.DEBUG}\n"
        f"{'='*60}\n"
    )
    print(boot_msg)

    log_file = os.path.join(settings.LOG_DIR, "server.log")
    with open(log_file, "a") as f:
        f.write(boot_msg)


# ─── Middleware ──────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log every API request with timing."""
    start = time.time()
    response = await call_next(request)
    duration = round((time.time() - start) * 1000, 1)

    if request.url.path.startswith("/api"):
        print(f"  -> {request.method} {request.url.path} -> {response.status_code} ({duration}ms)")

    return response


# ─── API Routers ─────────────────────────────────────────────────────
app.include_router(session_router)
app.include_router(kyc_router)
app.include_router(payment_router)
app.include_router(esign_router)
app.include_router(admin_router)
app.include_router(notification_router)
app.include_router(pop_router)


@app.get("/health", tags=["Health"])
def deep_health():
    """Detailed health check including dependency statuses."""
    from app.database import SessionLocal
    from sqlalchemy import text
    db_ok = False
    try:
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db_ok = True
        db.close()
    except Exception:
        pass

    return {
        "status": "healthy" if db_ok else "degraded",
        "database": "connected" if db_ok else "disconnected",
        "ai_ocr": "available" if settings.GEMINI_API_KEY else "unavailable",
        "uptime_seconds": round(time.time() - BOOT_TIME, 1),
        "frontend_dir": str(FRONTEND_DIR),
        "frontend_exists": FRONTEND_DIR.exists(),
        "version": "1.0.2",
    }


# ─── Serve Frontend (Static Files) ──────────────────────────────────
FRONTEND_DIR = Path(__file__).resolve().parent.parent.parent / "frontend"

if FRONTEND_DIR.exists():
    # Mount at root so index.html, style.css, app.js are all available at /
    # Order matters: API routers are included above, so they take precedence.
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")

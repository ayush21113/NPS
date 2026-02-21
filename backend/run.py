"""
NPS Backend — Uvicorn Launcher
Run this file to start the development server.

Usage:
    python run.py
    python run.py --port 8000
    python run.py --reload
"""
import argparse
import uvicorn


def main():
    parser = argparse.ArgumentParser(description="NPS Digital Onboarding Backend Server")
    parser.add_argument("--host", default="0.0.0.0", help="Bind host (default: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=8000, help="Bind port (default: 8000)")
    parser.add_argument("--reload", action="store_true", help="Enable hot reload for development")
    parser.add_argument("--workers", type=int, default=1, help="Number of workers (default: 1)")

    args = parser.parse_args()

    print(f"""
    ========================================================
      NPS Digital Onboarding -- Backend Server
      API:     http://{args.host}:{args.port}
      Docs:    http://localhost:{args.port}/docs
      ReDoc:   http://localhost:{args.port}/redoc
      Frontend: http://localhost:{args.port}/
    ========================================================
    """)

    uvicorn.run(
        "app.main:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        workers=args.workers,
        log_level="info",
    )


if __name__ == "__main__":
    main()

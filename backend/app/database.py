"""
Database Engine & Session Management
SQLAlchemy async-ready setup with dependency injection for FastAPI.
"""
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base, Session

from app.config import get_settings

settings = get_settings()

# Ensure data directory exists
os.makedirs(os.path.dirname(settings.DATABASE_URL.replace("sqlite:///", "")), exist_ok=True)

engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False},  # Required for SQLite
    echo=settings.DEBUG,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """FastAPI dependency: yields a database session, auto-closes on finish."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create all tables. Called once at application startup."""
    from app.models import session as _session_model   # noqa: F401
    from app.models import audit as _audit_model       # noqa: F401
    from app.models import kyc as _kyc_model           # noqa: F401
    from app.models import payment as _payment_model   # noqa: F401

    Base.metadata.create_all(bind=engine)

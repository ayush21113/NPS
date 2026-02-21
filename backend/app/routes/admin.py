"""
Admin Routes — Regulator dashboard and audit trail access.
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models.session import UserSession
from app.models.audit import AuditLog
from app.schemas.schemas import AuditLogEntry, AdminDashboardResponse

router = APIRouter(prefix="/api/admin", tags=["Admin"])


@router.get("/dashboard", response_model=AdminDashboardResponse)
def get_dashboard(db: Session = Depends(get_db)):
    """Get aggregated dashboard metrics for regulators."""

    total = db.query(func.count(UserSession.id)).scalar() or 0
    completed = db.query(func.count(UserSession.id)).filter(
        UserSession.status == "completed"
    ).scalar() or 0
    pending = db.query(func.count(UserSession.id)).filter(
        UserSession.status.notin_(["completed", "started"])
    ).scalar() or 0

    completion_rate = (completed / total * 100) if total > 0 else 0.0

    # KYC method distribution
    kyc_methods = db.query(
        UserSession.kyc_method, func.count(UserSession.id)
    ).filter(
        UserSession.kyc_method.isnot(None)
    ).group_by(UserSession.kyc_method).all()
    kyc_dist = {m: c for m, c in kyc_methods}

    # Risk distribution
    risk_levels = db.query(
        UserSession.risk_level, func.count(UserSession.id)
    ).group_by(UserSession.risk_level).all()
    risk_dist = {r: c for r, c in risk_levels}

    # Average completion time (seconds)
    avg_time = 0.0
    completed_sessions = db.query(UserSession).filter(
        UserSession.status == "completed",
        UserSession.completed_at.isnot(None),
    ).all()
    if completed_sessions:
        total_seconds = sum(
            (s.completed_at - s.created_at).total_seconds()
            for s in completed_sessions
            if s.completed_at and s.created_at
        )
        avg_time = total_seconds / len(completed_sessions)

    return AdminDashboardResponse(
        total_onboardings=total,
        completion_rate=round(completion_rate, 1),
        pending_verification=pending,
        avg_completion_seconds=round(avg_time, 1),
        kyc_distribution=kyc_dist,
        risk_distribution=risk_dist,
    )


@router.get("/audit/{session_id}", response_model=list[AuditLogEntry])
def get_audit_trail(session_id: str, db: Session = Depends(get_db)):
    """Get the full audit trail for a session."""
    logs = db.query(AuditLog).filter(
        AuditLog.session_id == session_id
    ).order_by(AuditLog.timestamp.asc()).all()

    if not logs:
        raise HTTPException(status_code=404, detail="No audit logs found for this session")

    return logs


@router.get("/audit/{session_id}/verify")
def verify_audit_chain(session_id: str, db: Session = Depends(get_db)):
    """Verify the integrity of the audit hash chain for a session."""
    from app.services.audit_service import AuditService
    return AuditService.verify_chain(db, session_id)


@router.get("/sessions")
def list_sessions(
    status: str = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    """List all onboarding sessions with optional status filter."""
    query = db.query(UserSession).order_by(UserSession.created_at.desc())
    if status:
        query = query.filter(UserSession.status == status)

    sessions = query.offset(offset).limit(limit).all()
    total = query.count()

    return {
        "total": total,
        "sessions": [
            {
                "id": s.id,
                "status": s.status,
                "account_type": s.account_type,
                "kyc_method": s.kyc_method,
                "risk_level": s.risk_level,
                "pran": s.pran,
                "created_at": s.created_at.isoformat() if s.created_at else None,
                "completed_at": s.completed_at.isoformat() if s.completed_at else None,
            }
            for s in sessions
        ],
    }

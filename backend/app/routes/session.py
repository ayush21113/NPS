"""
Session Routes — Lifecycle management for onboarding sessions.
Handles: creation, status check, profile updates, completion.
"""
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Header, Request, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.session import UserSession
from app.schemas.schemas import (
    SessionStartRequest, SessionStartResponse, SessionStatusResponse,
    ProfileUpdateRequest, ProfileUpdateResponse, SessionResumeRequest,
)
from app.services.risk_engine import RiskEngine
from app.services.audit_service import AuditService

router = APIRouter(prefix="/api/session", tags=["Session"])


@router.post("/start", response_model=SessionStartResponse)
def start_session(
    payload: SessionStartRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Create a new onboarding session."""
    session_id = str(uuid.uuid4())
    resume_token = uuid.uuid4().hex[:12].upper()

    new_session = UserSession(
        id=session_id,
        resume_token=resume_token,
        account_type=payload.account_type,
        language=payload.lang,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent", "")[:256],
    )
    db.add(new_session)
    db.commit()

    # Audit
    AuditService.log(
        db, session_id, "SESSION_START",
        payload={"lang": payload.lang, "account_type": payload.account_type},
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent", "")[:256],
    )

    return SessionStartResponse(session_id=session_id, resume_token=resume_token)


@router.get("/status", response_model=SessionStatusResponse)
def get_session_status(
    session_id: str = Header(..., alias="session-id"),
    db: Session = Depends(get_db),
):
    """Get current status of a session."""
    session = db.query(UserSession).filter(UserSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return SessionStatusResponse(
        session_id=session.id,
        status=session.status,
        risk_level=session.risk_level,
        kyc_method=session.kyc_method,
        esign_complete=session.esign_complete,
        payment_status=session.payment_status,
        pran=session.pran,
        resume_token=session.resume_token,
        data=session.data,
        created_at=session.created_at,
    )


@router.post("/resume", response_model=SessionStatusResponse)
def resume_session(
    payload: SessionResumeRequest,
    db: Session = Depends(get_db),
):
    """Resume an existing session using a resume token."""
    session = db.query(UserSession).filter(UserSession.resume_token == payload.resume_token).first()
    if not session:
        raise HTTPException(status_code=404, detail="Invalid resume token")

    return SessionStatusResponse(
        session_id=session.id,
        status=session.status,
        risk_level=session.risk_level,
        kyc_method=session.kyc_method,
        esign_complete=session.esign_complete,
        payment_status=session.payment_status,
        pran=session.pran,
        resume_token=session.resume_token,
        data=session.data,
        created_at=session.created_at,
    )


@router.post("/update", response_model=ProfileUpdateResponse)
def update_profile(
    payload: ProfileUpdateRequest,
    request: Request,
    session_id: str = Header(..., alias="session-id"),
    db: Session = Depends(get_db),
):
    """Update profile fields and re-evaluate risk."""
    session = db.query(UserSession).filter(UserSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Merge new fields into session data
    current_data = session.data or {}
    current_data.update(payload.fields)
    session.data = current_data

    # Re-evaluate risk with updated data
    risk_level, reasons = RiskEngine.evaluate(current_data, session.kyc_method, db_session=db)
    session.risk_level = risk_level
    session.risk_reasons = reasons

    # Update status progression
    if session.status == "started" and payload.fields.get("phase") == "profile":
        session.status = "profile_done"

    session.updated_at = datetime.utcnow()
    db.commit()

    # Audit
    AuditService.log(
        db, session_id, "PROFILE_UPDATE",
        payload=payload.fields,
        ip_address=request.client.host if request.client else None,
        metadata={"risk_level": risk_level, "reasons": reasons},
    )

    return ProfileUpdateResponse(
        success=True,
        risk_level=risk_level,
        reasons=reasons,
    )

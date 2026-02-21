"""
e-Sign Routes — Digital signature for NPS application.
Supports Aadhaar OTP e-Sign and DSC.
"""
from datetime import datetime

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.session import UserSession
from app.schemas.schemas import (
    ESignInitRequest, ESignInitResponse,
    ESignVerifyRequest, ESignVerifyResponse,
)
from app.services.esign_service import ESignService
from app.services.audit_service import AuditService

router = APIRouter(prefix="/api/esign", tags=["e-Sign"])


@router.post("/initiate", response_model=ESignInitResponse)
def initiate_esign(
    payload: ESignInitRequest,
    request: Request,
    session_id: str = Header(..., alias="session-id"),
    db: Session = Depends(get_db),
):
    """Initiate an e-Sign process (Aadhaar OTP or DSC)."""
    session = db.query(UserSession).filter(UserSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if payload.method not in ("aadhaar", "dsc"):
        raise HTTPException(status_code=400, detail="Invalid e-Sign method. Use 'aadhaar' or 'dsc'.")

    result = ESignService.initiate(session_id, payload.method)

    # Update session
    session.esign_method = payload.method
    db.commit()

    # Audit
    AuditService.log(
        db, session_id, "ESIGN_INITIATED",
        payload={"method": payload.method, "reference_id": result["reference_id"]},
        ip_address=request.client.host if request.client else None,
    )

    return ESignInitResponse(
        success=True,
        reference_id=result["reference_id"],
        method=payload.method,
        status=result["status"],
        message=result["message"],
    )


@router.post("/verify", response_model=ESignVerifyResponse)
def verify_esign(
    payload: ESignVerifyRequest,
    request: Request,
    session_id: str = Header(..., alias="session-id"),
    db: Session = Depends(get_db),
):
    """Verify an e-Sign with OTP or DSC token."""
    session = db.query(UserSession).filter(UserSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    result = ESignService.verify(
        reference_id=payload.reference_id,
        otp=payload.otp,
        dsc_token=payload.dsc_token,
    )

    if result.get("success"):
        session.esign_complete = True
        session.status = "esign_done"
        db.commit()

        # Audit
        AuditService.log(
            db, session_id, "ESIGN_COMPLETED",
            payload={"reference_id": payload.reference_id, "method": session.esign_method},
            ip_address=request.client.host if request.client else None,
            metadata={"signed_at": result.get("signed_at")},
        )

    return ESignVerifyResponse(
        success=result.get("success", False),
        status=result.get("status", "failed"),
        signed_at=datetime.fromisoformat(result["signed_at"]) if result.get("signed_at") else None,
        message=result.get("message", ""),
    )

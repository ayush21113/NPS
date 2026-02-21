"""
Payment Routes — Contribution payment processing.
Handles: UPI, UPI Lite, Net Banking, Debit/Credit Card.
"""
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.session import UserSession
from app.models.payment import PaymentRecord
from app.schemas.schemas import (
    PaymentInitRequest, PaymentInitResponse, PaymentStatusResponse,
    PRANGenerateResponse,
)
from app.services.pran_service import PRANService
from app.services.audit_service import AuditService
from app.utils.rate_limiter import rate_limit

router = APIRouter(prefix="/api/payment", tags=["Payment"])


@router.post("/initiate", response_model=PaymentInitResponse)
def initiate_payment(
    payload: PaymentInitRequest,
    request: Request,
    session_id: str = Header(..., alias="session-id"),
    db: Session = Depends(get_db),
    _throttle: bool = Depends(rate_limit(requests=5, window=60)),
):
    """Initiate a contribution payment."""
    session = db.query(UserSession).filter(UserSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Create payment record
    payment = PaymentRecord(
        session_id=session_id,
        method=payload.method,
        amount=payload.amount,
        upi_vpa=payload.upi_vpa or "nps@rbi.org.in",
        status="initiated",
        gateway_ref=f"GW-{uuid.uuid4().hex[:10].upper()}",
    )
    db.add(payment)
    db.flush()  # Get the ID

    # Update session
    session.payment_method = payload.method
    session.payment_status = "processing"
    session.contribution_amount = payload.amount
    db.commit()

    # Audit
    AuditService.log(
        db, session_id, "PAYMENT_INITIATED",
        payload={"method": payload.method, "amount": payload.amount},
        ip_address=request.client.host if request.client else None,
    )

    # Build response based on method
    response = PaymentInitResponse(
        success=True,
        payment_id=payment.id,
        status="initiated",
    )

    if payload.method == "upi":
        # Generate UPI deep link / QR data
        response.upi_qr_data = f"upi://pay?pa=nps@rbi.org.in&pn=NPS&am={payload.amount}&cu=INR&tn=NPS-Contribution"
        response.upi_collect_ref = payment.gateway_ref
        response.message = "UPI payment initiated. Scan QR or approve collect request."
    elif payload.method == "upi-lite":
        response.message = "UPI Lite payment processed instantly (no PIN required for ₹<1000)."
    elif payload.method == "netbanking":
        response.gateway_url = f"https://gateway.example.com/nps/pay/{payment.gateway_ref}"
        response.message = "Redirecting to bank's net banking page..."
    elif payload.method == "card":
        response.gateway_url = f"https://gateway.example.com/nps/card/{payment.gateway_ref}"
        response.message = "Redirecting to secure card payment page..."

    return response


@router.post("/confirm/{payment_id}", response_model=PaymentStatusResponse)
def confirm_payment(
    payment_id: int,
    request: Request,
    session_id: str = Header(..., alias="session-id"),
    db: Session = Depends(get_db),
):
    """Confirm a payment (simulates gateway callback)."""
    payment = db.query(PaymentRecord).filter(
        PaymentRecord.id == payment_id,
        PaymentRecord.session_id == session_id,
    ).first()

    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")

    # Mark as successful
    payment.status = "success"
    payment.completed_at = datetime.utcnow()

    # Update session
    session = db.query(UserSession).filter(UserSession.id == session_id).first()
    if session:
        session.payment_status = "completed"
        session.status = "payment_done"

    db.commit()

    # Audit
    AuditService.log(
        db, session_id, "PAYMENT_COMPLETED",
        payload={"payment_id": payment_id, "amount": payment.amount, "method": payment.method},
        ip_address=request.client.host if request.client else None,
    )

    return PaymentStatusResponse(
        payment_id=payment.id,
        status=payment.status,
        amount=payment.amount,
        method=payment.method,
        completed_at=payment.completed_at,
    )


@router.post("/generate-pran", response_model=PRANGenerateResponse)
def generate_pran(
    request: Request,
    session_id: str = Header(..., alias="session-id"),
    db: Session = Depends(get_db),
):
    """Generate PRAN after successful payment and e-Sign."""
    session = db.query(UserSession).filter(UserSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Generate PRAN
    pran = PRANService.generate(session_id)
    now = datetime.utcnow()

    # Update session
    session.pran = pran
    session.status = "completed"
    session.completed_at = now
    db.commit()

    # Audit
    AuditService.log(
        db, session_id, "PRAN_ISSUED",
        payload={"pran": pran},
        ip_address=request.client.host if request.client else None,
        metadata={"pran": pran, "completed_at": now.isoformat()},
    )

    return PRANGenerateResponse(pran=pran, timestamp=now)

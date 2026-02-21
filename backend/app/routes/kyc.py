"""
KYC Routes — Identity verification endpoints.
Handles: CKYC lookup, Smart Scan (OCR), DigiLocker, Aadhaar eKYC.
"""
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Header, UploadFile, File, HTTPException, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.config import get_settings
from app.models.session import UserSession
from app.models.kyc import KYCRecord
from app.schemas.schemas import CKYCLookupResponse, DigiLockerResponse, OCRScanResponse, ConsentArchiveRequest
from app.services.compliance_service import ComplianceService
from app.services.ocr_service import OCRService
from app.services.risk_engine import RiskEngine
from app.services.audit_service import AuditService
from app.utils.hashing import generate_hash
from app.utils.validators import validate_pan
from app.utils.rate_limiter import rate_limit

settings = get_settings()
router = APIRouter(prefix="/api/kyc", tags=["KYC"])


@router.post("/consent/archive")
def archive_consent(
    payload: ConsentArchiveRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Archives a user consent artifact for regulatory compliance.
    """
    request_info = {
        "ip": request.client.host if request.client else "0.0.0.0",
        "user_agent": request.headers.get("user-agent", "Unknown")
    }
    
    artifact = ComplianceService.archive_consent(
        db=db,
        session_id=payload.session_id,
        consent_type=payload.consent_type,
        consent_text=payload.consent_text,
        request_info=request_info,
        metadata=payload.additional_data
    )
    
    return {"success": True, "artifact_id": artifact.id, "hash": artifact.artifact_hash}


@router.get("/ckyc/{pan}", response_model=CKYCLookupResponse)
def ckyc_lookup(
    pan: str,
    request: Request,
    session_id: str = Header(None, alias="session-id"),
    db: Session = Depends(get_db),
):
    """Look up CKYC record by PAN number (simulated CKYCR registry)."""
    if not validate_pan(pan):
        raise HTTPException(status_code=400, detail="Invalid PAN format")

    # Simulated CKYC Registry response
    ckyc_data = {
        "ckyc_id": f"CKYC{abs(hash(pan)) % 10**14:014d}",
        "name": "Verified NPS Subscriber",
        "pan": pan.upper(),
        "dob": "15/06/1990",
        "gender": "Male",
        "address": "Verified Address via CKYCR",
        "verification_status": "verified",
    }

    # Audit if session provided
    if session_id:
        AuditService.log(
            db, session_id, "CKYC_LOOKUP",
            payload={"pan": pan.upper()},
            ip_address=request.client.host if request.client else None,
        )

    return CKYCLookupResponse(
        success=True,
        ckyc_id=ckyc_data["ckyc_id"],
        data=ckyc_data,
        message=f"CKYC record found for PAN: {pan.upper()}",
    )


@router.post("/scan", response_model=OCRScanResponse)
async def scan_document(
    request: Request,
    session_id: str = Header(..., alias="session-id"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _throttle: bool = Depends(rate_limit(requests=5, window=60)),
):
    """AI-powered document scan using Gemini 1.5 Flash.
    Accepts PAN, Aadhaar, DL, or Passport images.
    """
    # Validate session
    session = db.query(UserSession).filter(UserSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Read file
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Empty file uploaded")

    # OCR extraction
    try:
        extracted = await OCRService.scan_document(contents, file.content_type)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI Scan Failed: {str(e)}")

    # Save KYC record
    kyc_record = KYCRecord(
        session_id=session_id,
        method="smartscan",
        full_name=extracted.get("full_name"),
        father_name=extracted.get("father_name"),
        dob=extracted.get("dob"),
        gender=extracted.get("gender"),
        pan_number=extracted.get("pan") or extracted.get("id_number"),
        address=extracted.get("address"),
        ai_confidence=extracted.get("ai_confidence", 100),
        pan_valid=extracted.get("pan_valid", False),
        risk_level=extracted.get("risk_level", "Standard"),
        risk_reasons=extracted.get("reasons", []),
        source_label=extracted.get("source", "AI OCR"),
        raw_data_hash=generate_hash(extracted),
        ckyc_upload_deadline=datetime.utcnow() + timedelta(days=settings.CKYC_UPLOAD_DEADLINE_DAYS),
        verified_at=datetime.utcnow(),
    )
    db.add(kyc_record)

    # Update session
    session.kyc_method = "smartscan"
    session.status = "kyc_done"
    session.risk_level = extracted.get("risk_level", "Standard")
    session.risk_reasons = extracted.get("reasons", [])
    db.commit()

    # Audit
    AuditService.log(
        db, session_id, "KYC_SCAN",
        payload=extracted,
        ip_address=request.client.host if request.client else None,
        metadata={"source": extracted.get("source"), "confidence": extracted.get("ai_confidence")},
    )

    return OCRScanResponse(
        success=True,
        source=extracted.get("source", "AI OCR"),
        data=extracted,
    )


@router.post("/digilocker", response_model=DigiLockerResponse)
def fetch_digilocker(
    request: Request,
    session_id: str = Header(..., alias="session-id"),
    db: Session = Depends(get_db),
):
    """Fetch verified documents from DigiLocker (Government of India).
    In production, this integrates with DigiLocker API.
    """
    session = db.query(UserSession).filter(UserSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Simulated DigiLocker response
    digilocker_ref = f"DL-{uuid.uuid4().hex[:8].upper()}"
    dl_data = {
        "full_name": "Rajesh Kumar",
        "father_name": "Suresh Kumar",
        "dob": "15/06/1990",
        "gender": "Male",
        "pan": "ABCPK1234F",
        "aadhaar_last4": "5678",
        "address": "D-14, Sector 62, Noida, Uttar Pradesh 201301",
        "documents_fetched": ["Aadhaar", "PAN", "Driving License"],
    }

    # Save KYC record
    kyc_record = KYCRecord(
        session_id=session_id,
        method="digilocker",
        full_name=dl_data["full_name"],
        father_name=dl_data["father_name"],
        dob=dl_data["dob"],
        gender=dl_data["gender"],
        pan_number=dl_data["pan"],
        aadhaar_last4=dl_data["aadhaar_last4"],
        address=dl_data["address"],
        ai_confidence=100.0,
        pan_valid=True,
        digilocker_ref=digilocker_ref,
        risk_level="Standard",
        source_label="DigiLocker (Government Verified)",
        raw_data_hash=generate_hash(dl_data),
        ckyc_upload_deadline=datetime.utcnow() + timedelta(days=settings.CKYC_UPLOAD_DEADLINE_DAYS),
        verified_at=datetime.utcnow(),
    )
    db.add(kyc_record)

    # Update session
    session.kyc_method = "digilocker"
    session.status = "kyc_done"
    session.risk_level = "Standard"
    db.commit()

    # Audit
    AuditService.log(
        db, session_id, "DIGILOCKER_FETCH",
        payload=dl_data,
        ip_address=request.client.host if request.client else None,
        metadata={"digilocker_ref": digilocker_ref},
    )

    return DigiLockerResponse(
        success=True,
        documents=dl_data["documents_fetched"],
        data=dl_data,
    )

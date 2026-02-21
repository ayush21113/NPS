"""
Pydantic Schemas — Request & Response models for API validation.
"""
from datetime import datetime
from typing import Optional, Dict, List
from pydantic import BaseModel, Field


# ──────────────── Session ────────────────

class SessionStartRequest(BaseModel):
    lang: str = Field("en", description="Language code (en, hi, gu, ta, te, kn, or)")
    account_type: str = Field(..., description="Account type: citizen or corporate")


class SessionStartResponse(BaseModel):
    session_id: str
    resume_token: str
    status: str = "started"
    message: str = "Session created successfully"


class SessionStatusResponse(BaseModel):
    session_id: str
    status: str
    risk_level: str
    kyc_method: Optional[str] = None
    esign_complete: bool = False
    payment_status: str = "pending"
    pran: Optional[str] = None
    resume_token: Optional[str] = None
    data: Optional[Dict] = None
    created_at: datetime


# ──────────────── Session Recovery ────────────────

class SessionResumeRequest(BaseModel):
    resume_token: str


# ──────────────── Profile ────────────────

class ProfileUpdateRequest(BaseModel):
    fields: Dict = Field(..., description="Key-value pairs of profile fields to update")


class ProfileUpdateResponse(BaseModel):
    success: bool
    risk_level: str
    reasons: List[str] = []


# ──────────────── KYC ────────────────

class CKYCLookupResponse(BaseModel):
    success: bool
    ckyc_id: Optional[str] = None
    data: Optional[Dict] = None
    message: str = ""


class DigiLockerResponse(BaseModel):
    success: bool
    documents: List[str] = []
    data: Optional[Dict] = None
    source: str = "DigiLocker (Government of India)"


class OCRScanResponse(BaseModel):
    success: bool
    source: str
    data: Dict


# ──────────────── e-Sign ────────────────

class ESignInitRequest(BaseModel):
    method: str = Field(..., description="e-Sign method: aadhaar or dsc")


class ESignInitResponse(BaseModel):
    success: bool
    reference_id: str
    method: str
    status: str = "initiated"
    message: str = ""


class ESignVerifyRequest(BaseModel):
    reference_id: str
    otp: Optional[str] = None     # For Aadhaar OTP
    dsc_token: Optional[str] = None  # For DSC


class ESignVerifyResponse(BaseModel):
    success: bool
    status: str  # completed | failed
    signed_at: Optional[datetime] = None
    message: str = ""


# ──────────────── Payment ────────────────

class PaymentInitRequest(BaseModel):
    method: str = Field(..., description="Payment method: upi | upi-lite | netbanking | card")
    amount: int = Field(..., ge=500, description="Amount in INR (min ₹500 for Tier I)")
    upi_vpa: Optional[str] = None   # For UPI


class PaymentInitResponse(BaseModel):
    success: bool
    payment_id: int
    status: str = "initiated"
    upi_qr_data: Optional[str] = None      # QR payload for UPI
    upi_collect_ref: Optional[str] = None   # UPI collect reference
    gateway_url: Optional[str] = None       # For netbanking redirect
    message: str = ""


class PaymentStatusResponse(BaseModel):
    payment_id: int
    status: str
    amount: int
    method: str
    completed_at: Optional[datetime] = None


# ──────────────── PRAN ────────────────

class PRANGenerateResponse(BaseModel):
    pran: str
    timestamp: datetime
    message: str = "PRAN generated successfully"


# ──────────────── Admin / Audit ────────────────

class AuditLogEntry(BaseModel):
    id: int
    session_id: str
    action: str
    payload_hash: Optional[str] = None
    timestamp: datetime
    log_metadata: Optional[Dict] = None

    class Config:
        from_attributes = True


class AdminDashboardResponse(BaseModel):
    total_onboardings: int
    completion_rate: float
    pending_verification: int
    avg_completion_seconds: float
    kyc_distribution: Dict[str, int]
    risk_distribution: Dict[str, int]


class ConsentArchiveRequest(BaseModel):
    session_id: str
    consent_type: str
    consent_text: str
    additional_data: Optional[Dict] = None


# ──────────────── Generic ────────────────

class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    docs: str
    uptime_seconds: float


class ErrorResponse(BaseModel):
    detail: str
    error_code: Optional[str] = None

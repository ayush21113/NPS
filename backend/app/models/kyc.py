"""
KYC Record Model — Stores verified identity data and compliance metadata.
"""
from datetime import datetime
from sqlalchemy import Column, String, Integer, DateTime, JSON, ForeignKey, Boolean, Float

from app.database import Base


class KYCRecord(Base):
    __tablename__ = "kyc_records"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    session_id = Column(String(36), ForeignKey("sessions.id"), nullable=False, index=True)

    method = Column(String(24), nullable=False)  # ckyc | aadhaar | bank | manual | smartscan | digilocker

    # Identity Fields (Extracted)
    full_name = Column(String(128))
    father_name = Column(String(128))
    dob = Column(String(16))
    gender = Column(String(10))
    pan_number = Column(String(10))
    aadhaar_last4 = Column(String(4))       # Only last 4 digits stored (privacy)
    address = Column(String(512))

    # Verification Metadata
    ai_confidence = Column(Float, default=100.0)
    pan_valid = Column(Boolean, default=False)
    ckyc_id = Column(String(20))
    digilocker_ref = Column(String(64))

    # CKYC Compliance
    ckyc_upload_status = Column(String(16), default="pending")   # pending | uploaded | overdue
    ckyc_upload_deadline = Column(DateTime)

    # Risk Classification
    risk_level = Column(String(16), default="Standard")
    risk_reasons = Column(JSON, default=list)

    source_label = Column(String(64))    # e.g. "Gemini 1.5 Flash", "CKYC Registry", "DigiLocker"
    raw_data_hash = Column(String(64))   # SHA-256 of extracted data

    created_at = Column(DateTime, default=datetime.utcnow)
    verified_at = Column(DateTime, nullable=True)


class ConsentArtifact(Base):
    """
    Stores timestamped artifacts of user consent (voice/SMS/email/Aadhaar).
    Required for regulatory compliance audits.
    """
    __tablename__ = "consent_artifacts"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    session_id = Column(String(36), ForeignKey("sessions.id"), nullable=False, index=True)
    
    consent_type = Column(String(32), nullable=False)  # SMS | Email | Aadhaar | Voice | VCIP
    consent_text = Column(String(1024))
    timestamp = Column(DateTime, default=datetime.utcnow)
    ip_address = Column(String(45))
    user_agent = Column(String(256))
    
    artifact_hash = Column(String(64))  # Integrity verification
    metadata = Column(JSON, default=dict) # e.g., mobile number, email used

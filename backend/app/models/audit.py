"""
Audit Log Model — Immutable, tamper-evident audit trail.
Every action is SHA-256 hashed and timestamped.
"""
from datetime import datetime
from sqlalchemy import Column, String, Integer, DateTime, JSON, ForeignKey

from app.database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    session_id = Column(String(36), ForeignKey("sessions.id"), nullable=False, index=True)

    action = Column(String(50), nullable=False)
    # Actions: SESSION_START, KYC_INITIATED, KYC_SCAN, KYC_VERIFIED,
    #          PROFILE_UPDATE, RISK_EVALUATED, ESIGN_INITIATED, ESIGN_COMPLETED,
    #          PAYMENT_INITIATED, PAYMENT_COMPLETED, PRAN_ISSUED,
    #          DIGILOCKER_FETCH, CKYC_LOOKUP, CONSENT_CAPTURED

    payload_hash = Column(String(64))       # SHA-256 hash of the action payload
    previous_hash = Column(String(64))      # Hash chain for tamper detection

    ip_address = Column(String(45))
    user_agent = Column(String(256))

    log_metadata = Column(JSON, default=dict)
    timestamp = Column(DateTime, default=datetime.utcnow)

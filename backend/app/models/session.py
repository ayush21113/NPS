"""
Session Model — Tracks onboarding session lifecycle.
Maps to the 'sessions' table.
"""
from datetime import datetime
from sqlalchemy import Column, String, DateTime, JSON, Integer, Boolean

from app.database import Base


class UserSession(Base):
    __tablename__ = "sessions"

    id = Column(String(36), primary_key=True, index=True)
    resume_token = Column(String(64), unique=True, index=True)
    status = Column(String(24), default="started")
    # Statuses: started → kyc_pending → kyc_done → profile_done → esign_done → payment_pending → completed

    account_type = Column(String(16))   # citizen | corporate
    language = Column(String(4), default="en")

    kyc_method = Column(String(24))     # ckyc | aadhaar | bank | manual | smartscan | digilocker
    risk_level = Column(String(16), default="Standard")  # Standard | Medium | High
    risk_reasons = Column(JSON, default=list)

    esign_method = Column(String(16))   # aadhaar | dsc
    esign_complete = Column(Boolean, default=False)

    payment_method = Column(String(16)) # upi | upi-lite | netbanking | card
    payment_status = Column(String(16), default="pending")  # pending | processing | completed | failed
    contribution_amount = Column(Integer, default=0)

    pran = Column(String(20))

    data = Column(JSON, default=dict)   # Stores all captured profile data

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    ip_address = Column(String(45))
    user_agent = Column(String(256))

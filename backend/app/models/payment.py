"""
Payment Record Model — Tracks NPS contribution payments.
"""
from datetime import datetime
from sqlalchemy import Column, String, Integer, DateTime, JSON, ForeignKey

from app.database import Base


class PaymentRecord(Base):
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    session_id = Column(String(36), ForeignKey("sessions.id"), nullable=False, index=True)

    method = Column(String(16), nullable=False)  # upi | upi-lite | netbanking | card
    amount = Column(Integer, nullable=False)      # Amount in paisa (multiply by 100)

    # UPI-specific
    upi_txn_id = Column(String(64))
    upi_vpa = Column(String(64))                  # e.g. nps@rbi.org.in

    # Status tracking
    status = Column(String(16), default="initiated")  # initiated | processing | success | failed | refunded
    gateway_ref = Column(String(64))
    gateway_response = Column(JSON, default=dict)

    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

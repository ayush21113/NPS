"""
Audit Service — Manages the immutable, hash-chained audit trail.
"""
from datetime import datetime
from typing import Optional, Dict

from sqlalchemy.orm import Session

from app.models.audit import AuditLog
from app.utils.hashing import generate_hash, generate_chain_hash


class AuditService:
    """Creates tamper-evident audit log entries with hash chaining."""

    @staticmethod
    def log(
        db: Session,
        session_id: str,
        action: str,
        payload: Optional[Dict] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        metadata: Optional[Dict] = None,
    ) -> AuditLog:
        """Create an audit log entry with hash chaining.

        Args:
            db: Database session.
            session_id: Session this action belongs to.
            action: Action identifier (e.g. SESSION_START, KYC_SCAN).
            payload: Data payload to hash.
            ip_address: Client IP.
            user_agent: Client user agent.
            metadata: Additional metadata to store.

        Returns:
            The created AuditLog entry.
        """
        # Get the hash of the last entry for this session (chain linking)
        last_entry = (
            db.query(AuditLog)
            .filter(AuditLog.session_id == session_id)
            .order_by(AuditLog.id.desc())
            .first()
        )
        previous_hash = last_entry.payload_hash if last_entry else ""

        # Generate hashes
        payload_data = payload or {}
        payload_hash = generate_hash(payload_data)
        chain_hash = generate_chain_hash(payload_data, previous_hash)

        entry = AuditLog(
            session_id=session_id,
            action=action,
            payload_hash=chain_hash,
            previous_hash=previous_hash,
            ip_address=ip_address,
            user_agent=user_agent,
            log_metadata=metadata or {},
            timestamp=datetime.utcnow(),
        )

        db.add(entry)
        db.commit()
        db.refresh(entry)

        return entry

    @staticmethod
    def get_trail(db: Session, session_id: str) -> list[AuditLog]:
        """Get the full audit trail for a session, ordered chronologically."""
        return (
            db.query(AuditLog)
            .filter(AuditLog.session_id == session_id)
            .order_by(AuditLog.timestamp.asc())
            .all()
        )

    @staticmethod
    def verify_chain(db: Session, session_id: str) -> dict:
        """Verify the integrity of the audit chain for a session.

        Returns:
            dict with 'valid' (bool), 'total_entries', and 'broken_at' (if invalid).
        """
        entries = (
            db.query(AuditLog)
            .filter(AuditLog.session_id == session_id)
            .order_by(AuditLog.id.asc())
            .all()
        )

        if not entries:
            return {"valid": True, "total_entries": 0, "broken_at": None}

        for i, entry in enumerate(entries):
            expected_prev = entries[i - 1].payload_hash if i > 0 else ""
            if entry.previous_hash != expected_prev:
                return {
                    "valid": False,
                    "total_entries": len(entries),
                    "broken_at": entry.id,
                    "message": f"Chain broken at entry {entry.id} ({entry.action})",
                }

        return {"valid": True, "total_entries": len(entries), "broken_at": None}

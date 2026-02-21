"""
Compliance Service — Handles regulatory artifacts and consent archiving.
"""
from datetime import datetime
from typing import Optional, Dict
from sqlalchemy.orm import Session

from app.models.kyc import ConsentArtifact
from app.utils.hashing import generate_hash

class ComplianceService:
    @staticmethod
    def archive_consent(
        db: Session,
        session_id: str,
        consent_type: str,
        consent_text: str,
        request_info: Optional[Dict] = None,
        metadata: Optional[Dict] = None
    ) -> ConsentArtifact:
        """
        Archive a user consent artifact for regulatory auditing.
        """
        artifact_data = {
            "session_id": session_id,
            "type": consent_type,
            "text": consent_text,
            "ts": datetime.utcnow().isoformat()
        }
        artifact_hash = generate_hash(artifact_data)
        
        req = request_info or {}
        
        artifact = ConsentArtifact(
            session_id=session_id,
            consent_type=consent_type,
            consent_text=consent_text,
            ip_address=req.get("ip"),
            user_agent=req.get("user_agent"),
            artifact_hash=artifact_hash,
            additional_data=metadata or {}
        )
        
        db.add(artifact)
        db.commit()
        db.refresh(artifact)
        return artifact

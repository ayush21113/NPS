"""
e-Sign Service — Aadhaar OTP and DSC digital signature simulation.
In production, this would integrate with NSDL/CDSL e-Sign gateway.
"""
import uuid
from datetime import datetime
from typing import Optional


class ESignService:
    """Handles digital signature initiation and verification."""

    # In-memory store for e-Sign references (production: use Redis/DB)
    _pending: dict = {}

    @classmethod
    def initiate(cls, session_id: str, method: str) -> dict:
        """Initiate an e-Sign request.

        Args:
            session_id: Current onboarding session ID.
            method: "aadhaar" or "dsc".

        Returns:
            dict with reference_id, status, otp_sent (for aadhaar).
        """
        ref_id = f"ESIGN-{uuid.uuid4().hex[:8].upper()}"

        cls._pending[ref_id] = {
            "session_id": session_id,
            "method": method,
            "status": "initiated",
            "created_at": datetime.utcnow().isoformat(),
            "otp": "123456" if method == "aadhaar" else None,  # Simulated OTP
        }

        result = {
            "reference_id": ref_id,
            "method": method,
            "status": "initiated",
        }

        if method == "aadhaar":
            result["message"] = "OTP sent to registered Aadhaar mobile number"
            result["otp_sent"] = True
        else:
            result["message"] = "Please insert your DSC USB token and authorize"
            result["otp_sent"] = False

        return result

    @classmethod
    def verify(cls, reference_id: str, otp: Optional[str] = None, dsc_token: Optional[str] = None) -> dict:
        """Verify an e-Sign request.

        Args:
            reference_id: The e-Sign reference from initiate().
            otp: OTP for Aadhaar e-Sign.
            dsc_token: Token for DSC.

        Returns:
            dict with status, signed_at.
        """
        pending = cls._pending.get(reference_id)
        if not pending:
            return {"success": False, "status": "failed", "message": "Invalid reference ID"}

        method = pending["method"]

        if method == "aadhaar":
            # Verify OTP (simulated)
            if otp == pending.get("otp", "123456"):
                pending["status"] = "completed"
                signed_at = datetime.utcnow()
                return {
                    "success": True,
                    "status": "completed",
                    "signed_at": signed_at.isoformat(),
                    "message": "e-Sign completed via Aadhaar OTP — Document signed",
                }
            else:
                return {
                    "success": False,
                    "status": "failed",
                    "message": "Invalid OTP. Please try again.",
                }
        elif method == "dsc":
            # DSC always succeeds in simulation
            pending["status"] = "completed"
            signed_at = datetime.utcnow()
            return {
                "success": True,
                "status": "completed",
                "signed_at": signed_at.isoformat(),
                "message": "e-Sign completed via Digital Signature Certificate",
            }

        return {"success": False, "status": "failed", "message": "Unknown method"}

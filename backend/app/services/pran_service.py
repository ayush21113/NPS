"""
PRAN Service — Permanent Retirement Account Number generation.
"""
import hashlib
import random

from app.config import get_settings

settings = get_settings()


class PRANService:
    """Generates unique PRAN numbers for NPS accounts."""

    @staticmethod
    def generate(session_id: str) -> str:
        """Generate a deterministic PRAN from session ID.

        Format: PPPP XXXX YYYY where:
        - PPPP = PRAN prefix (e.g. 1100)
        - XXXX = first 4 hex chars of MD5(session_id) converted to digits
        - YYYY = next 4 hex chars converted to digits

        Args:
            session_id: Unique session identifier.

        Returns:
            Formatted PRAN string like "1100 2345 6789"
        """
        digest = hashlib.md5(session_id.encode()).hexdigest()

        # Convert hex to numeric segments
        seg1 = settings.PRAN_PREFIX
        seg2 = str(int(digest[:4], 16) % 9000 + 1000)
        seg3 = str(int(digest[4:8], 16) % 9000 + 1000)

        return f"{seg1} {seg2} {seg3}"

    @staticmethod
    def validate(pran: str) -> bool:
        """Validate PRAN format: 4 digits - 4 digits - 4 digits."""
        parts = pran.strip().split()
        if len(parts) != 3:
            return False
        return all(p.isdigit() and len(p) == 4 for p in parts)

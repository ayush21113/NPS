"""
Risk Engine — Server-side AML/CFT risk classification.
Evaluates PEP status, tax residency, KYC method, and AI confidence.
"""
from typing import Dict, List, Tuple


class RiskEngine:
    """Regulatory risk scoring engine for NPS onboarding."""

    @staticmethod
    def evaluate(session_data: Dict, kyc_method: str | None = None, db_session = None) -> Tuple[str, List[str]]:
        """Evaluate risk level based on session data.

        Args:
            session_data: Dictionary of all profile/KYC data.
            kyc_method: KYC verification method used.
            db_session: Optional DB session for cross-session anomaly detection.

        Returns:
            Tuple of (risk_level, [reasons]).
        """
        risk_level = "Standard"
        reasons: List[str] = []

        # Rule 1: PEP (Politically Exposed Person) → High Risk
        if session_data.get("pep") == "yes":
            risk_level = "High"
            reasons.append("PEP Detected")

        # Rule 2: Foreign Tax Residency → High Risk
        if session_data.get("tax_resident") == "yes":
            risk_level = "High"
            reasons.append("Foreign Tax Resident")

        # ... (rest of the existing rules)
        # Rule 3: Manual Document Upload
        if kyc_method == "manual":
            if risk_level == "Standard":
                risk_level = "Medium"
            reasons.append("Manual Document Upload")

        # Rule 4: High contribution
        contribution = session_data.get("contribution_amount", 0)
        if isinstance(contribution, (int, float)) and contribution > 1000000:
            if risk_level == "Standard":
                risk_level = "Medium"
            reasons.append("High-Value Transaction")

        # Rule 5: Age rules
        age = session_data.get("age")
        if age is not None:
            try:
                age_int = int(age)
                if age_int < 18:
                    risk_level = "High"
                    reasons.append("Minor — Guardian Required")
                elif age_int > 65:
                    if risk_level == "Standard":
                        risk_level = "Medium"
                    reasons.append("Senior Citizen — Special Review")
            except (ValueError, TypeError):
                pass

        # Rule 6: Low AI confidence
        ai_conf = session_data.get("ai_confidence")
        if ai_conf is not None:
            try:
                if float(ai_conf) < 85:
                    if risk_level == "Standard":
                        risk_level = "Medium"
                    reasons.append("Low AI Confidence Score")
            except (ValueError, TypeError):
                pass

        # Rule 7: Fraud Detection (Repeated ID use across sessions)
        if db_session and session_data.get("pan"):
            from app.models.kyc import KYCRecord
            pan = session_data.get("pan").upper()
            existing_count = db_session.query(KYCRecord).filter(KYCRecord.pan_number == pan).count()
            if existing_count > 1:
                risk_level = "High"
                reasons.append(f"Identity Anomaly: PAN linked to {existing_count} previous sessions")

        return risk_level, reasons

    @staticmethod
    def requires_vcip(risk_level: str) -> bool:
        """Check if VCIP (Video Customer Identification Process) is recommended."""
        return risk_level in ("High", "Medium")

    @staticmethod
    def requires_edd(risk_level: str) -> bool:
        """Check if EDD (Enhanced Due Diligence) is required."""
        return risk_level == "High"

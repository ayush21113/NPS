"""
Validators — Regex and rule-based validation for Indian KYC identifiers.
"""
import re


def validate_pan(pan: str | None) -> bool:
    """Validate Indian PAN format: 5 letters + 4 digits + 1 letter (e.g. ABCPK1234F)."""
    if not pan:
        return False
    return bool(re.match(r"^[A-Z]{5}[0-9]{4}[A-Z]$", pan.strip().upper()))


def validate_aadhaar(aadhaar: str | None) -> bool:
    """Validate Aadhaar number: exactly 12 digits, first digit non-zero."""
    if not aadhaar:
        return False
    cleaned = re.sub(r"\s", "", aadhaar)
    return bool(re.match(r"^[2-9]\d{11}$", cleaned))


def validate_contribution(amount: int, tier: str = "I") -> tuple[bool, str]:
    """Validate contribution amount against PFRDA minimums.
    Tier I: ₹500 minimum per contribution, ₹1000 minimum annual.
    Tier II: ₹250 minimum per contribution.
    """
    if tier == "I":
        if amount < 500:
            return False, "Minimum contribution for Tier I is ₹500"
        return True, "Valid"
    elif tier == "II":
        if amount < 250:
            return False, "Minimum contribution for Tier II is ₹250"
        return True, "Valid"
    return False, "Unknown tier"


def validate_upi_vpa(vpa: str | None) -> bool:
    """Validate UPI VPA format: user@provider."""
    if not vpa:
        return False
    return bool(re.match(r"^[\w.-]+@[\w]+$", vpa.strip()))


def sanitize_name(name: str | None) -> str:
    """Basic sanitization for names: strip, title case."""
    if not name:
        return ""
    return re.sub(r"[^a-zA-Z\s.-]", "", name.strip()).title()

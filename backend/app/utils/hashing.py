"""
Cryptographic Hashing Utilities — SHA-256 payload hashing for audit trails.
"""
import hashlib
import json


def generate_hash(data: dict) -> str:
    """Generate a SHA-256 hash of a dictionary (deterministic, sorted keys)."""
    canonical = json.dumps(data, sort_keys=True, default=str).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def generate_chain_hash(current_data: dict, previous_hash: str = "") -> str:
    """Generate a chain hash: SHA-256(previous_hash + current_payload).
    Creates a tamper-evident linked chain for the audit trail.
    """
    current_hash = generate_hash(current_data)
    chain_input = f"{previous_hash}{current_hash}".encode("utf-8")
    return hashlib.sha256(chain_input).hexdigest()

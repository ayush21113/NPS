"""
PoP (Point of Presence) Agent Routes — Assisted Onboarding Module.

Enables registered PoP agents (bank staff, CSC operators, financial advisors)
to log in and assist NPS subscribers with their onboarding.
Tracks agent performance, session attribution, and commission eligibility.
"""
import uuid
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.session import UserSession
from app.services.audit_service import AuditService

router = APIRouter(prefix="/api/pop", tags=["PoP Agent"])


# ─── Simulated PoP Agent Registry ─────────────────────────────────────
# In production, this comes from PFRDA's PoP registration database.
POP_AGENTS = {
    "SBI-2024-001": {
        "name": "Rajesh Kumar",
        "pin": "1234",
        "organization": "State Bank of India",
        "branch": "Connaught Place, New Delhi",
        "pop_id": "POP-SBI-00142",
        "registration_no": "PFRDA/POP/2024/SBI/001",
        "role": "Relationship Manager",
        "tier": "platinum",
        "photo_initials": "RK",
    },
    "HDFC-2024-005": {
        "name": "Priya Sharma",
        "pin": "5678",
        "organization": "HDFC Bank",
        "branch": "Bandra West, Mumbai",
        "pop_id": "POP-HDFC-00087",
        "registration_no": "PFRDA/POP/2024/HDFC/005",
        "role": "Branch Manager",
        "tier": "gold",
        "photo_initials": "PS",
    },
    "CSC-2024-012": {
        "name": "Amit Patel",
        "pin": "9012",
        "organization": "Common Service Centre",
        "branch": "Gram Panchayat, Varanasi",
        "pop_id": "POP-CSC-00321",
        "registration_no": "PFRDA/POP/2024/CSC/012",
        "role": "CSC Operator",
        "tier": "silver",
        "photo_initials": "AP",
    },
    "POST-2024-008": {
        "name": "Sunita Devi",
        "pin": "3456",
        "organization": "India Post",
        "branch": "Head Post Office, Jaipur",
        "pop_id": "POP-POST-00198",
        "registration_no": "PFRDA/POP/2024/POST/008",
        "role": "Postal Agent",
        "tier": "silver",
        "photo_initials": "SD",
    },
}


# ─── Schemas ──────────────────────────────────────────────────────────

class PopLoginRequest(BaseModel):
    agent_id: str = Field(..., description="PoP Agent ID (e.g., SBI-2024-001)")
    pin: str = Field(..., description="4-digit PIN")

class PopLoginResponse(BaseModel):
    success: bool
    token: str = ""
    agent: dict = {}
    message: str = ""

class PopDashboardResponse(BaseModel):
    agent: dict
    stats: dict
    recent_sessions: list
    commission: dict


# ─── Routes ───────────────────────────────────────────────────────────

@router.post("/login", response_model=PopLoginResponse)
def pop_login(payload: PopLoginRequest, request: Request, db: Session = Depends(get_db)):
    """
    Authenticate a PoP Agent.
    Returns agent profile + session token for assisted onboarding.
    """
    agent_data = POP_AGENTS.get(payload.agent_id.upper())

    if not agent_data:
        raise HTTPException(status_code=401, detail="Agent ID not found in PFRDA registry")

    if agent_data["pin"] != payload.pin:
        raise HTTPException(status_code=401, detail="Invalid PIN")

    # Generate session token
    token = f"POP-{uuid.uuid4().hex[:16].upper()}"

    # Audit
    AuditService.log(
        db, f"pop-{payload.agent_id}", "POP_AGENT_LOGIN",
        payload={"agent_id": payload.agent_id, "organization": agent_data["organization"]},
        ip_address=request.client.host if request.client else None,
    )

    return PopLoginResponse(
        success=True,
        token=token,
        agent={
            "agent_id": payload.agent_id.upper(),
            "name": agent_data["name"],
            "organization": agent_data["organization"],
            "branch": agent_data["branch"],
            "pop_id": agent_data["pop_id"],
            "registration_no": agent_data["registration_no"],
            "role": agent_data["role"],
            "tier": agent_data["tier"],
            "photo_initials": agent_data["photo_initials"],
        },
        message=f"Welcome, {agent_data['name']}. Assisted mode activated.",
    )


@router.get("/dashboard/{agent_id}", response_model=PopDashboardResponse)
def pop_dashboard(agent_id: str, db: Session = Depends(get_db)):
    """
    Get PoP Agent dashboard with performance metrics.
    Shows onboarding stats, recent sessions, and commission tracking.
    """
    agent_data = POP_AGENTS.get(agent_id.upper())
    if not agent_data:
        raise HTTPException(status_code=404, detail="Agent not found")

    # Query sessions attributed to this agent
    sessions = db.query(UserSession).filter(
        UserSession.pop_agent_id == agent_id.upper()
    ).order_by(UserSession.created_at.desc()).limit(20).all()

    total = len(sessions)
    completed = sum(1 for s in sessions if s.status == "completed")
    in_progress = sum(1 for s in sessions if s.status not in ("completed", "expired"))

    # Simulated commission (₹50 per completed onboarding as per PFRDA norms)
    commission_per_enrollment = 50.0
    total_commission = completed * commission_per_enrollment

    # Recent sessions for display
    recent = []
    for s in sessions[:10]:
        recent.append({
            "session_id": s.id[:8] + "...",
            "status": s.status,
            "account_type": s.account_type or "citizen",
            "kyc_method": s.kyc_method or "pending",
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "pran": s.pran,
        })

    return PopDashboardResponse(
        agent={
            "agent_id": agent_id.upper(),
            "name": agent_data["name"],
            "organization": agent_data["organization"],
            "branch": agent_data["branch"],
            "pop_id": agent_data["pop_id"],
            "registration_no": agent_data["registration_no"],
            "role": agent_data["role"],
            "tier": agent_data["tier"],
            "photo_initials": agent_data["photo_initials"],
        },
        stats={
            "total_sessions": total,
            "completed": completed,
            "in_progress": in_progress,
            "success_rate": round((completed / total * 100) if total > 0 else 0, 1),
            "avg_completion_minutes": 8.5,  # Simulated
            "today_count": sum(1 for s in sessions if s.created_at and s.created_at.date() == datetime.utcnow().date()),
        },
        recent_sessions=recent,
        commission={
            "rate_per_enrollment": commission_per_enrollment,
            "total_earned": total_commission,
            "pending_payout": total_commission * 0.3,  # 30% pending
            "last_payout_date": (datetime.utcnow() - timedelta(days=15)).strftime("%d %b %Y"),
        },
    )


@router.post("/tag-session")
def tag_session_to_agent(
    request: Request,
    session_id: str = "",
    agent_id: str = "",
    db: Session = Depends(get_db),
):
    """Tag an onboarding session to a PoP agent for attribution."""
    if not session_id or not agent_id:
        raise HTTPException(status_code=400, detail="session_id and agent_id required")

    session = db.query(UserSession).filter(UserSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    session.pop_agent_id = agent_id.upper()
    db.commit()

    AuditService.log(
        db, session_id, "POP_SESSION_TAGGED",
        payload={"agent_id": agent_id},
        ip_address=request.client.host if request.client else None,
    )

    return {"success": True, "message": f"Session tagged to PoP agent {agent_id}"}

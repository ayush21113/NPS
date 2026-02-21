from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from app.services.notification_service import NotificationService
from app.services.chat_service import ChatService

router = APIRouter(prefix="/api/notification", tags=["Notifications"])

class WhatsAppRequest(BaseModel):
    phone: str = Field(..., description="Phone number with country code")
    message: str

class SMSRequest(BaseModel):
    phone: str
    message: str

class ChatRequest(BaseModel):
    query: str

@router.post("/whatsapp")
def send_whatsapp_notification(payload: WhatsAppRequest):
    """
    Sends a WhatsApp notification to the user.
    """
    result = NotificationService.send_whatsapp(payload.phone, payload.message)
    if not result["success"]:
        raise HTTPException(status_code=500, detail="Failed to send WhatsApp message")
    return result

@router.post("/sms")
def send_sms_notification(payload: SMSRequest):
    """
    Sends an SMS notification to the user.
    """
    result = NotificationService.send_sms(payload.phone, payload.message)
    if not result["success"]:
        raise HTTPException(status_code=500, detail="Failed to send SMS message")
    return result

@router.post("/chat")
def nps_chat_assistant(payload: ChatRequest):
    """
    AI-powered NPS query assistant.
    """
    response = ChatService.get_response(payload.query)
    return {"response": response}

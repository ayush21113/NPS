"""
Notification Service — Handles WhatsApp, SMS, and Email simulations.
"""
import time
from typing import Dict, Any

class NotificationService:
    @staticmethod
    def send_whatsapp(phone: str, message: str) -> Dict[str, Any]:
        """
        Simulates sending a WhatsApp message via an API like Twilio or Meta Graph API.
        """
        print(f"[WHATSAPP] Sending to {phone}: {message}")
        time.sleep(1)  # Simulate network latency
        return {
            "success": True,
            "provider": "MockMetaAPI",
            "sid": f"WA{int(time.time())}X",
            "status": "delivered"
        }

    @staticmethod
    def send_sms(phone: str, message: str) -> Dict[str, Any]:
        """
        Simulates sending an SMS via a provider like MSG91 or Twilio.
        """
        print(f"[SMS] Sending to {phone}: {message}")
        time.sleep(0.5)
        return {
            "success": True,
            "provider": "MockSMSGateway",
            "sid": f"SM{int(time.time())}Y",
            "status": "sent"
        }

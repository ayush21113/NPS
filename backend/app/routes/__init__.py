from app.routes.session import router as session_router
from app.routes.kyc import router as kyc_router
from app.routes.payment import router as payment_router
from app.routes.esign import router as esign_router
from app.routes.admin import router as admin_router
from app.routes.notification import router as notification_router

__all__ = ["session_router", "kyc_router", "payment_router", "esign_router", "admin_router", "notification_router"]

# NPS Digital Onboarding — Full-Stack Application

A production-grade digital onboarding system for India's National Pension System (NPS). Built with a clean separation between frontend and backend, featuring AI-powered KYC, multi-path identity verification, UPI payment integration, and regulatory compliance tooling.

---

## 📁 Project Structure

```
nps/
├── frontend/                   # Static frontend (HTML/CSS/JS)
│   ├── index.html              # Main application UI
│   ├── style.css               # Design system & component styles
│   └── app.js                  # Application logic & API client
│
├── backend/                    # FastAPI Python backend
│   ├── app/
│   │   ├── main.py             # FastAPI entry point & middleware
│   │   ├── config.py           # Environment settings (pydantic-settings)
│   │   ├── database.py         # SQLAlchemy engine & session
│   │   ├── models/             # ORM models
│   │   │   ├── session.py      # Onboarding session lifecycle
│   │   │   ├── audit.py        # Tamper-evident audit trail
│   │   │   ├── kyc.py          # KYC verification records
│   │   │   └── payment.py      # Contribution payment records
│   │   ├── schemas/            # Pydantic request/response models
│   │   │   └── schemas.py      # All API schemas
│   │   ├── routes/             # API route handlers
│   │   │   ├── session.py      # Session lifecycle (create/status/update)
│   │   │   ├── kyc.py          # KYC: CKYC, OCR scan, DigiLocker
│   │   │   ├── payment.py      # UPI/Netbanking payments & PRAN
│   │   │   ├── esign.py        # Aadhaar OTP & DSC e-Sign
│   │   │   └── admin.py        # Regulator dashboard & audit
│   │   ├── services/           # Business logic layer
│   │   │   ├── ocr_service.py  # Gemini 1.5 Flash AI extraction
│   │   │   ├── risk_engine.py  # AML/CFT risk classification
│   │   │   ├── pran_service.py # PRAN number generation
│   │   │   ├── esign_service.py# Digital signature flow
│   │   │   └── audit_service.py# Hash-chained audit logging
│   │   └── utils/              # Helpers
│   │       ├── hashing.py      # SHA-256 & chain hashing
│   │       └── validators.py   # PAN, Aadhaar, UPI validation
│   ├── .env                    # Environment variables
│   ├── requirements.txt        # Python dependencies
│   └── run.py                  # Uvicorn launcher
│
├── methodology.md              # Architecture & design decisions
└── README.md                   # This file
```

---

## 🚀 Quick Start

### 1. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
venv\Scripts\activate       # Windows
# source venv/bin/activate  # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Start server
python run.py --reload
```

The API will be available at:
- **API**: http://localhost:8000
- **Swagger Docs**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
- **Frontend (served)**: http://localhost:8000/app

### 2. Frontend (Standalone)

Open `frontend/index.html` directly in a browser, or serve via the backend at `/app`.

---

## � Docker Deployment

The application is fully containerized. To run the entire stack (Backend + Frontend) using Docker:

### 1. Build and Run with Docker Compose
```bash
# From the root directory
docker-compose up --build
```
The app will be available at: `http://localhost:8080`

### 2. Manual Docker Build
```bash
docker build -t nps-onboarding .
docker run -p 8080:8080 --env-file backend/.env nps-onboarding
```

---

## 📱 Mobile App (PWA)
This application includes a `manifest.json` and a service-worker-ready structure.
1. Deploy the app to a HTTPS server (or use `localhost` for testing).
2. Open the URL on your mobile phone (Safari on iOS or Chrome on Android).
3. Select **"Add to Home Screen"**.
4. The app will now appear on your home screen with a native icon and standalone (fullscreen) interface.

---

## �📡 API Endpoints

### Session Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/session/start` | Create new onboarding session |
| `GET`  | `/api/session/status` | Get session status |
| `POST` | `/api/session/update` | Update profile & re-evaluate risk |

### KYC Verification
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/api/kyc/ckyc/{pan}` | CKYC Registry lookup by PAN |
| `POST` | `/api/kyc/scan` | AI document scan (Gemini OCR) |
| `POST` | `/api/kyc/digilocker` | Fetch docs from DigiLocker |

### e-Sign
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/esign/initiate` | Start Aadhaar OTP or DSC e-Sign |
| `POST` | `/api/esign/verify` | Verify OTP / DSC token |

### Payments
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/payment/initiate` | Start UPI/Netbanking payment |
| `POST` | `/api/payment/confirm/{id}` | Confirm payment (gateway callback) |
| `POST` | `/api/payment/generate-pran` | Generate PRAN after payment |

### Admin / Audit
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/api/admin/dashboard` | Aggregated metrics |
| `GET`  | `/api/admin/audit/{session_id}` | Full audit trail |
| `GET`  | `/api/admin/audit/{session_id}/verify` | Hash chain integrity check |
| `GET`  | `/api/admin/sessions` | List all sessions |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (Static)                    │
│    HTML / CSS / Vanilla JS — Served from /app           │
└─────────────────────┬───────────────────────────────────┘
                      │ REST API (JSON)
┌─────────────────────▼───────────────────────────────────┐
│                   FASTAPI BACKEND                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │ Session  │ │   KYC    │ │ Payment  │ │  e-Sign  │   │
│  │  Router  │ │  Router  │ │  Router  │ │  Router  │   │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘   │
│       │            │            │            │          │
│  ┌────▼────────────▼────────────▼────────────▼──────┐   │
│  │              SERVICE LAYER                       │   │
│  │  OCR Service │ Risk Engine │ PRAN │ e-Sign │ Aud │   │
│  └────────────────────┬─────────────────────────────┘   │
│                       │                                 │
│  ┌────────────────────▼─────────────────────────────┐   │
│  │         SQLAlchemy ORM → SQLite/PostgreSQL        │   │
│  │  Sessions │ KYC Records │ Payments │ Audit Logs  │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                      │
         ┌────────────┼──────────────┐
         │            │              │
    ┌────▼────┐ ┌─────▼─────┐ ┌─────▼─────┐
    │ Gemini  │ │ DigiLocker│ │ NPCI/UPI  │
    │ AI OCR  │ │ (Govt API)│ │ Gateway   │
    └─────────┘ └───────────┘ └───────────┘
```

---

## ⚙️ Configuration

All settings are in `backend/.env`:

```env
GEMINI_API_KEY=your_api_key_here
APP_NAME=NPS Digital Onboarding API
DEBUG=false
SECRET_KEY=change-in-production
SESSION_EXPIRY_MINUTES=30
```

---

## 📋 Key Features

| Feature | Status | Source |
|---------|--------|--------|
| Multi-path KYC (CKYC, Aadhaar, Bank, AI OCR, DigiLocker) | ✅ | NPS Onboarding Doc |
| AI Document Scanning (Gemini 1.5 Flash) | ✅ | NPS Onboarding Doc |
| Server-side AML/CFT Risk Engine | ✅ | PFRDA Compliance |
| Aadhaar OTP & DSC e-Sign | ✅ | NPS Onboarding Doc |
| UPI / UPI Lite / Netbanking / Card Payments | ✅ | UPI Innovations Doc |
| AI Voice Assistant & NPS Chatbot | ✅ | UPI Innovations Doc |
| DigiLocker Integration | ✅ | NPS Onboarding Doc |
| Trust Cues (RBI, PFRDA, NPCI badges) | ✅ | UPI Innovations Doc |
| Offline Mode Detection | ✅ | UPI Innovations Doc |
| Hash-chained Tamper-evident Audit Trail | ✅ | PFRDA Compliance |
| Regulator Dashboard & Analytics | ✅ | Architecture Spec |
| Multi-language Support (EN, HI, GU, TA, TE, KN, OR) | ✅ | Tier-2/3 Inclusion |
| **PoP Agent Portal (Login, Dashboard, Commission)** | ✅ | **NPS Architecture** |
| **Assisted Onboarding Mode (VCIP)** | ✅ | **PFRDA Compliance** |
| **Session Attribution & PoP Performance Metrics** | ✅ | **NPS Architecture** |

### PoP Agent API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/pop/login` | Authenticate PoP agent (Agent ID + PIN) |
| `GET`  | `/api/pop/dashboard/{agent_id}` | Agent stats, commission, recent sessions |
| `POST` | `/api/pop/tag-session` | Tag onboarding session to PoP agent |

**Demo PoP Agents:**
| Agent ID | PIN | Organization |
|----------|-----|-------------|
| `SBI-2024-001` | `1234` | State Bank of India |
| `HDFC-2024-005` | `5678` | HDFC Bank |
| `CSC-2024-012` | `9012` | Common Service Centre |
| `POST-2024-008` | `3456` | India Post |

"""
OCR Service — Google Gemini 1.5 Flash AI Document Extraction.
Handles document scanning, field extraction, and confidence scoring.
"""
import json
import os
from datetime import datetime
from typing import Optional

import google.generativeai as genai

from app.config import get_settings
from app.utils.validators import validate_pan

settings = get_settings()

# Configure Gemini at module level
_model = None


def get_ocr_model():
    """Lazily initialize the Gemini model."""
    global _model
    if _model is None and settings.GEMINI_API_KEY:
        genai.configure(api_key=settings.GEMINI_API_KEY)
        _model = genai.GenerativeModel(
            model_name=settings.GEMINI_MODEL,
            generation_config={
                "temperature": 0,
                "top_p": 1,
                "top_k": 32,
                "max_output_tokens": 1024,
            },
        )
    return _model


# Deterministic extraction prompt
OCR_PROMPT = """You are a deterministic OCR extractor for Indian KYC documents (PAN Card, Aadhaar Card, Driving License, Passport).

STRICT RULES:
1. Extract text EXACTLY as written on the document.
2. If a field is not clearly visible, return null for that field.
3. DO NOT guess, infer, or hallucinate any data.
4. Return ONLY raw JSON — no markdown, no explanation.

REQUIRED FIELDS:
- full_name (string): Full name as printed
- father_name (string): Father's/guardian's name
- dob (string): Date of birth in DD/MM/YYYY format
- gender (string): Male/Female/Other
- id_number (string): Document ID number (PAN, Aadhaar, etc.)
- address (string): Full address if visible
- document_type (string): PAN/Aadhaar/DL/Passport
- confidence (integer): Your confidence 0-100 that extraction is accurate

Return ONLY the JSON object."""


class OCRService:
    """AI-powered document scanning and extraction service."""

    @staticmethod
    async def scan_document(file_contents: bytes, content_type: str) -> dict:
        """Scan a document image and extract identity fields.

        Args:
            file_contents: Raw bytes of the uploaded document image.
            content_type: MIME type of the file.

        Returns:
            Dictionary with extracted fields, confidence, risk level.

        Raises:
            ValueError: If AI fails or returns invalid data.
        """
        model = get_ocr_model()
        if not model:
            raise ValueError(
                "AI OCR is not available — GEMINI_API_KEY is not configured. "
                "Please set GEMINI_API_KEY in backend/.env"
            )

        # Prepare multimodal input
        image_part = {"mime_type": content_type, "data": file_contents}

        # Query Gemini
        try:
            response = model.generate_content(contents=[OCR_PROMPT, image_part])
        except Exception as e:
            _log(f"Gemini API call failed: {e}")
            raise ValueError(f"AI processing failed: {str(e)}")

        # Extract text
        try:
            raw_text = response.text
        except Exception:
            _log(f"response.text failed. Candidates: {response.candidates}")
            raise ValueError(
                "AI failed to generate readable text. "
                "The image might be too blurry or contain blocked content."
            )

        if not raw_text or not raw_text.strip():
            raise ValueError("AI returned an empty response.")

        # Parse JSON from response
        cleaned = raw_text.strip()
        if "```json" in cleaned:
            cleaned = cleaned.split("```json")[1].split("```")[0].strip()
        elif "```" in cleaned:
            cleaned = cleaned.split("```")[1].split("```")[0].strip()

        try:
            extracted = json.loads(cleaned)
        except json.JSONDecodeError:
            _log(f"JSON parse failed: {cleaned}")
            raise ValueError("AI returned invalid format. Please try a clearer photo.")

        # Post-processing: normalize keys
        if "id_number" in extracted and "pan" not in extracted:
            extracted["pan"] = extracted["id_number"]

        # Confidence scoring
        confidence = extracted.get("confidence", 100)
        pan_valid = validate_pan(extracted.get("pan"))

        if not pan_valid and extracted.get("document_type", "").upper() == "PAN":
            confidence = min(confidence, 40)

        extracted["pan_valid"] = pan_valid
        extracted["ai_confidence"] = confidence

        # Risk evaluation based on OCR result
        risk_level = "Standard"
        reasons = []
        if confidence < settings.OCR_CONFIDENCE_THRESHOLD:
            risk_level = "Enhanced"
            reasons.append("Low Confidence AI Extraction")

        extracted["risk_level"] = risk_level
        extracted["reasons"] = reasons
        extracted["source"] = "Gemini 1.5 Flash (Production AI)"

        return extracted


def _log(message: str):
    """Internal logger — writes to console and log file."""
    ts = datetime.now().isoformat()
    line = f"{ts} - OCR_SERVICE: {message}"
    print(line)
    try:
        log_dir = settings.LOG_DIR
        os.makedirs(log_dir, exist_ok=True)
        with open(os.path.join(log_dir, "ocr.log"), "a") as f:
            f.write(line + "\n")
    except Exception:
        pass

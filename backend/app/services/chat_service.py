"""
Chat Service — AI-powered assistant for NPS queries using Gemini.
"""
import google.generativeai as genai
from app.config import get_settings

settings = get_settings()

class ChatService:
    @staticmethod
    def get_response(user_query: str) -> str:
        """
        Queries Gemini to answer NPS-related questions.
        """
        if not settings.GEMINI_API_KEY:
            return "I'm currently in offline mode. I can help with general NPS questions, but AI features are disabled."

        try:
            genai.configure(api_key=settings.GEMINI_API_KEY)
            model = genai.GenerativeModel('gemini-1.5-flash')
            
            prompt = f"""
            You are a helpful and expert AI assistant for the National Pension System (NPS) in India.
            Answer the user's query clearly and concisely. 
            Focus on NPS rules, tax benefits (Sec 80CCD), KYC methods, Tier I vs Tier II, and fund managers.
            If you don't know the answer, refer the user to the official NSDL or KFintech portals.
            
            User says: {user_query}
            """
            
            response = model.generate_content(prompt)
            return response.text.strip()
        except Exception as e:
            print(f"[CHAT ERROR] {e}")
            return "I encountered an error while thinking. Please try asking again in a moment."

"""
Simple Memory-based Rate Limiter for PoC.
In production, use Redis or a dedicated middleware like slowapi.
"""
import time
from fastapi import Request, HTTPException
from typing import Dict, Tuple

# In-memory storage: {ip: (timestamp, count)}
_rate_limit_store: Dict[str, Tuple[float, int]] = {}

def rate_limit(requests: int, window: int):
    """
    Decorator/Dependency for rate limiting.
    Example: Depends(rate_limit(requests=5, window=60))
    """
    def limiter(request: Request):
        ip = request.client.host if request.client else "unknown"
        now = time.time()
        
        if ip not in _rate_limit_store:
            _rate_limit_store[ip] = (now, 1)
            return True
            
        last_ts, count = _rate_limit_store[ip]
        
        # Reset window if expired
        if now - last_ts > window:
            _rate_limit_store[ip] = (now, 1)
            return True
            
        if count >= requests:
            raise HTTPException(
                status_code=429, 
                detail=f"Rate limit exceeded. Try again in {int(window - (now - last_ts))} seconds."
            )
            
        _rate_limit_store[ip] = (last_ts, count + 1)
        return True
        
    return limiter

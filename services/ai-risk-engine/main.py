from collections import defaultdict
from datetime import datetime, timedelta, timezone
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
from pydantic import BaseModel
import random

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class RiskRequest(BaseModel):
    userId: str


recent_attempts: dict[str, list[datetime]] = defaultdict(list)

DEMO_MODE = os.getenv("QUANTUMAUTH_DEMO_MODE", "true").strip().lower() not in {
    "0",
    "false",
    "no",
}
DEMO_ALLOW_BLOCKING = os.getenv(
    "QUANTUMAUTH_DEMO_ALLOW_BLOCKING", "false"
).strip().lower() in {"1", "true", "yes"}


def _prune_attempts(timestamps: list[datetime], now: datetime) -> list[datetime]:
    cutoff = now - timedelta(minutes=5)
    return [timestamp for timestamp in timestamps if timestamp >= cutoff]


def _demo_safe_score(attempt_count: int) -> float:
    # Deterministic and demo-friendly: never reaches challenge/deny thresholds.
    return min(0.12 + max(attempt_count - 1, 0) * 0.06, 0.42)


def _demo_blocking_score(attempt_count: int) -> float:
    # Deterministic stepped scoring when blocking is explicitly enabled.
    if attempt_count == 1:
        return 0.18
    if attempt_count == 2:
        return 0.58
    if attempt_count == 3:
        return 0.82
    return 0.94


@app.get("/")
def root():
    return {"message": "AI Risk Engine running"}


@app.post("/risk")
def risk(req: RiskRequest):
    now = datetime.now(timezone.utc)
    attempts = _prune_attempts(recent_attempts[req.userId], now)
    attempts.append(now)
    recent_attempts[req.userId] = attempts

    attempt_count = len(attempts)

    if DEMO_MODE and not DEMO_ALLOW_BLOCKING:
        risk_score = _demo_safe_score(attempt_count)
    elif DEMO_MODE and DEMO_ALLOW_BLOCKING:
        risk_score = _demo_blocking_score(attempt_count)
    else:
        # Non-demo mode keeps lightweight heuristic behavior.
        if attempt_count == 1:
            risk_score = random.uniform(0.08, 0.32)
        elif attempt_count <= 3:
            risk_score = random.uniform(0.25, 0.6)
        else:
            risk_score = random.uniform(0.65, 0.92)

    if risk_score < 0.75:
        action = "allow"
    elif risk_score < 0.9:
        action = "challenge"
    else:
        action = "deny"
    
    return {
        "riskScore": risk_score,
        "action": action
    }

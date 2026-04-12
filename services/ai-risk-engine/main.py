from collections import defaultdict
from datetime import datetime, timedelta, timezone
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
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


def _prune_attempts(timestamps: list[datetime], now: datetime) -> list[datetime]:
    cutoff = now - timedelta(minutes=5)
    return [timestamp for timestamp in timestamps if timestamp >= cutoff]


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

    # Demo-friendly scoring:
    # - first attempts should almost always work
    # - repeated attempts within 5 minutes increase risk
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

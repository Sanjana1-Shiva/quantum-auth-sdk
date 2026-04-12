from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime, timezone, timedelta
import os
import uuid
import secrets
import json
import urllib.request
import urllib.parse

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory stores
users: dict = {}        # users[userId] = { "userId", "publicKey", "createdAt" }
public_keys: dict = {}  # public_keys[publicKey] = userId  (for duplicate detection)
challenges: dict = {}   # challenges[userId] = { "challenge", "expiresAt", "used" }
sessions: dict = {}     # sessions[token] = { "userId", "expiresAt" }

AI_RISK_ENGINE_URL = os.getenv("AI_RISK_ENGINE_URL", "http://127.0.0.1:8001").rstrip("/")


class RegisterRequest(BaseModel):
    publicKey: str


class ChallengeRequest(BaseModel):
    userId: str


class VerifyRequest(BaseModel):
    userId: str
    challenge: str
    signature: str


@app.get("/")
def root():
    return {"message": "QuantumAuth API running"}


@app.post("/register", status_code=201)
def register(req: RegisterRequest):
    if req.publicKey in public_keys:
        raise HTTPException(status_code=409, detail="Public key already registered")

    user_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()

    users[user_id] = {
        "userId": user_id,
        "publicKey": req.publicKey,
        "createdAt": created_at,
    }
    public_keys[req.publicKey] = user_id

    return {"userId": user_id}


@app.post("/challenge")
def challenge(req: ChallengeRequest):
    if req.userId not in users:
        raise HTTPException(status_code=404, detail="User not found")

    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=60)

    challenges[req.userId] = {
        "challenge": token,
        "expiresAt": expires_at.isoformat(),
        "used": False,
    }

    return {"challenge": token, "expiresIn": 60}


@app.post("/verify")
def verify(req: VerifyRequest):
    if req.userId not in users:
        raise HTTPException(status_code=404, detail="User not found")

    stored = challenges.get(req.userId)
    if not stored or stored["challenge"] != req.challenge:
        raise HTTPException(status_code=400, detail="Invalid or missing challenge")

    if stored["used"]:
        raise HTTPException(status_code=400, detail="Challenge already used")

    expires_at = datetime.fromisoformat(stored["expiresAt"])
    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(status_code=400, detail="Challenge expired")

    # Simplified signature check: valid signature is the reversed challenge
    if req.signature != req.challenge[::-1]:
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Mark challenge as used
    stored["used"] = True

    # Call AI risk engine
    try:
        risk_data = json.dumps({"userId": req.userId}).encode('utf-8')
        risk_req = urllib.request.Request(
            f"{AI_RISK_ENGINE_URL}/risk",
            data=risk_data,
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(risk_req) as response:
            risk_result = json.loads(response.read().decode('utf-8'))
        
        risk_score = risk_result["riskScore"]
        action = risk_result["action"]
        
        if action == "deny":
            raise HTTPException(status_code=403, detail="Access denied")
        # Treat "challenge" as elevated risk but allow the login for this MVP.
        # There is no second verification step implemented in the UI yet.
        
    except urllib.error.URLError:
        # AI risk engine unavailable, default to allow with score 0.5
        risk_score = 0.5

    # Create session
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=24)
    sessions[token] = {
        "userId": req.userId,
        "expiresAt": expires_at.isoformat(),
    }

    return {"token": token, "riskScore": risk_score}

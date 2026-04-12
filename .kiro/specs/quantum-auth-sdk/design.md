# Design Document: QuantumAuth SDK

## Overview

QuantumAuth SDK is a passwordless authentication platform built on asymmetric cryptography (Ed25519). Users register a public key with the server; login is proven by signing a server-issued challenge with the corresponding private key — no password ever leaves the client.

The system is a monorepo with five primary components:

- `services/auth-service` — FastAPI backend: registration, challenge issuance, verification, session management
- `services/ai-risk-engine` — Python microservice: scores each login attempt for anomalous behavior
- `packages/crypto` — Zero-dependency TypeScript/JS utility: keypair generation, signing, verification
- `packages/sdk` — TypeScript client library: wraps Auth_Service REST API, exposes `QuantumAuthClient`
- `apps/web` — Next.js frontend: registration and login UI, consumes the SDK

### Key Design Decisions

- **Ed25519** chosen for its small key/signature size, fast verification, and strong security properties.
- **Challenge-response** protocol ensures the private key never leaves the client device.
- **In-memory stores** (`dict`) used initially for rapid development; schema is designed for drop-in SQLite/Postgres migration.
- **AI risk engine** is a separate service to allow independent scaling and model iteration without touching auth logic.
- **SDK storage adapters** decouple session persistence from the SDK core, supporting browser and server environments.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         apps/web (Next.js)                      │
│                                                                 │
│   ┌──────────────┐    ┌──────────────┐    ┌─────────────────┐  │
│   │ Register Page│    │  Login Page  │    │  Session Page   │  │
│   └──────┬───────┘    └──────┬───────┘    └────────┬────────┘  │
│          └──────────────────┼──────────────────────┘           │
│                             │ uses                              │
└─────────────────────────────┼───────────────────────────────────┘
                              │
                    ┌─────────▼──────────┐
                    │  packages/sdk      │
                    │  QuantumAuthClient │
                    └─────────┬──────────┘
                              │ uses
                    ┌─────────▼──────────┐
                    │  packages/crypto   │
                    │  generateKeypair   │
                    │  signChallenge     │
                    │  verifySignature   │
                    └────────────────────┘
                              │
                    HTTP REST │
                              │
              ┌───────────────▼───────────────┐
              │     services/auth-service      │
              │     FastAPI (Python)           │
              │                               │
              │  POST /register               │
              │  POST /challenge              │
              │  POST /verify                 │
              │  GET  /session                │
              │                               │
              │  ┌──────────────────────────┐ │
              │  │  In-Memory Store (dict)  │ │
              │  │  users / public_keys     │ │
              │  │  sessions / challenges   │ │
              │  └──────────────────────────┘ │
              └───────────────┬───────────────┘
                              │ HTTP POST (internal)
                              │ AI_RISK_ENGINE_URL
              ┌───────────────▼───────────────┐
              │   services/ai-risk-engine      │
              │   FastAPI (Python)             │
              │                               │
              │  POST /score                  │
              └───────────────────────────────┘
```

### Authentication Flow: Registration

```
Client (SDK)                Auth_Service              Storage
     │                           │                       │
     │── POST /register ─────────▶                       │
     │   { publicKey }           │                       │
     │                           │── generate UUID ──────▶
     │                           │── store user ─────────▶
     │                           │── store public_key ───▶
     │◀── 201 { userId } ────────│                       │
```

### Authentication Flow: Login (Challenge-Response)

```
Client (SDK)          Auth_Service         AI_Risk_Engine      Storage
     │                     │                     │                │
     │── POST /challenge ──▶                     │                │
     │   { username }      │── generate nonce ───────────────────▶
     │                     │── store challenge ──────────────────▶
     │◀── { nonce, expiresAt }                   │                │
     │                     │                     │                │
     │  sign(nonce, privateKey) [local]           │                │
     │                     │                     │                │
     │── POST /verify ─────▶                     │                │
     │   { username, sig } │── fetch challenge ──────────────────▶
     │                     │── verify Ed25519 sig │               │
     │                     │── POST /score ───────▶               │
     │                     │◀── { risk_score } ───│               │
     │                     │                     │                │
     │                     │  if risk_score > 0.8 → 403           │
     │                     │  else → create session ─────────────▶
     │◀── 200 { token, expiresAt }               │                │
```

---

## Components and Interfaces

### auth-service (FastAPI)

Responsible for all authentication lifecycle operations. Exposes four REST endpoints.

**Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| POST | `/register` | Register a user with a public key |
| POST | `/challenge` | Issue a signed challenge nonce |
| POST | `/verify` | Verify a signed challenge, create session |
| GET | `/session` | Retrieve session info by token |

**Internal modules:**
- `routers/auth.py` — route handlers
- `services/user_service.py` — user CRUD logic
- `services/challenge_service.py` — nonce generation and expiry
- `services/session_service.py` — session creation and validation
- `services/risk_client.py` — HTTP client for AI_Risk_Engine
- `store.py` — in-memory dict stores (swap for DB layer later)

### ai-risk-engine (FastAPI)

Stateless scoring microservice. Receives login attempt metadata and returns a risk score.

**Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| POST | `/score` | Score a login attempt |

**Scoring signals:**
- Time of day (off-hours = higher risk)
- Login attempt frequency for the user in the last 5 minutes
- Whether the IP address has been seen before for that user

### packages/crypto

Zero-dependency TypeScript package. Uses Web Crypto API in browsers and Node.js `crypto` module in Node.js environments. Environment detection is done at runtime via `typeof window`.

**Exported functions:**

```typescript
generateKeypair(): Promise<{ publicKey: string; privateKey: string }>
signChallenge(challenge: string, privateKey: string): Promise<string>
verifySignature(challenge: string, signature: string, publicKey: string): Promise<boolean>
```

All keys and signatures are base64url-encoded strings.

### packages/sdk

TypeScript client library. Wraps Auth_Service HTTP calls and orchestrates the challenge-response flow.

**Exported class:**

```typescript
class QuantumAuthClient {
  constructor(config: { baseUrl: string; storage?: StorageAdapter })
  register(username: string, publicKey: string): Promise<RegisteredUser>
  login(username: string, privateKey: string): Promise<SessionToken>
  getSession(token: string): Promise<Session>
}
```

**Storage adapter interface:**

```typescript
interface StorageAdapter {
  get(key: string): string | null
  set(key: string, value: string): void
  remove(key: string): void
}
```

### apps/web (Next.js)

Frontend application. Uses `QuantumAuthClient` exclusively — no direct HTTP calls to Auth_Service.

**Pages:**
- `/register` — username input, triggers `generateKeypair()` + `client.register()`
- `/login` — username input, triggers `client.login()`
- `/session` — displays authenticated user info from `client.getSession()`

---

## API Endpoint Contracts

### POST /register

**Request:**
```json
{ "publicKey": "string (base64url-encoded Ed25519 public key)" }
```

**Implementation notes:**
- Generate a UUID for `userId`
- Store in `users[userId] = { userId, publicKey, createdAt }`
- Store in `public_keys[userId] = publicKey`

**Responses:**

| Status | Body | Condition |
|--------|------|-----------|
| 201 | `{ "userId": "uuid" }` | Success |
| 409 | `{ "detail": "Username already exists" }` | Duplicate username |
| 422 | `{ "detail": [...] }` | Missing/malformed publicKey |

---

### POST /challenge

**Request:**
```json
{ "username": "string" }
```

**Responses:**

| Status | Body | Condition |
|--------|------|-----------|
| 200 | `{ "nonce": "hex string", "expiresAt": "ISO 8601 timestamp" }` | Success |
| 404 | `{ "detail": "User not found" }` | Unknown username |

**Notes:** Any existing unexpired challenge for the user is invalidated before issuing a new one.

---

### POST /verify

**Request:**
```json
{
  "username": "string",
  "signature": "string (base64url-encoded Ed25519 signature)"
}
```

**Responses:**

| Status | Body | Condition |
|--------|------|-----------|
| 200 | `{ "token": "string", "expiresAt": "ISO 8601 timestamp" }` | Success |
| 401 | `{ "detail": "Invalid signature" }` | Signature mismatch |
| 403 | `{ "detail": "Login blocked: high risk score" }` | Risk score > 0.8 |
| 404 | `{ "detail": "User not found" }` | Unknown username |
| 410 | `{ "detail": "Challenge expired" }` | Nonce past expiry |

---

### GET /session

**Request headers:**
```
Authorization: Bearer <token>
```

**Responses:**

| Status | Body | Condition |
|--------|------|-----------|
| 200 | `{ "userId": "uuid", "username": "string", "expiresAt": "ISO 8601 timestamp" }` | Valid session |
| 401 | `{ "detail": "Invalid or expired session" }` | Bad/missing/expired token |

---

### POST /score (AI Risk Engine)

**Request:**
```json
{
  "username": "string",
  "ip_address": "string",
  "user_agent": "string",
  "timestamp": "ISO 8601 timestamp"
}
```

**Response:**
```json
{ "risk_score": 0.0 }
```

Range: `[0.0, 1.0]`. Returns HTTP 422 on missing fields.

---

## Data Models

### In-Memory Stores (current implementation)

```python
# store.py
users: dict[str, dict] = {}
# users[userId] = { "userId": str, "publicKey": str, "createdAt": datetime }

public_keys: dict[str, str] = {}
# public_keys[userId] = publicKey (base64url string)

challenges: dict[str, dict] = {}
# challenges[userId] = { "nonce": str, "expiresAt": datetime }

sessions: dict[str, dict] = {}
# sessions[token] = { "userId": str, "expiresAt": datetime }

login_attempts: list[dict] = []
# { "userId": str, "ip": str, "userAgent": str, "riskScore": float,
#   "outcome": "success"|"failure"|"blocked", "createdAt": datetime }
```

### Relational Schema (SQLite / Postgres — future migration target)

```sql
-- Users
CREATE TABLE users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username    VARCHAR(255) UNIQUE NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Public Keys
CREATE TABLE public_keys (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    public_key  TEXT NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Sessions
CREATE TABLE sessions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token       VARCHAR(512) UNIQUE NOT NULL,
    expires_at  TIMESTAMP NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Login Attempts
CREATE TABLE login_attempts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ip_address  VARCHAR(45),
    user_agent  TEXT,
    risk_score  FLOAT,
    outcome     VARCHAR(10) CHECK (outcome IN ('success', 'failure', 'blocked')),
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Active Challenges (ephemeral, cleared after use or expiry)
CREATE TABLE challenges (
    user_id     UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    nonce       VARCHAR(64) NOT NULL,
    expires_at  TIMESTAMP NOT NULL
);
```

All foreign keys enforce referential integrity. The `challenges` table uses `user_id` as primary key to enforce the one-active-challenge-per-user invariant at the DB level.

### TypeScript Types (packages/sdk)

```typescript
interface RegisteredUser {
  userId: string;
}

interface SessionToken {
  token: string;
  expiresAt: string; // ISO 8601
}

interface Session {
  userId: string;
  username: string;
  expiresAt: string; // ISO 8601
}

interface StorageAdapter {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Registration creates a valid user record

*For any* valid `publicKey` string, calling `POST /register` SHALL return HTTP 201 with a `userId` field, and the stored user record SHALL associate that `userId` with the provided `publicKey`.

**Validates: Requirements 1.1, 1.5**

---

### Property 2: Challenge response is well-formed

*For any* registered user, calling `POST /challenge` SHALL return a nonce that is a 64-character hex string (32 bytes) and an `expiresAt` timestamp that is approximately 60 seconds in the future.

**Validates: Requirements 2.1, 2.3, 2.5**

---

### Property 3: Challenge invalidation on re-issue

*For any* registered user, issuing a second challenge SHALL invalidate the first — the first nonce SHALL no longer be accepted for verification after the second challenge is issued.

**Validates: Requirements 2.4**

---

### Property 4: Full authentication round-trip succeeds

*For any* Ed25519 keypair and any registered user, completing the full challenge-response flow (register → challenge → sign → verify) SHALL return HTTP 200 with a session `token` and `expiresAt` timestamp.

**Validates: Requirements 3.1, 3.2**

---

### Property 5: Wrong key produces 401

*For any* registered user, signing a challenge with a private key that does not correspond to the registered public key SHALL result in HTTP 401 from `POST /verify`.

**Validates: Requirements 3.3**

---

### Property 6: Every verify request records a login attempt

*For any* `POST /verify` request (regardless of outcome), a `LoginAttempt` record SHALL be created containing the correct `username`, `ip_address`, `user_agent`, and `outcome`.

**Validates: Requirements 3.5**

---

### Property 7: High risk score blocks login

*For any* risk score strictly greater than 0.8 returned by the AI_Risk_Engine, `POST /verify` SHALL return HTTP 403 and the `LoginAttempt` SHALL be recorded with outcome `blocked`.

**Validates: Requirements 3.7**

---

### Property 8: Session retrieval returns correct user data

*For any* successfully authenticated user, calling `GET /session` with the returned token SHALL return the correct `userId`, `username`, and an `expiresAt` timestamp that is approximately 24 hours from session creation.

**Validates: Requirements 4.1, 4.4**

---

### Property 9: Crypto round-trip — sign then verify returns true

*For any* keypair generated by `generateKeypair()` and any non-empty challenge string, calling `signChallenge(challenge, privateKey)` followed by `verifySignature(challenge, signature, publicKey)` SHALL return `true`.

**Validates: Requirements 5.4**

---

### Property 10: Cross-keypair verification returns false

*For any* two distinct keypairs generated by `generateKeypair()` and any challenge string, a signature produced with keypair A's private key SHALL cause `verifySignature` to return `false` when called with keypair B's public key.

**Validates: Requirements 5.4**

---

### Property 11: Risk score is always in [0.0, 1.0]

*For any* valid scoring request sent to the AI_Risk_Engine (with any combination of `username`, `ip_address`, `user_agent`, and `timestamp`), the returned `risk_score` SHALL be a float in the range `[0.0, 1.0]` inclusive.

**Validates: Requirements 7.1**

---

### Property 12: Risk engine fallback allows login

*For any* valid `POST /verify` request when the AI_Risk_Engine is unreachable, the Auth_Service SHALL treat the risk score as 0.5 and allow the login to proceed (returning HTTP 200).

**Validates: Requirements 7.5**

---

## Error Handling

### Auth_Service

| Scenario | HTTP Status | Response |
|----------|-------------|----------|
| Duplicate username on register | 409 | `{ "detail": "Username already exists" }` |
| Missing/malformed publicKey | 422 | FastAPI validation error body |
| Unknown username on challenge/verify | 404 | `{ "detail": "User not found" }` |
| Invalid signature | 401 | `{ "detail": "Invalid signature" }` |
| Expired challenge | 410 | `{ "detail": "Challenge expired" }` |
| Risk score > 0.8 | 403 | `{ "detail": "Login blocked: high risk score" }` |
| Invalid/missing session token | 401 | `{ "detail": "Invalid or expired session" }` |
| AI Risk Engine unreachable | — | Default score 0.5, log warning, continue |

### Crypto Package

- `signChallenge` with malformed `privateKey` → throws `CryptoError` with descriptive message
- `verifySignature` with malformed inputs → throws `CryptoError`
- All crypto errors are instances of a named `CryptoError` class (not generic `Error`) for typed catching

### SDK Client

| Method | Error Class | Trigger |
|--------|-------------|---------|
| `register()` | `RegistrationError` | 409, 422, network failure |
| `login()` | `AuthenticationError` | 401, 403, 410, 404, network failure |
| `getSession()` | `SessionError` | 401, network failure |

All SDK error classes extend a base `QuantumAuthError` with a `code` field for programmatic handling.

### AI Risk Engine

- Missing required fields → HTTP 422
- Internal scoring error → HTTP 500 (Auth_Service treats as unreachable, defaults to 0.5)

---

## Testing Strategy

### Unit Tests

Focus on specific examples, edge cases, and error conditions:

- `packages/crypto`: malformed key inputs throw `CryptoError`; empty challenge string handling
- `services/auth-service`: duplicate username returns 409; expired challenge returns 410; missing fields return 422
- `services/ai-risk-engine`: missing fields return 422; score clamped to [0, 1]
- `packages/sdk`: typed errors thrown on each HTTP error code; storage adapter called after login

### Property-Based Tests

PBT is appropriate for this feature because:
- The crypto package is a pure function layer with clear input/output behavior
- The auth flow has universal round-trip properties (register → challenge → sign → verify)
- The risk engine has a bounded output invariant (score ∈ [0, 1])
- Input variation (random keypairs, random challenge strings, random usernames) reveals edge cases

**Library choices:**
- TypeScript (`packages/crypto`, `packages/sdk`): [fast-check](https://github.com/dubzzz/fast-check)
- Python (`services/auth-service`, `services/ai-risk-engine`): [Hypothesis](https://hypothesis.readthedocs.io/)

**Configuration:** Each property test runs a minimum of 100 iterations.

**Tag format:** `# Feature: quantum-auth-sdk, Property {N}: {property_text}`

**Property test mapping:**

| Property | Package | Library | Key Generators |
|----------|---------|---------|----------------|
| P1: Registration creates valid user record | auth-service | Hypothesis | `st.text()` for username, `st.binary(min_size=32)` for key |
| P2: Challenge response is well-formed | auth-service | Hypothesis | registered user strategy |
| P3: Challenge invalidation on re-issue | auth-service | Hypothesis | registered user strategy |
| P4: Full auth round-trip succeeds | auth-service | Hypothesis | keypair + username strategy |
| P5: Wrong key produces 401 | auth-service | Hypothesis | two distinct keypair strategy |
| P6: Every verify records a login attempt | auth-service | Hypothesis | keypair + username strategy |
| P7: High risk score blocks login | auth-service | Hypothesis | `st.floats(min_value=0.81, max_value=1.0)` |
| P8: Session retrieval returns correct data | auth-service | Hypothesis | full auth flow strategy |
| P9: Crypto round-trip returns true | packages/crypto | fast-check | `fc.string()` for challenge, `fc.constant(await generateKeypair())` |
| P10: Cross-keypair verification returns false | packages/crypto | fast-check | two independent keypair arbitraries |
| P11: Risk score in [0, 1] | ai-risk-engine | Hypothesis | `st.text()`, `st.ip_addresses()`, `st.datetimes()` |
| P12: Risk engine fallback allows login | auth-service | Hypothesis | mock unreachable engine + keypair strategy |

### Integration Tests

- Auth_Service calls AI_Risk_Engine on every `POST /verify` (mock engine, verify call received)
- SDK communicates with Auth_Service only via the four defined endpoints
- Web_App uses SDK exclusively (no direct fetch to Auth_Service)

### Smoke Tests

- TypeScript compilation of `packages/crypto` and `packages/sdk` succeeds
- `packages/crypto` runs without errors in both browser (jsdom) and Node.js environments
- Database schema migrations apply cleanly to a fresh SQLite instance
- AI_Risk_Engine responds within 500ms under normal load

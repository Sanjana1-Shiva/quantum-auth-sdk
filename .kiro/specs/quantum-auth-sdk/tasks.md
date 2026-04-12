# Implementation Plan: QuantumAuth SDK

## Overview

Implement the full QuantumAuth SDK monorepo incrementally, starting with the auth-service registration endpoint (immediate priority), then building out the remaining auth endpoints, the AI risk engine, the crypto package, the SDK client, and finally the Next.js frontend. Each task builds on the previous and ends with all components wired together.

## Tasks

- [x] 1. Implement POST /register endpoint in auth-service
  - [x] 1.1 Add in-memory store and register route to `services/auth-service/main.py`
    - Add `users: dict` and `public_keys: dict` module-level stores to `main.py`
    - Define a Pydantic `RegisterRequest` model with a required `publicKey: str` field
    - Implement `POST /register`: generate UUID, store user record with `createdAt` timestamp, store public key, return `{ "userId": userId }` with HTTP 201
    - Return HTTP 409 if a user with the same `publicKey` already exists (or duplicate username if username is added later)
    - Integrate the route into the existing FastAPI `app` instance — do not replace the existing root endpoint
    - _Requirements: 1.1, 1.3, 1.4, 1.5, 8.1, 8.2_

  - [ ]* 1.2 Write property test for registration (Property 1)
    - **Property 1: Registration creates a valid user record**
    - **Validates: Requirements 1.1, 1.5**
    - Use Hypothesis `st.text()` for `publicKey`; assert response is 201 and `userId` is a valid UUID; assert stored record associates `userId` with the provided `publicKey`
    - Tag: `# Feature: quantum-auth-sdk, Property 1: Registration creates a valid user record`

  - [ ]* 1.3 Write unit tests for register edge cases
    - Test missing `publicKey` returns 422
    - Test duplicate registration returns 409
    - _Requirements: 1.2, 1.3_

- [x] 2. Implement POST /challenge endpoint in auth-service
  - [x] 2.1 Add challenge store and challenge route
    - Add `challenges: dict` store to `store.py` (extract stores from `main.py` into `services/auth-service/store.py`)
    - Implement `POST /challenge`: look up user by username (404 if not found), generate 32 random bytes as hex nonce, invalidate any existing challenge for the user, store `{ nonce, expiresAt }` with 60-second expiry, return `{ "nonce": hex, "expiresAt": ISO8601 }`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ]* 2.2 Write property test for challenge response (Property 2)
    - **Property 2: Challenge response is well-formed**
    - **Validates: Requirements 2.1, 2.3, 2.5**
    - Assert nonce is exactly 64 hex characters; assert `expiresAt` is ~60 seconds in the future
    - Tag: `# Feature: quantum-auth-sdk, Property 2: Challenge response is well-formed`

  - [ ]* 2.3 Write property test for challenge invalidation (Property 3)
    - **Property 3: Challenge invalidation on re-issue**
    - **Validates: Requirements 2.4**
    - Issue two challenges for the same user; assert the first nonce is no longer stored after the second is issued
    - Tag: `# Feature: quantum-auth-sdk, Property 3: Challenge invalidation on re-issue`

  - [ ]* 2.4 Write unit tests for challenge edge cases
    - Test unknown username returns 404
    - _Requirements: 2.2_

- [ ] 3. Checkpoint — Ensure all auth-service tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement POST /verify endpoint and session management in auth-service
  - [x] 4.1 Add sessions and login_attempts stores; implement verify route
    - Add `sessions: dict` and `login_attempts: list` to `store.py`
    - Implement `POST /verify`: look up user (404), retrieve active challenge (410 if expired/missing), verify Ed25519 signature using `cryptography` library (401 on failure), record `LoginAttempt` with ip, user_agent, outcome
    - On successful verification, call AI_Risk_Engine via `POST {AI_RISK_ENGINE_URL}/score`; default to 0.5 and log warning if unreachable (Requirement 7.5); return 403 if score > 0.8 with outcome `blocked`
    - On success, generate session token (UUID or secrets token), store in `sessions` with 24-hour expiry, return `{ "token": token, "expiresAt": ISO8601 }` with HTTP 200
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 4.4, 10.1_

  - [ ]* 4.2 Write property test for full auth round-trip (Property 4)
    - **Property 4: Full authentication round-trip succeeds**
    - **Validates: Requirements 3.1, 3.2**
    - Use Hypothesis to generate random Ed25519 keypairs and usernames; run register → challenge → sign → verify; assert HTTP 200 with `token` and `expiresAt`
    - Tag: `# Feature: quantum-auth-sdk, Property 4: Full authentication round-trip succeeds`

  - [ ]* 4.3 Write property test for wrong key produces 401 (Property 5)
    - **Property 5: Wrong key produces 401**
    - **Validates: Requirements 3.3**
    - Register with keypair A; issue challenge; sign with keypair B's private key; assert HTTP 401
    - Tag: `# Feature: quantum-auth-sdk, Property 5: Wrong key produces 401`

  - [ ]* 4.4 Write property test for login attempt recording (Property 6)
    - **Property 6: Every verify request records a login attempt**
    - **Validates: Requirements 3.5**
    - For any verify request (success or failure), assert a `LoginAttempt` record exists with correct username, ip, user_agent, and outcome
    - Tag: `# Feature: quantum-auth-sdk, Property 6: Every verify request records a login attempt`

  - [ ]* 4.5 Write property test for high risk score blocking (Property 7)
    - **Property 7: High risk score blocks login**
    - **Validates: Requirements 3.7**
    - Mock AI_Risk_Engine to return `st.floats(min_value=0.81, max_value=1.0)`; assert HTTP 403 and `LoginAttempt.outcome == "blocked"`
    - Tag: `# Feature: quantum-auth-sdk, Property 7: High risk score blocks login`

  - [ ]* 4.6 Write property test for risk engine fallback (Property 12)
    - **Property 12: Risk engine fallback allows login**
    - **Validates: Requirements 7.5**
    - Mock AI_Risk_Engine as unreachable; assert HTTP 200 is returned and a warning is logged
    - Tag: `# Feature: quantum-auth-sdk, Property 12: Risk engine fallback allows login`

  - [ ]* 4.7 Write unit tests for verify edge cases
    - Test expired challenge returns 410
    - Test missing challenge returns 410
    - Test unknown username returns 404
    - _Requirements: 3.4_

- [ ] 5. Implement GET /session endpoint in auth-service
  - [ ] 5.1 Add session retrieval route
    - Implement `GET /session`: extract Bearer token from `Authorization` header (401 if missing/malformed), look up session in `sessions` store (401 if not found or expired), return `{ "userId", "username", "expiresAt" }` with HTTP 200
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [ ]* 5.2 Write property test for session retrieval (Property 8)
    - **Property 8: Session retrieval returns correct user data**
    - **Validates: Requirements 4.1, 4.4**
    - After a successful full auth flow, assert `GET /session` returns correct `userId`, `username`, and `expiresAt` ~24 hours from creation
    - Tag: `# Feature: quantum-auth-sdk, Property 8: Session retrieval returns correct user data`

  - [ ]* 5.3 Write unit tests for session edge cases
    - Test missing Authorization header returns 401
    - Test invalid token returns 401
    - Test expired session token returns 401
    - _Requirements: 4.2, 4.3_

- [ ] 6. Checkpoint — Ensure all auth-service tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement AI risk engine service
  - [x] 7.1 Create `services/ai-risk-engine/main.py` with POST /score endpoint
    - Initialize a FastAPI app with a `POST /score` endpoint
    - Define a Pydantic `ScoreRequest` model with required fields: `username`, `ip_address`, `user_agent`, `timestamp`
    - Implement scoring logic using three signals: time-of-day (off-hours weight), login attempt frequency for the user in the last 5 minutes (in-memory counter), and whether the IP has been seen before for that user (in-memory set)
    - Combine signals into a `risk_score` float clamped to `[0.0, 1.0]`; return `{ "risk_score": float }`
    - Return HTTP 422 on missing required fields (FastAPI validation handles this automatically)
    - _Requirements: 7.1, 7.2, 7.3_

  - [ ]* 7.2 Write property test for risk score bounds (Property 11)
    - **Property 11: Risk score is always in [0.0, 1.0]**
    - **Validates: Requirements 7.1**
    - Use Hypothesis `st.text()`, `st.ip_addresses()`, `st.datetimes()` to generate arbitrary valid inputs; assert `0.0 <= risk_score <= 1.0` for all
    - Tag: `# Feature: quantum-auth-sdk, Property 11: Risk score is always in [0.0, 1.0]`

  - [ ]* 7.3 Write unit tests for risk engine edge cases
    - Test missing required fields returns 422
    - Test score is clamped and never exceeds 1.0 or goes below 0.0
    - _Requirements: 7.3_

- [ ] 8. Checkpoint — Ensure all service tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Implement packages/crypto TypeScript package
  - [ ] 9.1 Scaffold `packages/crypto` package with TypeScript config and dependencies
    - Create `packages/crypto/package.json` with name `@quantum-auth/crypto`, set `"type": "module"`, add `typescript` and `fast-check` as dev dependencies
    - Create `packages/crypto/tsconfig.json` targeting ES2020 with `moduleResolution: bundler`
    - Create `packages/crypto/src/index.ts` as the main entry point

  - [ ] 9.2 Implement `generateKeypair`, `signChallenge`, and `verifySignature`
    - Detect environment at runtime via `typeof window !== "undefined"` to choose Web Crypto API vs Node.js `crypto` module
    - Implement `generateKeypair(): Promise<{ publicKey: string; privateKey: string }>` using Ed25519; encode keys as base64url strings
    - Implement `signChallenge(challenge: string, privateKey: string): Promise<string>` returning a base64url-encoded signature; throw `CryptoError` on malformed `privateKey`
    - Implement `verifySignature(challenge: string, signature: string, publicKey: string): Promise<boolean>`; throw `CryptoError` on malformed inputs
    - Define and export `CryptoError extends Error` with a descriptive `message`
    - Export all three functions and `CryptoError` from `src/index.ts`
    - _Requirements: 5.1, 5.2, 5.3, 5.5, 5.6, 10.4_

  - [ ]* 9.3 Write property test for crypto round-trip (Property 9)
    - **Property 9: Crypto round-trip — sign then verify returns true**
    - **Validates: Requirements 5.4**
    - Use `fc.string({ minLength: 1 })` for challenge; generate a keypair once per run; assert `verifySignature(challenge, await signChallenge(challenge, privateKey), publicKey) === true`
    - Tag: `# Feature: quantum-auth-sdk, Property 9: Crypto round-trip — sign then verify returns true`

  - [ ]* 9.4 Write property test for cross-keypair verification (Property 10)
    - **Property 10: Cross-keypair verification returns false**
    - **Validates: Requirements 5.4**
    - Generate two independent keypairs A and B; sign challenge with A's private key; assert `verifySignature(challenge, signature, B.publicKey) === false`
    - Tag: `# Feature: quantum-auth-sdk, Property 10: Cross-keypair verification returns false`

  - [ ]* 9.5 Write unit tests for crypto error handling
    - Test `signChallenge` with malformed `privateKey` throws `CryptoError`
    - Test `verifySignature` with malformed inputs throws `CryptoError`
    - _Requirements: 5.5_

- [ ] 10. Checkpoint — Ensure all crypto package tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Implement packages/sdk TypeScript client
  - [x] 11.1 Scaffold `packages/sdk` package
    - Create `packages/sdk/package.json` with name `@quantum-auth/sdk`; add `@quantum-auth/crypto` as a workspace dependency; add `typescript` and `fast-check` as dev dependencies
    - Create `packages/sdk/tsconfig.json`
    - Create `packages/sdk/src/index.ts` as the main entry point

  - [x] 11.2 Define SDK types and error classes
    - Define and export TypeScript interfaces: `RegisteredUser`, `SessionToken`, `Session`, `StorageAdapter`
    - Define and export error classes: `QuantumAuthError` (base, with `code: string`), `RegistrationError`, `AuthenticationError`, `SessionError` — all extending `QuantumAuthError`
    - _Requirements: 6.5_

  - [x] 11.3 Implement `QuantumAuthClient` class
    - Implement constructor accepting `{ baseUrl: string; storage?: StorageAdapter }`
    - Implement `register(username: string, publicKey: string): Promise<RegisteredUser>` — `POST /register`; throw `RegistrationError` on 409, 422, or network failure
    - Implement `login(username: string, privateKey: string): Promise<SessionToken>` — `POST /challenge` → sign with `signChallenge` → `POST /verify`; persist token via `storage` if provided; throw `AuthenticationError` on 401, 403, 410, 404, or network failure
    - Implement `getSession(token: string): Promise<Session>` — `GET /session` with `Authorization: Bearer <token>`; throw `SessionError` on 401 or network failure
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.6, 10.2_

  - [ ]* 11.4 Write unit tests for SDK error mapping
    - Mock fetch to return each error status code; assert the correct typed error class is thrown for each
    - Test storage adapter `set` is called after successful `login`
    - _Requirements: 6.2, 6.3, 6.4, 6.6_

- [ ] 12. Checkpoint — Ensure all SDK tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Implement Next.js frontend pages
  - [x] 13.1 Add `@quantum-auth/sdk` dependency to `apps/web` and configure workspace resolution
    - Add `@quantum-auth/sdk` to `apps/web/package.json` dependencies
    - Ensure `turbo.json` pipeline includes `packages/crypto` and `packages/sdk` build steps before `apps/web`

  - [x] 13.2 Implement `/register` page
    - Create `apps/web/src/app/register/page.tsx`
    - Render a username input and a "Register" button
    - On submit: call `generateKeypair()`, call `client.register(username, publicKey)`, display confirmation message and prompt user to save their private key
    - Display human-readable error message on `RegistrationError`
    - _Requirements: 9.1, 9.3, 9.5_

  - [x] 13.3 Implement `/login` page
    - Create `apps/web/src/app/login/page.tsx`
    - Render a username input and a "Login" button
    - On submit: call `client.login(username, privateKey)` (private key retrieved from user input or localStorage); store session token via SDK storage adapter backed by `localStorage`
    - Display human-readable error message on `AuthenticationError`
    - _Requirements: 9.2, 9.5, 9.6, 10.3_

  - [x] 13.4 Implement `/session` page
    - Create `apps/web/src/app/session/page.tsx`
    - On mount: retrieve token from `localStorage`, call `client.getSession(token)`, display `username` and `expiresAt`
    - Display error message on `SessionError` or missing token
    - _Requirements: 9.4, 9.5, 10.3_

  - [ ]* 13.5 Write unit tests for frontend pages
    - Test register page calls `generateKeypair` and `client.register` on submit
    - Test login page calls `client.login` and stores token on success
    - Test session page calls `client.getSession` and displays user info
    - _Requirements: 9.1, 9.2, 9.4_

- [ ] 14. Final checkpoint — Wire everything together and ensure all tests pass
  - Verify `services/auth-service` calls `AI_RISK_ENGINE_URL` env var for risk scoring (Requirement 10.1)
  - Verify `apps/web` uses `QuantumAuthClient` exclusively with no direct fetch calls to auth-service (Requirement 10.3)
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- The immediate priority is task 1.1 (POST /register in `services/auth-service/main.py`)
- Python services use [Hypothesis](https://hypothesis.readthedocs.io/) for property-based tests
- TypeScript packages use [fast-check](https://github.com/dubzzz/fast-check) for property-based tests
- Each property test runs a minimum of 100 iterations
- In-memory stores (`dict`) are used throughout; the relational schema in the design is the migration target
- `AI_RISK_ENGINE_URL` must be set as an environment variable before running auth-service in production

# Requirements Document

## Introduction

QuantumAuth SDK is a developer-first, passwordless authentication platform built as a SaaS product.
It uses asymmetric keypair cryptography and a challenge-response protocol to authenticate users
without passwords. An AI-based risk scoring engine evaluates each login attempt to detect anomalous
behavior. The system is structured as a monorepo with a Next.js frontend, a FastAPI auth backend,
an AI risk engine service, a JavaScript/TypeScript SDK package, and a shared crypto utilities package.

## Glossary

- **Auth_Service**: The FastAPI backend service responsible for registration, challenge issuance, and session management (`services/auth-service`).
- **AI_Risk_Engine**: The Python microservice that scores login attempts for risk (`services/ai-risk-engine`).
- **SDK**: The JavaScript/TypeScript client library that wraps Auth_Service API calls and handles local keypair operations (`packages/sdk`).
- **Crypto_Package**: The shared utility package providing keypair generation, signing, and verification helpers (`packages/crypto`).
- **Web_App**: The Next.js frontend application (`apps/web`).
- **User**: A registered human end-user of the platform.
- **Keypair**: An asymmetric cryptographic key pair consisting of a public key and a private key, generated using Ed25519.
- **Challenge**: A cryptographically random nonce issued by the Auth_Service that the User must sign with their private key to prove identity.
- **Session**: A server-side record representing an authenticated User session, identified by a session token.
- **LoginAttempt**: A record of a single authentication attempt, including metadata used for risk scoring.
- **Risk_Score**: A numeric value between 0 and 1 produced by the AI_Risk_Engine representing the likelihood that a login attempt is fraudulent (0 = low risk, 1 = high risk).
- **Public_Key**: The public half of a User's Keypair, stored server-side and used to verify challenge signatures.
- **Private_Key**: The private half of a User's Keypair, stored only on the client device and never transmitted.

---

## Requirements

### Requirement 1: User Registration

**User Story:** As a developer integrating QuantumAuth, I want to register a user with a public key, so that the user can authenticate without a password.

#### Acceptance Criteria

1. WHEN a `POST /register` request is received with a valid `username` and `public_key`, THE Auth_Service SHALL create a new User record and associate the Public_Key with that User.
2. WHEN a `POST /register` request is received with a `username` that already exists, THE Auth_Service SHALL return an HTTP 409 response with a descriptive error message.
3. WHEN a `POST /register` request is received with a missing or malformed `public_key`, THE Auth_Service SHALL return an HTTP 422 response with a field-level validation error.
4. THE Auth_Service SHALL store the Public_Key in the PublicKey table linked to the User record by user ID.
5. WHEN registration succeeds, THE Auth_Service SHALL return an HTTP 201 response containing the created user's ID and username.

---

### Requirement 2: Challenge Issuance

**User Story:** As a developer, I want the backend to issue a time-limited challenge nonce, so that the client can sign it to prove key ownership.

#### Acceptance Criteria

1. WHEN a `POST /challenge` request is received with a valid `username`, THE Auth_Service SHALL generate a cryptographically random 32-byte nonce and return it as a hex-encoded string.
2. WHEN a `POST /challenge` request is received with a `username` that does not exist, THE Auth_Service SHALL return an HTTP 404 response.
3. THE Auth_Service SHALL store the issued challenge nonce associated with the User and set an expiry of 60 seconds from issuance.
4. WHILE a challenge is active for a User, THE Auth_Service SHALL invalidate any previously issued unexpired challenge for that same User before issuing a new one.
5. THE Auth_Service SHALL include the challenge expiry timestamp in the response so the client can display a countdown.

---

### Requirement 3: Challenge Verification and Session Creation

**User Story:** As a developer, I want the backend to verify a signed challenge and create a session, so that the user is authenticated.

#### Acceptance Criteria

1. WHEN a `POST /verify` request is received with a valid `username` and `signature`, THE Auth_Service SHALL retrieve the active challenge for that User and verify the signature against the stored Public_Key using Ed25519.
2. WHEN signature verification succeeds, THE Auth_Service SHALL create a Session record and return an HTTP 200 response containing a session token and expiry timestamp.
3. WHEN signature verification fails, THE Auth_Service SHALL return an HTTP 401 response with a descriptive error message and record the failed LoginAttempt.
4. WHEN the challenge has expired at the time of `POST /verify`, THE Auth_Service SHALL return an HTTP 410 response indicating the challenge has expired.
5. WHEN a `POST /verify` request is received, THE Auth_Service SHALL record a LoginAttempt with metadata including timestamp, IP address, user agent, and verification outcome.
6. WHEN a `POST /verify` request is received, THE Auth_Service SHALL request a Risk_Score from the AI_Risk_Engine before finalizing the session.
7. IF the Risk_Score returned by the AI_Risk_Engine is greater than 0.8, THEN THE Auth_Service SHALL reject the login with an HTTP 403 response and flag the LoginAttempt as high-risk.

---

### Requirement 4: Session Retrieval

**User Story:** As a developer, I want to retrieve the current session state, so that the frontend can display the authenticated user's information.

#### Acceptance Criteria

1. WHEN a `GET /session` request is received with a valid session token in the `Authorization` header, THE Auth_Service SHALL return the associated User's ID, username, and session expiry timestamp.
2. WHEN a `GET /session` request is received with an invalid or missing session token, THE Auth_Service SHALL return an HTTP 401 response.
3. WHEN a `GET /session` request is received with an expired session token, THE Auth_Service SHALL return an HTTP 401 response with a message indicating the session has expired.
4. THE Auth_Service SHALL set session token expiry to 24 hours from the time of creation.

---

### Requirement 5: Keypair Generation (Crypto Package)

**User Story:** As a developer using the SDK, I want a utility to generate Ed25519 keypairs in the browser or Node.js, so that I can register and authenticate users without managing cryptography directly.

#### Acceptance Criteria

1. THE Crypto_Package SHALL expose a `generateKeypair()` function that returns an object containing a `publicKey` and `privateKey` as base64url-encoded strings.
2. THE Crypto_Package SHALL expose a `signChallenge(challenge: string, privateKey: string)` function that returns a base64url-encoded Ed25519 signature.
3. THE Crypto_Package SHALL expose a `verifySignature(challenge: string, signature: string, publicKey: string)` function that returns a boolean.
4. FOR ALL valid keypairs generated by `generateKeypair()`, signing a challenge with `signChallenge` and verifying with `verifySignature` SHALL return `true` (round-trip property).
5. WHEN `signChallenge` is called with a malformed `privateKey`, THE Crypto_Package SHALL throw a descriptive `CryptoError`.
6. THE Crypto_Package SHALL use the Web Crypto API when running in a browser environment and the Node.js `crypto` module when running in a Node.js environment.

---

### Requirement 6: SDK Client

**User Story:** As a developer, I want a typed SDK that wraps the Auth_Service API, so that I can integrate QuantumAuth into any JavaScript or TypeScript application with minimal boilerplate.

#### Acceptance Criteria

1. THE SDK SHALL expose a `QuantumAuthClient` class that accepts a `baseUrl` configuration option pointing to the Auth_Service.
2. WHEN `QuantumAuthClient.register(username, publicKey)` is called, THE SDK SHALL send a `POST /register` request and return the created user object or throw a typed `RegistrationError`.
3. WHEN `QuantumAuthClient.login(username, privateKey)` is called, THE SDK SHALL perform the full challenge-response flow (fetch challenge → sign → verify) and return a session token or throw a typed `AuthenticationError`.
4. WHEN `QuantumAuthClient.getSession(token)` is called, THE SDK SHALL send a `GET /session` request with the token and return the session object or throw a typed `SessionError`.
5. THE SDK SHALL be written in TypeScript and export type definitions for all public interfaces.
6. WHERE a `storage` option is provided to `QuantumAuthClient`, THE SDK SHALL persist the session token using the provided storage adapter (e.g., `localStorage`, `sessionStorage`, or a custom adapter).

---

### Requirement 7: AI Risk Scoring

**User Story:** As a platform operator, I want each login attempt scored for risk, so that suspicious logins can be blocked automatically.

#### Acceptance Criteria

1. WHEN the AI_Risk_Engine receives a risk scoring request containing `username`, `ip_address`, `user_agent`, and `timestamp`, THE AI_Risk_Engine SHALL return a `risk_score` between 0.0 and 1.0 inclusive.
2. THE AI_Risk_Engine SHALL consider the following signals when computing the Risk_Score: time of day, frequency of recent login attempts for the User, and whether the IP address has been seen before for that User.
3. WHEN the AI_Risk_Engine receives a request with missing required fields, THE AI_Risk_Engine SHALL return an HTTP 422 response.
4. THE AI_Risk_Engine SHALL respond to scoring requests within 500 milliseconds under normal operating conditions.
5. IF the AI_Risk_Engine is unreachable, THEN THE Auth_Service SHALL default to a Risk_Score of 0.5 and log a warning, allowing the login to proceed.

---

### Requirement 8: Database Schema

**User Story:** As a backend developer, I want a well-defined relational schema, so that user, key, session, and attempt data are stored consistently.

#### Acceptance Criteria

1. THE Auth_Service SHALL maintain a `users` table with columns: `id` (UUID, primary key), `username` (unique string), `created_at` (timestamp).
2. THE Auth_Service SHALL maintain a `public_keys` table with columns: `id` (UUID, primary key), `user_id` (foreign key → users.id), `public_key` (text), `created_at` (timestamp).
3. THE Auth_Service SHALL maintain a `sessions` table with columns: `id` (UUID, primary key), `user_id` (foreign key → users.id), `token` (unique string), `expires_at` (timestamp), `created_at` (timestamp).
4. THE Auth_Service SHALL maintain a `login_attempts` table with columns: `id` (UUID, primary key), `user_id` (foreign key → users.id), `ip_address` (string), `user_agent` (string), `risk_score` (float), `outcome` (enum: `success` | `failure` | `blocked`), `created_at` (timestamp).
5. THE Auth_Service SHALL enforce referential integrity between all foreign key relationships.

---

### Requirement 9: Frontend Authentication UI

**User Story:** As an end user, I want a simple web interface to register and log in, so that I can experience the passwordless authentication flow.

#### Acceptance Criteria

1. THE Web_App SHALL provide a registration page where a User can enter a username and trigger keypair generation and registration via the SDK.
2. THE Web_App SHALL provide a login page where a User can enter a username and trigger the challenge-response flow via the SDK.
3. WHEN registration succeeds, THE Web_App SHALL display a confirmation message and prompt the User to save their private key.
4. WHEN login succeeds, THE Web_App SHALL display the authenticated User's username and session expiry time.
5. WHEN an authentication error occurs, THE Web_App SHALL display a human-readable error message corresponding to the error type.
6. THE Web_App SHALL store the session token in `localStorage` using the SDK's storage adapter after a successful login.

---

### Requirement 10: Inter-Service Communication

**User Story:** As a system architect, I want clear contracts between all services and packages, so that each component can be developed and tested independently.

#### Acceptance Criteria

1. THE Auth_Service SHALL communicate with the AI_Risk_Engine exclusively via HTTP POST to an internal endpoint configurable via the `AI_RISK_ENGINE_URL` environment variable.
2. THE SDK SHALL communicate with the Auth_Service exclusively via the four defined REST endpoints (`POST /register`, `POST /challenge`, `POST /verify`, `GET /session`).
3. THE Web_App SHALL interact with the Auth_Service exclusively through the SDK and SHALL NOT make direct HTTP calls to the Auth_Service.
4. THE Crypto_Package SHALL have zero runtime dependencies outside of the platform's built-in Web Crypto API and Node.js `crypto` module.
5. THE Auth_Service SHALL accept and return JSON for all request and response bodies.

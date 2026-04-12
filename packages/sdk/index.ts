export interface RegisterResponse {
  userId: string;
}

export interface ChallengeResponse {
  challenge: string;
  expiresIn: number;
}

export interface VerifyResponse {
  token: string;
  riskScore: number;
}

export class QuantumAuthError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "QuantumAuthError";
  }
}

export class RegistrationError extends QuantumAuthError {
  constructor(message: string, code: string) {
    super(message, code);
    this.name = "RegistrationError";
  }
}

export class AuthenticationError extends QuantumAuthError {
  constructor(message: string, code: string) {
    super(message, code);
    this.name = "AuthenticationError";
  }
}

export class SessionError extends QuantumAuthError {
  constructor(message: string, code: string) {
    super(message, code);
    this.name = "SessionError";
  }
}

export interface QuantumAuthClientConfig {
  baseUrl: string;
}

type JsonRecord = Record<string, unknown>;

const reverseString = (value: string) => value.split("").reverse().join("");

async function requestJson<T>(
  baseUrl: string,
  path: string,
  body: JsonRecord,
  ErrorType: typeof QuantumAuthError
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Network request failed";
    throw new ErrorType(message, "NETWORK_ERROR");
  }

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;

    try {
      const errorBody = (await response.json()) as { detail?: string };
      if (typeof errorBody.detail === "string") {
        message = errorBody.detail;
      }
    } catch {
      // Fall back to status text when the body is not JSON.
    }

    throw new ErrorType(message, String(response.status));
  }

  return (await response.json()) as T;
}

export class QuantumAuthClient {
  private readonly baseUrl: string;

  constructor(config: string | QuantumAuthClientConfig) {
    this.baseUrl =
      typeof config === "string" ? config.replace(/\/$/, "") : config.baseUrl.replace(/\/$/, "");
  }

  async register(publicKey: string): Promise<RegisterResponse> {
    return requestJson<RegisterResponse>(
      this.baseUrl,
      "/register",
      { publicKey },
      RegistrationError
    );
  }

  async getChallenge(userId: string): Promise<ChallengeResponse> {
    return requestJson<ChallengeResponse>(
      this.baseUrl,
      "/challenge",
      { userId },
      AuthenticationError
    );
  }

  async verify(userId: string, challenge: string): Promise<VerifyResponse> {
    return requestJson<VerifyResponse>(
      this.baseUrl,
      "/verify",
      {
        userId,
        challenge,
        signature: reverseString(challenge),
      },
      AuthenticationError
    );
  }
}

export default QuantumAuthClient;

"use client";

import { useState } from "react";
import QuantumAuthClient, {
  AuthenticationError,
  RegistrationError,
} from "@quantum-auth/sdk";

const createSignature = (value: string) => value.split("").reverse().join("");
const AUTH_SERVICE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ||
  "http://127.0.0.1:8000";

export default function Home() {
  const [publicKey, setPublicKey] = useState("test-key-123");
  const [userId, setUserId] = useState("");
  const [challenge, setChallenge] = useState("");
  const [signature, setSignature] = useState("");
  const [token, setToken] = useState("");
  const [riskScore, setRiskScore] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const [activeAction, setActiveAction] = useState<"register" | "login" | null>(
    null
  );
  const [canRetryLogin, setCanRetryLogin] = useState(false);
  const [error, setError] = useState("");

  const client = new QuantumAuthClient(AUTH_SERVICE_URL);
  const isLoading = activeAction !== null;

  const resetAuthDetails = () => {
    setChallenge("");
    setSignature("");
    setToken("");
    setRiskScore(null);
  };

  const formatRegistrationError = (err: unknown) => {
    if (err instanceof RegistrationError) {
      if (err.code === "NETWORK_ERROR") {
        return `Registration failed: Could not reach ${AUTH_SERVICE_URL}. Make sure the FastAPI service is running and CORS is enabled.`;
      }

      return `Registration failed: ${err.message}`;
    }

    return `Registration failed: ${
      err instanceof Error ? err.message : "Unknown error"
    }`;
  };

  const formatAuthenticationError = (err: unknown) => {
    if (err instanceof AuthenticationError) {
      if (err.code === "NETWORK_ERROR") {
        return `Login failed: Could not reach ${AUTH_SERVICE_URL}. Make sure the FastAPI service is running and CORS is enabled.`;
      }

      return `Login failed: ${err.message}`;
    }

    return `Login failed: ${err instanceof Error ? err.message : "Unknown error"}`;
  };

  const handleRegister = async () => {
    if (!publicKey.trim()) {
      setError("Please enter a public key");
      return;
    }

    setActiveAction("register");
    setError("");
    setStatus("Registering...");
    setCanRetryLogin(false);
    resetAuthDetails();

    try {
      const result = await client.register(publicKey.trim());
      setUserId(result.userId);
      setStatus("Registered successfully! Login is now enabled.");
    } catch (err) {
      setError(formatRegistrationError(err));
    } finally {
      setActiveAction(null);
    }
  };

  const handleLogin = async () => {
    if (!userId) {
      setError("Please register first to get a userId");
      return;
    }

    setActiveAction("login");
    setError("");
    setStatus("Authenticating...");
    setCanRetryLogin(false);
    setToken("");
    setRiskScore(null);

    try {
      const challengeRes = await client.getChallenge(userId);
      setChallenge(challengeRes.challenge);
      const generatedSignature = createSignature(challengeRes.challenge);
      setSignature(generatedSignature);
      setStatus("Authenticating...");

      const verifyRes = await client.verify(userId, challengeRes.challenge);
      setToken(verifyRes.token);
      setRiskScore(verifyRes.riskScore);
      setStatus("Authentication successful!");
    } catch (err) {
      if (err instanceof AuthenticationError && err.code === "403") {
        setCanRetryLogin(true);
        setStatus("Authentication blocked by AI risk scoring.");
        setError(`Login blocked: ${err.message}. Retry login.`);
      } else {
        setError(formatAuthenticationError(err));
      }
    } finally {
      setActiveAction(null);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-900 to-black text-white p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <header className="mb-12 text-center">
          <h1 className="text-5xl font-bold mb-2 bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">
            QuantumAuth SDK
          </h1>
          <p className="text-gray-400 text-lg">Passwordless authentication with AI risk scoring</p>
        </header>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Left Panel - Controls */}
          <div className="space-y-6">
            <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800 shadow-2xl">
              <h2 className="text-2xl font-bold mb-6 text-blue-300">Authentication</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    Public Key
                  </label>
                  <input
                    type="text"
                    value={publicKey}
                    onChange={(e) => setPublicKey(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
                    placeholder="Enter your public key"
                  />
                </div>

                <div className="flex gap-4">
                  <button
                    onClick={handleRegister}
                    disabled={isLoading}
                    className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-3 px-6 rounded-lg transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {activeAction === "register" ? "Registering..." : "Register"}
                  </button>
                  
                  <button
                    onClick={handleLogin}
                    disabled={isLoading || !userId}
                    className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold py-3 px-6 rounded-lg transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {activeAction === "login"
                      ? "Authenticating..."
                      : canRetryLogin
                        ? "Retry Login"
                        : "Login"}
                  </button>
                </div>
              </div>
            </div>

            {/* Status & Error Display */}
            <div className="space-y-4">
              {status && (
                <div className="bg-blue-900/30 border border-blue-500/30 rounded-xl p-4">
                  <p className="text-blue-300 font-medium">Status: {status}</p>
                </div>
              )}
              
              {error && (
                <div className="bg-red-900/30 border border-red-500/30 rounded-xl p-4">
                  <p className="text-red-300 font-medium">Error: {error}</p>
                </div>
              )}

              {canRetryLogin && (
                <button
                  onClick={handleLogin}
                  disabled={isLoading || !userId}
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold py-3 px-6 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Retry Login
                </button>
              )}
            </div>
          </div>

          {/* Right Panel - Results */}
          <div className="space-y-6">
            <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800">
              <h3 className="text-xl font-bold mb-4 text-blue-300">Session Info</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-gray-400">User ID</label>
                  <div className="font-mono text-sm bg-gray-800 p-3 rounded-lg mt-1 break-all">
                    {userId || "Not registered"}
                  </div>
                </div>

                <div>
                  <label className="text-sm text-gray-400">Challenge</label>
                  <div className="font-mono text-sm bg-gray-800 p-3 rounded-lg mt-1 break-all">
                    {challenge || "No challenge yet"}
                  </div>
                </div>

                <div>
                  <label className="text-sm text-gray-400">Signature</label>
                  <div className="font-mono text-sm bg-gray-800 p-3 rounded-lg mt-1 break-all">
                    {signature || "No signature yet"}
                  </div>
                </div>

                <div>
                  <label className="text-sm text-gray-400">Session Token</label>
                  <div className="font-mono text-sm bg-gray-800 p-3 rounded-lg mt-1 break-all">
                    {token || "No token yet"}
                  </div>
                </div>

                {riskScore !== null && (
                  <div>
                    <label className="text-sm text-gray-400">Risk Score</label>
                    <div className="flex items-center gap-4">
                      <div className="font-mono text-lg font-bold">
                        {riskScore.toFixed(2)}
                      </div>
                      <div className="flex-1">
                        <div className="w-full bg-gray-700 rounded-full h-2">
                          <div 
                            className="h-2 rounded-full bg-gradient-to-r from-red-500 via-yellow-500 to-green-500"
                            style={{ width: `${riskScore * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-6 border border-gray-800">
              <h3 className="text-xl font-bold mb-4 text-blue-300">How it works</h3>
              <ul className="space-y-3 text-gray-300">
                <li className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full" />
                  <span>Register with a public key</span>
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full" />
                  <span>Receive a challenge from the server</span>
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-purple-500 rounded-full" />
                  <span>Sign the challenge with your private key</span>
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-pink-500 rounded-full" />
                  <span>AI risk scoring evaluates the login attempt</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-12 pt-8 border-t border-gray-800 text-center text-gray-500 text-sm">
          <p>QuantumAuth SDK • Passwordless Authentication • AI Risk Scoring</p>
        </footer>
      </div>
    </main>
  );
}

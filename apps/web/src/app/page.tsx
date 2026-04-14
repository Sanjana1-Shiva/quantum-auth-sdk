"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import QuantumAuthClient, {
  AuthenticationError,
  RegistrationError,
} from "@quantum-auth/sdk";
import { AttackSimulator } from "@/components/security/attack-simulator";
import { DeveloperIntegration } from "@/components/security/developer-integration";
import { RiskAnalysis } from "@/components/security/risk-analysis";
import { SecurityStatus } from "@/components/security/security-status";
import {
  AuthSessionSnapshot,
  RegisteredKeySnapshot,
  UserMemoryProfile,
  buildAuthSessionSnapshot,
  buildConfidenceMessage,
  buildNextUserMemoryProfile,
  buildRiskSignals,
  buildSessionNarrative,
  clearAuthSession,
  findRegisteredKey,
  findUserMemoryProfile,
  getRiskDecision,
  loadAuthSession,
  loadRegisteredKeys,
  loadUserMemoryProfiles,
  saveAuthSession,
  saveRegisteredKey,
  saveUserMemoryProfile,
  updateAuthSessionRisk,
} from "@/lib/security";

const PUBLIC_KEY_EXAMPLE = "qa-key-alice-2026-01";
const AUTH_SERVICE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ||
  "http://127.0.0.1:8000";

const client = new QuantumAuthClient(AUTH_SERVICE_URL);

const createSignature = (value: string) => value.split("").reverse().join("");
const sectionLabelClass = "text-xs uppercase tracking-[0.3em] text-gray-500 mb-3";

const formatTimestamp = (value: string) =>
  value ? new Date(value).toLocaleString() : "No activity yet";

const formatDelta = (value: number, precision = 2) =>
  `${value > 0 ? "+" : ""}${value.toFixed(precision)}`;

const buildMergedKnownKeys = (
  session: AuthSessionSnapshot | null,
  storedKeys: RegisteredKeySnapshot[]
) => {
  if (
    session?.publicKey &&
    session.userId &&
    !findRegisteredKey(storedKeys, session.publicKey)
  ) {
    return [
      {
        publicKey: session.publicKey,
        userId: session.userId,
        lastSeenAt: session.lastAuthenticatedAt,
      },
      ...storedKeys,
    ];
  }

  return storedKeys;
};

const buildMergedProfiles = (
  session: AuthSessionSnapshot | null,
  storedProfiles: UserMemoryProfile[]
) => {
  if (
    session?.publicKey &&
    !findUserMemoryProfile(storedProfiles, session.publicKey)
  ) {
    return [
      {
        userId: session.userId,
        publicKey: session.publicKey,
        loginCount: session.loginCount,
        firstSeenAt: session.firstSeenAt,
        lastLoginAt: session.lastLoginAt,
        knownDevice: session.knownDevice,
      },
      ...storedProfiles,
    ];
  }

  return storedProfiles;
};

const buildLoginSuccessMessage = (session: AuthSessionSnapshot) => {
  const narrative = buildSessionNarrative(session);
  const highlights = [
    `User Trust Score: ${session.trustScore} / 100`,
    `Adaptive Risk: ${session.riskScore.toFixed(2)}`,
    `${session.loginCount} verified login${session.loginCount === 1 ? "" : "s"}`,
    session.newDevice
      ? "This device hasn’t been seen before"
      : "Login matches previous device pattern",
  ];

  if (session.loginCount > 1) {
    highlights.push(buildConfidenceMessage(session.loginCount));
  }

  if (session.longGap) {
    highlights.push("long gap observed");
  }

  if (Math.abs(session.riskDelta) >= 0.01) {
    highlights.push(`risk shift ${formatDelta(session.riskDelta)}`);
  }

  return `Authentication successful. ${narrative.title}. ${highlights.join(
    " | "
  )}.`;
};

const buildRestoredSessionMessage = (session: AuthSessionSnapshot) => {
  const narrative = buildSessionNarrative(session);
  return `Session restored. ${narrative.title}. User Trust Score: ${session.trustScore} / 100. Adaptive Risk: ${session.riskScore.toFixed(
    2
  )}.`;
};

export default function Home() {
  const [isHydrated, setIsHydrated] = useState(false);
  const [knownKeys, setKnownKeys] = useState<RegisteredKeySnapshot[]>([]);
  const [userProfiles, setUserProfiles] = useState<UserMemoryProfile[]>([]);
  const [session, setSession] = useState<AuthSessionSnapshot | null>(null);
  const [publicKey, setPublicKey] = useState(PUBLIC_KEY_EXAMPLE);
  const [userId, setUserId] = useState("");
  const [challenge, setChallenge] = useState("");
  const [signature, setSignature] = useState("");
  const [status, setStatus] = useState("");
  const [activeAction, setActiveAction] = useState<"register" | "login" | null>(
    null
  );
  const [canRetryLogin, setCanRetryLogin] = useState(false);
  const [error, setError] = useState("");

  const applySession = (snapshot: AuthSessionSnapshot | null) => {
    setSession(snapshot);

    if (!snapshot) {
      setChallenge("");
      setSignature("");
      return;
    }

    setPublicKey(snapshot.publicKey);
    setUserId(snapshot.userId);
    setChallenge(snapshot.challenge);
    setSignature(snapshot.signature);
  };

  const persistSession = (snapshot: AuthSessionSnapshot) => {
    saveAuthSession(snapshot);
    applySession(snapshot);
  };

  useEffect(() => {
    const storedSession = loadAuthSession();
    const mergedKnownKeys = buildMergedKnownKeys(
      storedSession,
      loadRegisteredKeys()
    );
    const mergedProfiles = buildMergedProfiles(
      storedSession,
      loadUserMemoryProfiles()
    );

    setKnownKeys(mergedKnownKeys);
    setUserProfiles(mergedProfiles);

    if (storedSession?.token) {
      applySession(storedSession);
      setStatus(buildRestoredSessionMessage(storedSession));
    } else {
      const rememberedProfile = findUserMemoryProfile(
        mergedProfiles,
        PUBLIC_KEY_EXAMPLE
      );
      const rememberedKey = findRegisteredKey(mergedKnownKeys, PUBLIC_KEY_EXAMPLE);

      if (rememberedProfile) {
        setUserId(rememberedProfile.userId);
        setStatus(
          `Known key detected. ${rememberedProfile.loginCount} prior login${
            rememberedProfile.loginCount === 1 ? "" : "s"
          } on this device.`
        );
      } else if (rememberedKey) {
        setUserId(rememberedKey.userId);
        setStatus("Known registered key detected. Login is ready.");
      }
    }

    setIsHydrated(true);
  }, []);

  const isLoading = activeAction !== null;
  const knownKeyRecord = findRegisteredKey(knownKeys, publicKey);
  const knownProfile = findUserMemoryProfile(userProfiles, publicKey);
  const resolvedUserId =
    userId || knownProfile?.userId || knownKeyRecord?.userId || "";
  const displayedRiskScore = session?.riskScore ?? null;
  const trustScore = session?.trustScore ?? null;
  const decision =
    displayedRiskScore !== null ? getRiskDecision(displayedRiskScore) : null;
  const riskSignals = session
    ? buildRiskSignals({
        loginCount: session.loginCount,
        newDevice: session.newDevice,
        longGap: session.longGap,
        attackMode: session.attackMode,
      })
    : [];
  const sessionNarrative = session ? buildSessionNarrative(session) : null;

  const resetAuthDetails = () => {
    clearAuthSession();
    applySession(null);
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

  const handlePublicKeyChange = (value: string) => {
    setPublicKey(value);
    setError("");
    setCanRetryLogin(false);

    const matchedProfile = findUserMemoryProfile(userProfiles, value);
    const matchedKey = findRegisteredKey(knownKeys, value);

    if (matchedProfile) {
      setUserId(matchedProfile.userId);

      if (!session?.token) {
        setStatus(
          `Known key detected. ${matchedProfile.loginCount} prior login${
            matchedProfile.loginCount === 1 ? "" : "s"
          } on this device. Last active ${formatTimestamp(
            matchedProfile.lastLoginAt
          )}.`
        );
      }

      return;
    }

    if (matchedKey) {
      setUserId(matchedKey.userId);

      if (!session?.token) {
        setStatus("Known registered key detected. Login is ready.");
      }

      return;
    }

    setUserId("");

    if (!value.trim() && !session?.token) {
      setStatus("");
      return;
    }

    if (!session?.token) {
      setStatus("");
      return;
    }

    setStatus(
      "Active session preserved. Register or choose a known key to authenticate again."
    );
  };

  const handleRegister = async () => {
    const trimmedKey = publicKey.trim();

    if (!trimmedKey) {
      setError("Please enter a public key");
      return;
    }

    setActiveAction("register");
    setError("");
    setStatus("Registering public key...");
    setCanRetryLogin(false);

    try {
      const result = await client.register(trimmedKey);
      const nextKnownKeys = saveRegisteredKey({
        userId: result.userId,
        publicKey: trimmedKey,
        existingKeys: knownKeys,
      });

      resetAuthDetails();
      setKnownKeys(nextKnownKeys);
      setPublicKey(trimmedKey);
      setUserId(result.userId);
      setStatus("Registration complete. This key can now request a challenge.");
    } catch (err) {
      const existingKey = findRegisteredKey(knownKeys, trimmedKey);

      if (
        err instanceof RegistrationError &&
        err.code === "409" &&
        existingKey
      ) {
        setUserId(existingKey.userId);
        setError("");
        setStatus("This key is already known on this device. Login is ready.");
      } else {
        setError(formatRegistrationError(err));
      }
    } finally {
      setActiveAction(null);
    }
  };

  const handleLogin = async () => {
    const trimmedKey = publicKey.trim();

    if (!trimmedKey) {
      setError("Please enter a public key");
      return;
    }

    if (!resolvedUserId) {
      setError(
        "Register this key first or reuse a key already known on this device."
      );
      return;
    }

    setActiveAction("login");
    setError("");
    setStatus("Authenticating...");
    setCanRetryLogin(false);
    setChallenge("");
    setSignature("");

    try {
      const challengeRes = await client.getChallenge(resolvedUserId);
      setUserId(resolvedUserId);
      setChallenge(challengeRes.challenge);

      const generatedSignature = createSignature(challengeRes.challenge);
      setSignature(generatedSignature);
      setStatus("Challenge verified. Finalizing session intelligence...");

      const verifyRes = await client.verify(
        resolvedUserId,
        challengeRes.challenge
      );
      const authenticatedAt = new Date().toISOString();
      const existingProfile = findUserMemoryProfile(userProfiles, trimmedKey);
      const memoryResult = buildNextUserMemoryProfile({
        userId: resolvedUserId,
        publicKey: trimmedKey,
        authenticatedAt,
        existingProfile,
      });
      const nextProfiles = saveUserMemoryProfile({
        profile: memoryResult.profile,
        existingProfiles: userProfiles,
      });
      const nextKnownKeys = saveRegisteredKey({
        userId: resolvedUserId,
        publicKey: trimmedKey,
        existingKeys: knownKeys,
      });
      const nextSession = buildAuthSessionSnapshot({
        userId: resolvedUserId,
        token: verifyRes.token,
        publicKey: trimmedKey,
        apiRiskScore: verifyRes.riskScore,
        profile: memoryResult.profile,
        newDevice: memoryResult.newDevice,
        longGap: memoryResult.longGap,
        authenticatedAt,
        challenge: challengeRes.challenge,
        signature: generatedSignature,
        previousSnapshot: session,
      });

      setKnownKeys(nextKnownKeys);
      setUserProfiles(nextProfiles);
      persistSession(nextSession);
      setStatus(buildLoginSuccessMessage(nextSession));
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

  const handleSimulateAttack = () => {
    if (!session) {
      return;
    }

    const nextSession = updateAuthSessionRisk(session, true);
    persistSession(nextSession);
    setError("");
    setStatus(
      `Attack mode active. Dynamic risk recalculated to ${nextSession.riskScore.toFixed(
        2
      )} after adding device fingerprint mismatch and location anomaly signals.`
    );
  };

  const handleResetSimulation = () => {
    if (!session) {
      return;
    }

    const nextSession = updateAuthSessionRisk(session, false);
    persistSession(nextSession);
    setStatus(buildLoginSuccessMessage(nextSession));
  };

  if (!isHydrated) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),_transparent_28%),linear-gradient(135deg,_#07111f,_#020617_58%,_#000000)] text-white flex items-center justify-center p-8">
        <div className="rounded-3xl border border-gray-800 bg-gray-900/90 p-8 text-center shadow-2xl">
          <p className="text-sm uppercase tracking-[0.24em] text-blue-300">
            QuantumAuth SDK
          </p>
          <h1 className="mt-3 text-3xl font-bold">Restoring browser memory...</h1>
          <p className="mt-3 text-gray-400">
            Loading saved sessions, known keys, and device trust history.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),_transparent_28%),linear-gradient(135deg,_#07111f,_#020617_58%,_#000000)] text-white p-6 md:p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-10 md:mb-14 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-4 py-2 text-xs uppercase tracking-[0.28em] text-blue-200">
            AI-powered Fraud-Resistant Passwordless Authentication
          </div>
          <h1 className="mt-6 text-5xl md:text-6xl font-bold bg-gradient-to-r from-blue-300 via-cyan-200 to-emerald-300 bg-clip-text text-transparent">
            QuantumAuth SDK
          </h1>
          <p className="mt-4 max-w-3xl mx-auto text-base md:text-lg text-gray-300 leading-8">
            {sessionNarrative?.detail ||
              "Passwordless authentication powered by challenge-response security, adaptive local memory, and fraud-aware AI session intelligence."}
          </p>
          <div className="mt-6 max-w-4xl mx-auto rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-5 py-4 text-sm text-cyan-50 leading-7 shadow-lg shadow-cyan-950/20">
            <p>
              This system continuously learns user behavior to improve security
              and reduce friction.
            </p>
            <p className="mt-2">
              Confidence improves as the system observes consistent user
              behavior over time.
            </p>
          </div>

          {session ? (
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <span
                className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] ${
                  decision?.tone === "safe"
                    ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
                    : decision?.tone === "warning"
                      ? "border-amber-500/30 bg-amber-500/15 text-amber-200"
                      : "border-red-500/30 bg-red-500/15 text-red-300"
                }`}
              >
                {decision?.label}
              </span>
              <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-blue-200">
                User Trust Score: {session.trustScore} / 100
              </span>
              <span className="rounded-full border border-gray-700 bg-gray-900/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-gray-300">
                Login #{session.loginCount}
              </span>
              {Math.abs(session.riskDelta) >= 0.01 ? (
                <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-100">
                  Risk {session.riskDelta < 0 ? "Down" : "Up"}{" "}
                  {Math.abs(session.riskDelta).toFixed(2)}
                </span>
              ) : null}
            </div>
          ) : null}
        </header>

        <div className="grid xl:grid-cols-[1.05fr,0.95fr] gap-8 items-start">
          <div className="space-y-6">
            <section>
              <p className={sectionLabelClass}>Authentication</p>
              <div className="bg-gray-900/90 rounded-3xl p-6 md:p-7 border border-gray-800 shadow-2xl">
                <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                  <div>
                    <h2 className="text-2xl font-bold text-blue-300">
                      Authentication
                    </h2>
                    <p className="text-sm text-gray-400 mt-1">
                      Register a public key, request a challenge, and log in
                      with the existing passwordless flow.
                    </p>
                  </div>
                  <span className="text-xs uppercase tracking-[0.24em] text-gray-500">
                    Live auth
                  </span>
                </div>

                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      Public Key
                    </label>
                    <input
                      type="text"
                      value={publicKey}
                      onChange={(event) => handlePublicKeyChange(event.target.value)}
                      className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
                      placeholder={`Example: ${PUBLIC_KEY_EXAMPLE}`}
                    />
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                      <p className="text-gray-500">
                        Example format:{" "}
                        <span className="text-gray-300">{PUBLIC_KEY_EXAMPLE}</span>
                      </p>
                      {knownProfile ? (
                        <p className="text-emerald-300">
                          Returning user detected with {knownProfile.loginCount} prior login
                          {knownProfile.loginCount === 1 ? "" : "s"}.
                        </p>
                      ) : knownKeyRecord ? (
                        <p className="text-emerald-300">
                          Known registered key detected on this device.
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={handleRegister}
                      disabled={isLoading}
                      className="w-full bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600 text-white font-semibold py-3 px-6 rounded-xl transition-all hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {activeAction === "register" ? "Registering..." : "Register"}
                    </button>

                    <button
                      type="button"
                      onClick={handleLogin}
                      disabled={isLoading || !resolvedUserId}
                      className="w-full bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-700 hover:to-teal-600 text-white font-semibold py-3 px-6 rounded-xl transition-all hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
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
            </section>

            <div className="space-y-4">
              {status ? (
                <div className="bg-blue-900/30 border border-blue-500/30 rounded-2xl p-4">
                  <p className="text-blue-200 font-medium leading-7">
                    Status: {status}
                  </p>
                </div>
              ) : null}

              {error ? (
                <div className="bg-red-900/30 border border-red-500/30 rounded-2xl p-4">
                  <p className="text-red-200 font-medium leading-7">
                    Error: {error}
                  </p>
                </div>
              ) : null}

              {canRetryLogin ? (
                <button
                  type="button"
                  onClick={handleLogin}
                  disabled={isLoading || !resolvedUserId}
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold py-3 px-6 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Retry Login
                </button>
              ) : null}

              {session ? (
                <div className="rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-400/10 to-blue-500/10 p-5 transition-all duration-700">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="text-sm uppercase tracking-[0.24em] text-cyan-200">
                        Adaptive learning update
                      </p>
                      <p className="text-sm text-gray-200 mt-2 leading-7">
                        {session.loginCount > 1
                          ? buildConfidenceMessage(session.loginCount)
                          : "The first successful session established a local baseline for this public key."}
                      </p>
                    </div>
                    <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-gray-100">
                      Session #{session.loginCount}
                    </span>
                  </div>

                  <div className="grid sm:grid-cols-3 gap-3 mt-4">
                    <LearningMetric
                      label="Risk Delta"
                      value={formatDelta(session.riskDelta)}
                      tone={session.riskDelta <= 0 ? "safe" : "warning"}
                    />
                    <LearningMetric
                      label="Trust Delta"
                      value={`${session.trustDelta > 0 ? "+" : ""}${session.trustDelta}`}
                      tone={session.trustDelta >= 0 ? "safe" : "warning"}
                    />
                    <LearningMetric
                      label="Consistency Credit"
                      value={`-${session.confidenceBoost.toFixed(2)}`}
                      tone="safe"
                    />
                  </div>
                </div>
              ) : null}
            </div>

            <AttackSimulator
              canSimulate={Boolean(session)}
              isActive={session?.attackMode ?? false}
              onSimulate={handleSimulateAttack}
              onReset={handleResetSimulation}
            />

            {session?.token ? (
              <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-sm uppercase tracking-[0.24em] text-cyan-200">
                      Protected route unlocked
                    </p>
                    <p className="text-sm text-gray-300 mt-2 leading-7">
                      Your current session token and learned key profile can now
                      open the protected dashboard without changing the existing
                      authentication contract.
                    </p>
                  </div>
                  <Link
                    href="/dashboard"
                    className="inline-flex items-center justify-center rounded-xl bg-white text-gray-950 px-5 py-3 font-semibold hover:bg-gray-100 transition-colors"
                  >
                    Open Dashboard
                  </Link>
                </div>
              </div>
            ) : null}
          </div>

          <div className="space-y-6">
            <section>
              <p className={sectionLabelClass}>Session Insights</p>
              <div className="bg-gray-900/90 rounded-3xl p-6 md:p-7 border border-gray-800 shadow-2xl">
                <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                  <div>
                    <h2 className="text-2xl font-bold text-blue-300">
                      Session Insights
                    </h2>
                    <p className="text-sm text-gray-400 mt-1">
                      Every successful login evolves the trust model for this key.
                    </p>
                  </div>
                  {decision ? (
                    <span
                      className={`px-3 py-2 rounded-full text-xs font-semibold uppercase tracking-[0.2em] ${
                        decision.tone === "safe"
                          ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                          : decision.tone === "warning"
                            ? "bg-amber-500/15 text-amber-200 border border-amber-500/30"
                            : "bg-red-500/15 text-red-300 border border-red-500/30"
                      }`}
                    >
                      {decision.label}
                    </span>
                  ) : (
                    <span className="text-xs uppercase tracking-[0.24em] text-gray-500">
                      Awaiting login
                    </span>
                  )}
                </div>

                <div className="grid gap-4">
                  <SessionDetail
                    label="User ID"
                    value={session?.userId || resolvedUserId || "Not registered"}
                  />
                  <SessionDetail
                    label="Challenge"
                    value={challenge || "No challenge yet"}
                  />
                  <SessionDetail
                    label="Signature"
                    value={signature || "No signature yet"}
                  />
                  <SessionDetail
                    label="Session Token"
                    value={session?.token || "No token yet"}
                  />
                  <SessionDetail
                    label="Device Trust"
                    value={
                      session
                        ? session.newDevice
                          ? "This device hasn’t been seen before"
                          : "Login matches previous device pattern"
                        : "No trusted device yet"
                    }
                  />
                  <SessionDetail
                    label="Successful Logins"
                    value={
                      session
                        ? String(session.loginCount)
                        : "No login history yet"
                    }
                  />
                  <SessionDetail
                    label="First Seen"
                    value={formatTimestamp(session?.firstSeenAt || "")}
                  />
                  <SessionDetail
                    label="Last Login"
                    value={formatTimestamp(session?.lastLoginAt || "")}
                  />
                  <SessionDetail
                    label="Current Session"
                    value={formatTimestamp(session?.lastAuthenticatedAt || "")}
                  />
                  <SessionDetail
                    label="Risk Shift"
                    value={
                      session ? formatDelta(session.riskDelta) : "No prior session yet"
                    }
                  />
                  <SessionDetail
                    label="Consistency Credit"
                    value={
                      session
                        ? `-${session.confidenceBoost.toFixed(2)}`
                        : "No confidence credit yet"
                    }
                  />

                  <div className="rounded-xl bg-gray-800/80 p-4 border border-gray-700">
                    <div className="flex items-center justify-between gap-4">
                      <label className="text-sm text-gray-400">Adaptive Risk Score</label>
                      <span className="text-sm text-gray-400">
                        {displayedRiskScore !== null
                          ? session?.attackMode
                            ? "Attack mode included"
                            : "Computed from local memory"
                          : "No score yet"}
                      </span>
                    </div>

                    {displayedRiskScore !== null ? (
                      <div className="mt-3">
                        <div className="flex items-center gap-4">
                          <div className="font-mono text-2xl font-bold text-white">
                            {displayedRiskScore.toFixed(2)}
                          </div>
                          <div className="flex-1">
                            <div className="w-full bg-gray-700 rounded-full h-2">
                              <div
                                className="h-2 rounded-full bg-gradient-to-r from-emerald-500 via-amber-400 to-red-500 transition-[width] duration-700 ease-out"
                                style={{
                                  width: `${Math.min(displayedRiskScore * 100, 100)}%`,
                                }}
                              />
                            </div>
                          </div>
                        </div>
                        {decision ? (
                          <p className="mt-3 text-sm text-gray-300 leading-7">
                            Decision preview:{" "}
                            <span className="font-semibold text-white">
                              {decision.label}
                            </span>
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-gray-400">No score yet</p>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section className="space-y-6">
              <p className={sectionLabelClass}>Risk Intelligence</p>
              <SecurityStatus
                riskScore={displayedRiskScore}
                trustScore={trustScore}
                apiRiskScore={session?.apiRiskScore ?? null}
                confidenceBoost={session?.confidenceBoost ?? null}
                riskDelta={session?.riskDelta ?? null}
                loginCount={session?.loginCount ?? 0}
                signals={riskSignals}
                attackMode={session?.attackMode ?? false}
              />
              <RiskAnalysis
                signals={riskSignals}
                isReady={Boolean(displayedRiskScore !== null && session?.token)}
              />
            </section>

            <DeveloperIntegration
              publicKey={session?.publicKey || publicKey}
              signature={signature || session?.signature || ""}
              riskScore={displayedRiskScore}
              sessionToken={session?.token}
            />

            <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-6 border border-gray-800">
              <h3 className="text-xl font-bold mb-4 text-blue-300">
                How it works
              </h3>
              <ul className="space-y-3 text-gray-300">
                <li className="flex items-start gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 mt-2" />
                  <span>Register with a public key instead of a password.</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-500 mt-2" />
                  <span>Receive a challenge from the authentication service.</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 mt-2" />
                  <span>Sign the challenge and verify ownership of the key.</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-400 mt-2" />
                  <span>
                    Learn from each successful login to evolve trust, device familiarity,
                    and fraud posture over time.
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <footer className="mt-12 pt-8 border-t border-gray-800 text-center text-gray-500 text-sm">
          <p>
            QuantumAuth SDK | Passwordless Authentication | Adaptive Fraud Intelligence
          </p>
        </footer>
      </div>
    </main>
  );
}

function SessionDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-800/80 p-4 border border-gray-700">
      <label className="text-sm text-gray-400">{label}</label>
      <div className="font-mono text-sm text-white mt-2 break-all">{value}</div>
    </div>
  );
}

function LearningMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "safe" | "warning";
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        tone === "safe"
          ? "border-emerald-400/20 bg-emerald-400/10"
          : "border-amber-400/20 bg-amber-400/10"
      }`}
    >
      <p className="text-xs uppercase tracking-[0.22em] text-gray-300">{label}</p>
      <p className="mt-2 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

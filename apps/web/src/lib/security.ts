export type RiskTone = "safe" | "warning" | "danger";

export interface RiskDecision {
  label: string;
  summary: string;
  tone: RiskTone;
}

export interface RiskSignal {
  title: string;
  detail: string;
  tone: RiskTone;
  iconLabel: string;
}

export interface SessionNarrative {
  title: string;
  detail: string;
}

export interface RegisteredKeySnapshot {
  userId: string;
  publicKey: string;
  lastSeenAt: string;
}

export interface UserMemoryProfile {
  userId: string;
  publicKey: string;
  loginCount: number;
  firstSeenAt: string;
  lastLoginAt: string;
  knownDevice: boolean;
}

export interface AuthSessionSnapshot {
  userId: string;
  token: string;
  publicKey: string;
  riskScore: number;
  apiRiskScore: number;
  trustScore: number;
  confidenceBoost: number;
  previousRiskScore: number | null;
  previousTrustScore: number | null;
  riskDelta: number;
  trustDelta: number;
  loginCount: number;
  firstSeenAt: string;
  lastLoginAt: string;
  lastAuthenticatedAt: string;
  knownDevice: boolean;
  newDevice: boolean;
  longGap: boolean;
  attackMode: boolean;
  challenge: string;
  signature: string;
}

export const AUTH_SESSION_STORAGE_KEY = "quantum-auth-session";
export const REGISTERED_KEYS_STORAGE_KEY = "quantum-auth-registered-keys";
export const USER_MEMORY_STORAGE_KEY = "quantum-auth-user-memory";

const LONG_GAP_THRESHOLD_MS = 1000 * 60 * 60 * 12;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const roundRisk = (value: number) => Math.round(value * 100) / 100;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readString = (
  value: Record<string, unknown>,
  key: string,
  fallback = ""
) => (typeof value[key] === "string" ? value[key] : fallback);

const readNumber = (
  value: Record<string, unknown>,
  key: string,
  fallback = 0
) =>
  typeof value[key] === "number" && Number.isFinite(value[key])
    ? value[key]
    : fallback;

const readBoolean = (
  value: Record<string, unknown>,
  key: string,
  fallback = false
) => (typeof value[key] === "boolean" ? value[key] : fallback);

const readNullableNumber = (value: Record<string, unknown>, key: string) =>
  typeof value[key] === "number" && Number.isFinite(value[key])
    ? value[key]
    : null;

const normalizePublicKey = (publicKey: string) => publicKey.trim();

const normalizeRiskScore = (value: number) => roundRisk(clamp(value, 0, 1));

const buildSeed = (...parts: Array<string | number | boolean>) => parts.join(":");

const hashSeed = (seed: string) => {
  let hash = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
};

const seededUnit = (seed: string) => hashSeed(seed) / 4294967295;

const seededRange = (seed: string, minimum: number, maximum: number) =>
  minimum + seededUnit(seed) * (maximum - minimum);

export const computeTrustScore = (
  loginCount: number,
  publicKey = ""
) => {
  const normalizedPublicKey = normalizePublicKey(publicKey) || "anonymous-key";
  let trustScore = 0;

  for (let step = 1; step <= Math.max(0, loginCount); step += 1) {
    const increment = seededRange(
      buildSeed(normalizedPublicKey, "trust", step),
      8,
      18
    );
    const saturation = clamp(1 - trustScore / 120, 0.35, 1);
    const maturity = clamp(1 - (step - 1) * 0.06, 0.55, 1);

    trustScore += increment * saturation * maturity;
  }

  return Math.round(clamp(trustScore, 0, 100));
};

export const computeConfidenceBoost = (loginCount: number) =>
  roundRisk(Math.min(0.12, Math.max(0, loginCount - 1) * 0.03));

export const computeDynamicRisk = ({
  loginCount,
  newDevice,
  longGap,
  attackMode,
  publicKey = "",
  referenceTimestamp = "",
}: {
  loginCount: number;
  newDevice: boolean;
  longGap: boolean;
  attackMode?: boolean;
  publicKey?: string;
  referenceTimestamp?: string;
}) => {
  let riskScore = 0.2;
  const confidenceBoost = computeConfidenceBoost(loginCount);
  const variability = seededRange(
    buildSeed(
      normalizePublicKey(publicKey) || "anonymous-key",
      referenceTimestamp || "session",
      loginCount,
      newDevice,
      longGap,
      Boolean(attackMode)
    ),
    -0.05,
    0.05
  );

  if (loginCount === 1) {
    riskScore += 0.3;
  }

  if (newDevice) {
    riskScore += 0.2;
  }

  if (longGap) {
    riskScore += 0.1;
  }

  if (attackMode) {
    riskScore += 0.2;
  }

  riskScore -= confidenceBoost;
  riskScore += variability;

  return normalizeRiskScore(riskScore);
};

export const getRiskDecision = (riskScore: number): RiskDecision => {
  if (riskScore < 0.35) {
    return {
      label: "Safe Login",
      summary:
        "Known behavior and stable device signals keep this session in a low-risk posture.",
      tone: "safe",
    };
  }

  if (riskScore < 0.85) {
    return {
      label: "Login flagged as suspicious",
      summary:
        "Authentication was allowed, but the behavior looks unusual enough to keep this session under closer review.",
      tone: "warning",
    };
  }

  return {
    label: "Login allowed with elevated risk",
    summary:
      "Authentication succeeded, but multiple anomaly signals are active and the session should stay under active review.",
    tone: "danger",
  };
};

export const buildConfidenceMessage = (loginCount: number) =>
  loginCount > 1
    ? "System confidence increased based on consistent behavior."
    : "Trust is still forming for this public key.";

const formatSignalList = (items: string[]) => {
  if (items.length === 0) {
    return "";
  }

  if (items.length === 1) {
    return items[0];
  }

  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }

  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
};

const buildExplanationIntro = (trustScore: number) => {
  if (trustScore >= 80) {
    return "System confidence increased based on consistent behavior. High trust history now stabilizes this session.";
  }

  if (trustScore >= 40) {
    return "System confidence increased based on consistent behavior. The system is reducing friction for this familiar key.";
  }

  return "Trust is still forming for this public key.";
};

export const buildSessionNarrative = ({
  loginCount,
  trustScore,
  newDevice,
  longGap,
  attackMode,
}: Pick<
  AuthSessionSnapshot,
  "loginCount" | "trustScore" | "newDevice" | "longGap" | "attackMode"
>): SessionNarrative => {
  if (attackMode) {
    return {
      title: "Behavioral anomaly drill is active",
      detail:
        "Attack mode is injecting device fingerprint mismatch and location anomaly signals into the local risk engine without changing the backend verification contract.",
    };
  }

  if (loginCount === 1) {
    return {
      title: "This browser is learning a brand-new identity",
      detail:
        "The first successful login starts the trust history for this public key and records this browser as a known device for future sessions.",
    };
  }

  if (newDevice) {
    return {
      title: "Known identity, unfamiliar browser context",
      detail:
        "The key has history, but this device has not been seen before for the current public key.",
    };
  }

  if (longGap) {
    return {
      title: "Returning identity after a quiet period",
      detail:
        "The key is recognized, but the long gap since the previous login slightly raises uncertainty.",
    };
  }

  if (trustScore >= 80) {
    return {
      title: "Trusted routine login recognized",
      detail:
        "Repeated successful logins on the same device have pushed this key into a high-confidence posture with less friction and stronger local certainty.",
    };
  }

  return {
    title: "Trust is improving with each successful session",
    detail:
      "Browser memory is building a stable pattern for this key while preserving the live backend score as a supporting signal and reducing friction for consistent behavior.",
  };
};

export const buildRiskSignals = ({
  loginCount,
  newDevice,
  longGap,
  attackMode,
}: {
  loginCount: number;
  newDevice: boolean;
  longGap: boolean;
  attackMode?: boolean;
}): RiskSignal[] => {
  const signals: RiskSignal[] = [];

  if (loginCount === 1) {
    signals.push({
      title: "First-time key usage",
      detail:
        "No prior successful login history exists for this public key on this browser yet.",
      tone: "warning",
      iconLabel: "NEW",
    });
  } else if (loginCount === 2) {
    signals.push({
      title: "Consistency trend detected",
      detail:
        "A repeat login from the same browser increased confidence and slightly reduced the local risk score.",
      tone: "safe",
      iconLabel: "LEARN",
    });
  } else {
    signals.push({
      title: "Consistency streak established",
      detail: `${loginCount} successful logins from the same browser are lowering friction and reinforcing the learned trust pattern.`,
      tone: "safe",
      iconLabel: "TRST",
    });
  }

  if (newDevice) {
    signals.push({
      title: "Unrecognized device",
      detail:
        "This device has not been seen before for the current public key.",
      tone: "warning",
      iconLabel: "WARN",
    });
  } else {
    signals.push({
      title: "Recognized device",
      detail:
        "This login matches the previous device pattern already associated with this public key.",
      tone: "safe",
      iconLabel: "SAFE",
    });
  }

  if (longGap) {
    signals.push({
      title: "Long gap since last login",
      detail:
        "The time since the previous successful login exceeded the expected usage window.",
      tone: "warning",
      iconLabel: "GAP",
    });
  } else if (loginCount > 1) {
    signals.push({
      title: "Recent activity continuity",
      detail:
        "Recent successful activity matches the learned rhythm for this key and helps keep friction low.",
      tone: "safe",
      iconLabel: "FLOW",
    });
  }

  if (attackMode) {
    signals.push({
      title: "Behavioral anomaly detected",
      detail:
        "Attack mode forced the local engine to reevaluate the session under suspicious behavior conditions.",
      tone: "danger",
      iconLabel: "ALRT",
    });
    signals.push({
      title: "Device fingerprint mismatch",
      detail:
        "The simulated session presents a browser fingerprint drift that does not align with the learned device pattern.",
      tone: "danger",
      iconLabel: "FPRT",
    });
    signals.push({
      title: "Location anomaly",
      detail:
        "The simulated request appears to originate from an unusual geographic context compared with recent activity.",
      tone: "danger",
      iconLabel: "GEO",
    });
  }

  return signals;
};

export const getRiskExplanation = ({
  riskScore,
  signals,
  trustScore,
}: {
  riskScore: number;
  signals: RiskSignal[];
  trustScore: number;
}) => {
  const highlightedSignals = signals
    .filter((signal) => signal.tone !== "safe")
    .map((signal) => signal.title.toLowerCase());
  const stableSignals = signals
    .filter((signal) => signal.tone === "safe")
    .map((signal) => signal.title.toLowerCase());

  const intro = buildExplanationIntro(trustScore);

  if (riskScore < 0.35) {
    if (stableSignals.length > 0) {
      return `${intro} ${formatSignalList(
        stableSignals
      )} keep this session in a low-risk posture.`;
    }

    return `${intro} Login behavior currently matches a familiar pattern with low observable risk.`;
  }

  if (riskScore < 0.85) {
    if (highlightedSignals.length > 0) {
      return `${intro} The local engine elevated this session because it detected ${formatSignalList(
        highlightedSignals
      )}, so the login is flagged as suspicious.`;
    }

    return `${intro} Mild uncertainty is present, so the login is being watched more closely.`;
  }

  return `${intro} Multiple elevated signals are active${
    highlightedSignals.length > 0
      ? `, including ${formatSignalList(highlightedSignals)}`
      : ""
  }, so the login is allowed with elevated risk and should remain under review.`;
};

export const getToneClasses = (tone: RiskTone) => {
  if (tone === "safe") {
    return {
      badge: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
      accent: "bg-emerald-500",
      panel: "bg-emerald-500/10 border border-emerald-500/20",
      text: "text-emerald-300",
    };
  }

  if (tone === "warning") {
    return {
      badge: "bg-amber-500/15 text-amber-200 border border-amber-500/30",
      accent: "bg-amber-400",
      panel: "bg-amber-500/10 border border-amber-500/20",
      text: "text-amber-200",
    };
  }

  return {
    badge: "bg-red-500/15 text-red-300 border border-red-500/30",
    accent: "bg-red-500",
    panel: "bg-red-500/10 border border-red-500/20",
    text: "text-red-300",
  };
};

export const buildAuthSessionSnapshot = ({
  userId,
  token,
  publicKey,
  apiRiskScore,
  profile,
  newDevice,
  longGap,
  authenticatedAt,
  challenge,
  signature,
  previousSnapshot = null,
  attackMode = false,
}: {
  userId: string;
  token: string;
  publicKey: string;
  apiRiskScore: number;
  profile: UserMemoryProfile;
  newDevice: boolean;
  longGap: boolean;
  authenticatedAt: string;
  challenge: string;
  signature: string;
  previousSnapshot?: AuthSessionSnapshot | null;
  attackMode?: boolean;
}): AuthSessionSnapshot => {
  const normalizedPublicKey = normalizePublicKey(publicKey);
  const riskScore = computeDynamicRisk({
    loginCount: profile.loginCount,
    newDevice,
    longGap,
    attackMode,
    publicKey: normalizedPublicKey,
    referenceTimestamp: authenticatedAt,
  });
  const trustScore = computeTrustScore(profile.loginCount, normalizedPublicKey);
  const priorSnapshot =
    previousSnapshot?.publicKey === normalizedPublicKey ? previousSnapshot : null;
  const previousRiskScore = priorSnapshot?.riskScore ?? null;
  const previousTrustScore = priorSnapshot?.trustScore ?? null;

  return {
    userId,
    token,
    publicKey: normalizedPublicKey,
    riskScore,
    apiRiskScore: normalizeRiskScore(apiRiskScore),
    trustScore,
    confidenceBoost: computeConfidenceBoost(profile.loginCount),
    previousRiskScore,
    previousTrustScore,
    riskDelta:
      previousRiskScore === null ? 0 : roundRisk(riskScore - previousRiskScore),
    trustDelta: previousTrustScore === null ? 0 : trustScore - previousTrustScore,
    loginCount: profile.loginCount,
    firstSeenAt: profile.firstSeenAt,
    lastLoginAt: profile.lastLoginAt,
    lastAuthenticatedAt: authenticatedAt,
    knownDevice: profile.knownDevice,
    newDevice,
    longGap,
    attackMode,
    challenge,
    signature,
  };
};

export const updateAuthSessionRisk = (
  snapshot: AuthSessionSnapshot,
  attackMode: boolean
): AuthSessionSnapshot => ({
  ...snapshot,
  attackMode,
  confidenceBoost: computeConfidenceBoost(snapshot.loginCount),
  riskScore: computeDynamicRisk({
    loginCount: snapshot.loginCount,
    newDevice: snapshot.newDevice,
    longGap: snapshot.longGap,
    attackMode,
    publicKey: snapshot.publicKey,
    referenceTimestamp: snapshot.lastAuthenticatedAt,
  }),
  riskDelta:
    snapshot.previousRiskScore === null
      ? 0
      : roundRisk(
          computeDynamicRisk({
            loginCount: snapshot.loginCount,
            newDevice: snapshot.newDevice,
            longGap: snapshot.longGap,
            attackMode,
            publicKey: snapshot.publicKey,
            referenceTimestamp: snapshot.lastAuthenticatedAt,
          }) - snapshot.previousRiskScore
        ),
});

const normalizeAuthSession = (value: unknown): AuthSessionSnapshot | null => {
  if (!isRecord(value)) {
    return null;
  }

  const userId = readString(value, "userId");
  const token = readString(value, "token");
  const publicKey = normalizePublicKey(readString(value, "publicKey"));

  if (!userId || !token || !publicKey) {
    return null;
  }

  const loginCount = Math.max(1, Math.floor(readNumber(value, "loginCount", 1)));
  const firstSeenAt =
    readString(value, "firstSeenAt") ||
    readString(value, "lastAuthenticatedAt") ||
    new Date().toISOString();
  const lastLoginAt =
    readString(value, "lastLoginAt") ||
    readString(value, "lastAuthenticatedAt") ||
    firstSeenAt;
  const lastAuthenticatedAt =
    readString(value, "lastAuthenticatedAt") || lastLoginAt;
  const knownDevice = readBoolean(value, "knownDevice", true);
  const newDevice = readBoolean(value, "newDevice", false);
  const longGap = readBoolean(value, "longGap", false);
  const attackMode = readBoolean(value, "attackMode", false);
  const storedRiskScore = readNumber(value, "riskScore", Number.NaN);
  const riskScore = Number.isFinite(storedRiskScore)
    ? normalizeRiskScore(storedRiskScore)
    : computeDynamicRisk({
        loginCount,
        newDevice,
        longGap,
        attackMode,
        publicKey,
        referenceTimestamp: lastAuthenticatedAt,
      });
  const trustScore = Math.round(
    clamp(
      readNumber(value, "trustScore", computeTrustScore(loginCount, publicKey)),
      0,
      100
    )
  );
  const previousRiskScore = readNullableNumber(value, "previousRiskScore");
  const previousTrustScore = readNullableNumber(value, "previousTrustScore");
  const confidenceBoost = normalizeRiskScore(
    readNumber(value, "confidenceBoost", computeConfidenceBoost(loginCount))
  );

  return {
    userId,
    token,
    publicKey,
    riskScore,
    apiRiskScore: normalizeRiskScore(
      readNumber(value, "apiRiskScore", readNumber(value, "riskScore", 0.2))
    ),
    trustScore,
    confidenceBoost,
    previousRiskScore,
    previousTrustScore,
    riskDelta:
      previousRiskScore === null
        ? roundRisk(readNumber(value, "riskDelta", 0))
        : roundRisk(readNumber(value, "riskDelta", riskScore - previousRiskScore)),
    trustDelta:
      previousTrustScore === null
        ? Math.round(readNumber(value, "trustDelta", 0))
        : Math.round(readNumber(value, "trustDelta", trustScore - previousTrustScore)),
    loginCount,
    firstSeenAt,
    lastLoginAt,
    lastAuthenticatedAt,
    knownDevice,
    newDevice,
    longGap,
    attackMode,
    challenge: readString(value, "challenge"),
    signature: readString(value, "signature"),
  };
};

export const saveAuthSession = (snapshot: AuthSessionSnapshot) => {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedSnapshot = normalizeAuthSession(snapshot);
  if (!normalizedSnapshot) {
    return;
  }

  window.localStorage.setItem(
    AUTH_SESSION_STORAGE_KEY,
    JSON.stringify(normalizedSnapshot)
  );
};

export const loadAuthSession = (): AuthSessionSnapshot | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    const normalizedSession = normalizeAuthSession(parsed);

    if (!normalizedSession) {
      window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
      return null;
    }

    return normalizedSession;
  } catch {
    window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
    return null;
  }
};

export const clearAuthSession = () => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
};

const normalizeRegisteredKeys = (value: unknown): RegisteredKeySnapshot[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isRecord)
    .map((entry) => {
      const userId = readString(entry, "userId");
      const publicKey = normalizePublicKey(readString(entry, "publicKey"));
      const lastSeenAt = readString(entry, "lastSeenAt");

      if (!userId || !publicKey) {
        return null;
      }

      return {
        userId,
        publicKey,
        lastSeenAt: lastSeenAt || new Date().toISOString(),
      };
    })
    .filter((entry): entry is RegisteredKeySnapshot => entry !== null);
};

export const loadRegisteredKeys = (): RegisteredKeySnapshot[] => {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(REGISTERED_KEYS_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    return normalizeRegisteredKeys(JSON.parse(raw) as unknown);
  } catch {
    window.localStorage.removeItem(REGISTERED_KEYS_STORAGE_KEY);
    return [];
  }
};

export const findRegisteredKey = (
  keys: RegisteredKeySnapshot[],
  publicKey: string
) => {
  const normalizedKey = normalizePublicKey(publicKey);
  if (!normalizedKey) {
    return null;
  }

  return keys.find((keyRecord) => keyRecord.publicKey === normalizedKey) ?? null;
};

export const saveRegisteredKey = ({
  userId,
  publicKey,
  existingKeys,
}: {
  userId: string;
  publicKey: string;
  existingKeys?: RegisteredKeySnapshot[];
}) => {
  if (typeof window === "undefined") {
    return existingKeys ?? [];
  }

  const normalizedKey = normalizePublicKey(publicKey);
  if (!normalizedKey) {
    return existingKeys ?? loadRegisteredKeys();
  }

  const knownKeys = existingKeys ?? loadRegisteredKeys();
  const nextKeys = [
    {
      userId,
      publicKey: normalizedKey,
      lastSeenAt: new Date().toISOString(),
    },
    ...knownKeys.filter((keyRecord) => keyRecord.publicKey !== normalizedKey),
  ];

  window.localStorage.setItem(
    REGISTERED_KEYS_STORAGE_KEY,
    JSON.stringify(nextKeys)
  );

  return nextKeys;
};

const normalizeUserMemoryProfiles = (value: unknown): UserMemoryProfile[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isRecord)
    .map((entry) => {
      const userId = readString(entry, "userId");
      const publicKey = normalizePublicKey(readString(entry, "publicKey"));

      if (!userId || !publicKey) {
        return null;
      }

      return {
        userId,
        publicKey,
        loginCount: Math.max(0, Math.floor(readNumber(entry, "loginCount", 0))),
        firstSeenAt: readString(entry, "firstSeenAt"),
        lastLoginAt: readString(entry, "lastLoginAt"),
        knownDevice: readBoolean(entry, "knownDevice", false),
      };
    })
    .filter((entry): entry is UserMemoryProfile => entry !== null);
};

export const loadUserMemoryProfiles = (): UserMemoryProfile[] => {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(USER_MEMORY_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    return normalizeUserMemoryProfiles(JSON.parse(raw) as unknown);
  } catch {
    window.localStorage.removeItem(USER_MEMORY_STORAGE_KEY);
    return [];
  }
};

export const findUserMemoryProfile = (
  profiles: UserMemoryProfile[],
  publicKey: string
) => {
  const normalizedKey = normalizePublicKey(publicKey);
  if (!normalizedKey) {
    return null;
  }

  return profiles.find((profile) => profile.publicKey === normalizedKey) ?? null;
};

export const buildNextUserMemoryProfile = ({
  userId,
  publicKey,
  authenticatedAt,
  existingProfile,
}: {
  userId: string;
  publicKey: string;
  authenticatedAt: string;
  existingProfile?: UserMemoryProfile | null;
}) => {
  const previousLastLoginAt = existingProfile?.lastLoginAt ?? "";
  const newDevice = !(existingProfile?.knownDevice ?? false);
  const longGap = previousLastLoginAt
    ? new Date(authenticatedAt).getTime() -
        new Date(previousLastLoginAt).getTime() >
      LONG_GAP_THRESHOLD_MS
    : false;
  const loginCount = (existingProfile?.loginCount ?? 0) + 1;
  const firstSeenAt = existingProfile?.firstSeenAt || authenticatedAt;

  const profile: UserMemoryProfile = {
    userId,
    publicKey: normalizePublicKey(publicKey),
    loginCount,
    firstSeenAt,
    lastLoginAt: authenticatedAt,
    knownDevice: true,
  };

  return {
    profile,
    newDevice,
    longGap,
    trustScore: computeTrustScore(loginCount, publicKey),
  };
};

export const saveUserMemoryProfile = ({
  profile,
  existingProfiles,
}: {
  profile: UserMemoryProfile;
  existingProfiles?: UserMemoryProfile[];
}) => {
  if (typeof window === "undefined") {
    return existingProfiles ?? [];
  }

  const profiles = existingProfiles ?? loadUserMemoryProfiles();
  const nextProfiles = [
    profile,
    ...profiles.filter(
      (existingProfile) => existingProfile.publicKey !== profile.publicKey
    ),
  ];

  window.localStorage.setItem(
    USER_MEMORY_STORAGE_KEY,
    JSON.stringify(nextProfiles)
  );

  return nextProfiles;
};

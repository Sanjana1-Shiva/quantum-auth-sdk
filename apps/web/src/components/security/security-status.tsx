"use client";

import {
  RiskSignal,
  buildConfidenceMessage,
  getRiskDecision,
  getRiskExplanation,
  getToneClasses,
} from "@/lib/security";

interface SecurityStatusProps {
  riskScore: number | null;
  trustScore?: number | null;
  apiRiskScore?: number | null;
  confidenceBoost?: number | null;
  riskDelta?: number | null;
  loginCount?: number;
  signals: RiskSignal[];
  attackMode?: boolean;
}

export function SecurityStatus({
  riskScore,
  trustScore = null,
  apiRiskScore = null,
  confidenceBoost = null,
  riskDelta = null,
  loginCount = 0,
  signals,
  attackMode = false,
}: SecurityStatusProps) {
  if (riskScore === null) {
    return (
      <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800">
        <div className="flex items-center justify-between gap-4 mb-4">
          <h3 className="text-xl font-bold text-blue-300">Security Status</h3>
          <span className="text-xs uppercase tracking-[0.24em] text-gray-500">
            Awaiting session
          </span>
        </div>
        <p className="text-gray-400 leading-7">
          Complete a login to unlock dynamic risk intelligence driven by browser
          memory, device familiarity, and attack-mode signals.
        </p>
      </div>
    );
  }

  const decision = getRiskDecision(riskScore);
  const styles = getToneClasses(decision.tone);
  const explanation = getRiskExplanation({
    riskScore,
    signals,
    trustScore: trustScore ?? 0,
  });
  const showConfidenceMessage = loginCount > 1 && (confidenceBoost ?? 0) > 0;
  const hasRiskDelta = riskDelta !== null && Math.abs(riskDelta) >= 0.01;

  return (
    <div
      className={`rounded-2xl p-6 transition-all duration-700 ${styles.panel} ${
        hasRiskDelta ? "ring-1 ring-cyan-300/25 shadow-2xl" : ""
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
        <div>
          <h3 className="text-xl font-bold text-blue-300">Security Status</h3>
          <p className="text-sm text-gray-300 mt-1">{decision.summary}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {hasRiskDelta ? (
            <span className="px-3 py-2 rounded-full text-xs font-semibold uppercase tracking-[0.2em] border border-cyan-400/20 bg-cyan-400/10 text-cyan-100">
              {riskDelta < 0 ? "Risk Down" : "Risk Up"} {Math.abs(riskDelta).toFixed(2)}
            </span>
          ) : null}
          <span
            className={`px-3 py-2 rounded-full text-xs font-semibold uppercase tracking-[0.2em] ${styles.badge}`}
          >
            {decision.label}
          </span>
        </div>
      </div>

      <div className="space-y-4">
        <div className="bg-gray-950/50 border border-white/5 rounded-xl p-4">
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-gray-400">Dynamic Risk Output</span>
            <span className={`text-sm font-semibold ${styles.text}`}>
              {(riskScore * 100).toFixed(0)} / 100 Risk
            </span>
          </div>
          <div className="mt-3 h-2 rounded-full bg-gray-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-[width] duration-700 ease-out ${styles.accent}`}
              style={{ width: `${Math.min(riskScore * 100, 100)}%` }}
            />
          </div>
        </div>

        {trustScore !== null ? (
          <div className="bg-gray-950/50 border border-white/5 rounded-xl p-4">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-gray-400">User Trust Score</span>
              <span className="text-sm font-semibold text-white">
                {trustScore} / 100
              </span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-gray-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-300 transition-[width] duration-700 ease-out"
                style={{ width: `${Math.min(trustScore, 100)}%` }}
              />
            </div>
          </div>
        ) : null}

        {showConfidenceMessage ? (
          <div className="bg-cyan-500/10 border border-cyan-400/20 rounded-xl p-4 transition-all duration-700">
            <p className="text-sm font-semibold text-cyan-100">
              {buildConfidenceMessage(loginCount)}
            </p>
            <p className="text-sm text-gray-300 mt-2 leading-7">
              Consistency credit lowered the local risk score by{" "}
              {confidenceBoost?.toFixed(2)} while preserving the live backend
              authentication result.
            </p>
          </div>
        ) : null}

        {apiRiskScore !== null ? (
          <div className="bg-gray-950/50 border border-white/5 rounded-xl p-4">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-gray-400">Backend Risk Input</span>
              <span className="text-sm font-semibold text-gray-200">
                {apiRiskScore.toFixed(2)}
              </span>
            </div>
            <p className="text-sm text-gray-400 mt-2 leading-7">
              The live authentication API response is preserved and used as a
              supporting signal alongside local behavioral memory.
            </p>
          </div>
        ) : null}

        <div className="bg-gray-950/50 border border-white/5 rounded-xl p-4">
          <p className="text-sm font-semibold text-white">Why this score?</p>
          <p className="text-sm text-gray-300 mt-2 leading-7">{explanation}</p>
        </div>

        {attackMode ? (
          <div className="bg-red-500/10 border border-red-500/25 rounded-xl p-4">
            <p className="text-sm font-semibold text-red-300">
              Attack mode enabled
            </p>
            <p className="text-sm text-red-200/90 mt-2 leading-7">
              Device fingerprint mismatch, location anomaly, and behavioral
              anomaly signals are being fed through the same local risk engine
              while the backend authentication response remains unchanged.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

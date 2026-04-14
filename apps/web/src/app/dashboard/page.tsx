"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DeveloperIntegration } from "@/components/security/developer-integration";
import { RiskAnalysis } from "@/components/security/risk-analysis";
import { SecurityStatus } from "@/components/security/security-status";
import {
  AuthSessionSnapshot,
  buildConfidenceMessage,
  buildRiskSignals,
  buildSessionNarrative,
  getRiskDecision,
  loadAuthSession,
} from "@/lib/security";

const formatTimestamp = (value: string) =>
  value ? new Date(value).toLocaleString() : "Not recorded";

const formatDelta = (value: number, precision = 2) =>
  `${value > 0 ? "+" : ""}${value.toFixed(precision)}`;

export default function DashboardPage() {
  const [isHydrated, setIsHydrated] = useState(false);
  const [session, setSession] = useState<AuthSessionSnapshot | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setSession(loadAuthSession());
      setIsHydrated(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  if (!isHydrated) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),_transparent_28%),linear-gradient(135deg,_#07111f,_#020617_58%,_#000000)] text-white flex items-center justify-center p-8">
        <div className="rounded-3xl border border-gray-800 bg-gray-900/90 p-8 text-center shadow-2xl">
          <p className="text-sm uppercase tracking-[0.24em] text-blue-300">
            QuantumAuth SDK
          </p>
          <h1 className="mt-3 text-3xl font-bold">Loading dashboard...</h1>
          <p className="mt-3 text-gray-400">
            Restoring the saved session token and behavioral memory.
          </p>
        </div>
      </main>
    );
  }

  if (!session?.token) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),_transparent_28%),linear-gradient(135deg,_#07111f,_#020617_58%,_#000000)] text-white flex items-center justify-center p-8">
        <div className="rounded-3xl border border-gray-800 bg-gray-900/90 p-8 text-center shadow-2xl max-w-xl">
          <p className="text-sm uppercase tracking-[0.24em] text-blue-300">
            QuantumAuth SDK
          </p>
          <h1 className="mt-3 text-3xl font-bold">No active session found</h1>
          <p className="mt-3 text-gray-400 leading-7">
            Authenticate on the home page first so this dashboard can restore a
            real session token, trust history, and dynamic risk factors.
          </p>
          <Link
            href="/"
            className="inline-flex mt-6 items-center justify-center rounded-xl bg-white text-gray-950 px-5 py-3 font-semibold hover:bg-gray-100 transition-colors"
          >
            Return to Authentication
          </Link>
        </div>
      </main>
    );
  }

  const decision = getRiskDecision(session.riskScore);
  const signals = buildRiskSignals({
    loginCount: session.loginCount,
    newDevice: session.newDevice,
    longGap: session.longGap,
    attackMode: session.attackMode,
  });
  const narrative = buildSessionNarrative(session);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),_transparent_28%),linear-gradient(135deg,_#07111f,_#020617_58%,_#000000)] text-white p-6 md:p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-blue-200">
                Protected Dashboard
              </p>
              <h1 className="mt-3 text-4xl md:text-5xl font-bold bg-gradient-to-r from-blue-300 to-cyan-200 bg-clip-text text-transparent">
                Security Operations View
              </h1>
              <p className="mt-4 max-w-3xl text-gray-300 leading-7">
                {narrative.detail}
              </p>
              <div className="mt-5 max-w-3xl rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-50 leading-7">
                <p>
                  This system continuously learns user behavior to improve
                  security and reduce friction.
                </p>
                <p className="mt-2">
                  Confidence improves as the system observes consistent user
                  behavior over time.
                </p>
              </div>
            </div>

            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-xl border border-gray-700 bg-gray-900/90 px-5 py-3 font-semibold text-white hover:bg-gray-800 transition-colors"
            >
              Back to Authentication
            </Link>
          </div>
        </header>

        <div className="grid lg:grid-cols-[0.92fr,1.08fr] gap-8">
          <div className="space-y-6">
            <div className="rounded-3xl border border-gray-800 bg-gray-900/90 p-6 shadow-2xl">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-blue-300">
                    Session Summary
                  </h2>
                  <p className="text-sm text-gray-400 mt-1">
                    Restored directly from the active local session snapshot.
                  </p>
                </div>
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
              </div>

              <div className="space-y-4">
                <DashboardMetric
                  label="User ID"
                  value={session.userId}
                  helper="Preserved from the active passwordless session"
                />
                <DashboardMetric
                  label="Public Key"
                  value={session.publicKey}
                  helper="The identity anchor for local memory and device trust"
                />
                <DashboardMetric
                  label="User Trust Score"
                  value={`${session.trustScore} / 100`}
                  helper="Trust rises in smaller, less predictable steps as the system sees more good sessions"
                />
                <DashboardMetric
                  label="Successful Logins"
                  value={String(session.loginCount)}
                  helper="Stored per public key in browser memory"
                />
                <DashboardMetric
                  label="Device Recognition"
                  value={
                    session.newDevice
                      ? "This device hasn’t been seen before"
                      : "Login matches previous device pattern"
                  }
                  helper="Reflects the device state that affected the latest risk decision"
                />
                <DashboardMetric
                  label="Backend Risk Input"
                  value={session.apiRiskScore.toFixed(2)}
                  helper="Live response preserved from the authentication API"
                />
                <DashboardMetric
                  label="Attack Mode"
                  value={session.attackMode ? "Enabled" : "Disabled"}
                  helper="Adds an anomaly signal and recomputes risk locally"
                />
                <DashboardMetric
                  label="Risk Shift"
                  value={formatDelta(session.riskDelta)}
                  helper="Shows how this session moved relative to the prior one for the same key"
                />
              </div>
            </div>

            <div className="rounded-3xl border border-gray-800 bg-gradient-to-br from-gray-900 to-gray-800 p-6">
              <h3 className="text-xl font-bold text-blue-300">
                Session Provenance
              </h3>
              <div className="space-y-3 mt-3 text-sm text-gray-300 leading-7">
                <p>
                  First seen:{" "}
                  <span className="text-white">
                    {formatTimestamp(session.firstSeenAt)}
                  </span>
                </p>
                <p>
                  Last login:{" "}
                  <span className="text-white">
                    {formatTimestamp(session.lastLoginAt)}
                  </span>
                </p>
                <p>
                  Current authenticated session:{" "}
                  <span className="text-white">
                    {formatTimestamp(session.lastAuthenticatedAt)}
                  </span>
                </p>
              </div>
            </div>

            <div className="rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-cyan-400/10 to-blue-500/10 p-6 transition-all duration-700">
              <h3 className="text-xl font-bold text-cyan-100">
                Adaptive Learning
              </h3>
              <p className="mt-3 text-sm text-gray-200 leading-7">
                {session.loginCount > 1
                  ? buildConfidenceMessage(session.loginCount)
                  : "The first successful session established the initial behavioral baseline for this identity."}
              </p>

              <div className="grid sm:grid-cols-3 gap-3 mt-4">
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
                <LearningMetric
                  label="Anomaly Signals"
                  value={session.attackMode ? "3 active" : "0 active"}
                  tone={session.attackMode ? "warning" : "safe"}
                />
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <SecurityStatus
              riskScore={session.riskScore}
              trustScore={session.trustScore}
              apiRiskScore={session.apiRiskScore}
              confidenceBoost={session.confidenceBoost}
              riskDelta={session.riskDelta}
              loginCount={session.loginCount}
              signals={signals}
              attackMode={session.attackMode}
            />
            <RiskAnalysis signals={signals} isReady />
            <DeveloperIntegration
              publicKey={session.publicKey}
              signature={session.signature}
              riskScore={session.riskScore}
              sessionToken={session.token}
            />
          </div>
        </div>
      </div>
    </main>
  );
}

function DashboardMetric({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-950/50 p-4">
      <p className="text-sm text-gray-400">{label}</p>
      <p className="mt-2 text-lg font-semibold text-white break-all">{value}</p>
      <p className="mt-2 text-sm text-gray-400 leading-7">{helper}</p>
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

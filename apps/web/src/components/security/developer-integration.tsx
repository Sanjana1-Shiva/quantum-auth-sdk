interface DeveloperIntegrationProps {
  publicKey: string;
  signature: string;
  riskScore: number | null;
  sessionToken?: string;
}

export function DeveloperIntegration({
  publicKey,
  signature,
  riskScore,
  sessionToken = "session-token-placeholder",
}: DeveloperIntegrationProps) {
  const verifySnippet = `const currentSession = {
  publicKey: "${publicKey || "qa-key-alice-2026-01"}",
  signature: "${signature || "signed-challenge-payload"}",
  riskScore: ${riskScore !== null ? riskScore.toFixed(2) : "session.riskScore"}
};

quantumAuth.verify({
  publicKey: currentSession.publicKey,
  signature: currentSession.signature,
  context: {
    device: "browser",
    riskScore: currentSession.riskScore
  }
})`;
  const riskLookupSnippet = `const sessionToken = "${sessionToken}";

const latestRisk = await quantumAuth.getRiskScore(sessionToken)`;

  return (
    <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-6 border border-gray-800">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div>
          <h3 className="text-xl font-bold text-blue-300">
            Developer Integration
          </h3>
          <p className="text-sm text-gray-400 mt-1">
            UI-only preview of how session intelligence can be passed into a
            developer-facing SDK flow.
          </p>
        </div>
        <span className="text-xs uppercase tracking-[0.24em] text-gray-500">
          SDK preview
        </span>
      </div>

      <div className="space-y-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-gray-500 mb-3">
            Verify Session
          </p>
          <pre className="overflow-x-auto rounded-xl border border-white/5 bg-gray-950/60 p-4 text-sm text-gray-200 leading-7">
            <code>{verifySnippet}</code>
          </pre>
        </div>

        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-gray-500 mb-3">
            Fetch Live Risk
          </p>
          <pre className="overflow-x-auto rounded-xl border border-white/5 bg-gray-950/60 p-4 text-sm text-gray-200 leading-7">
            <code>{riskLookupSnippet}</code>
          </pre>
        </div>
      </div>
    </div>
  );
}

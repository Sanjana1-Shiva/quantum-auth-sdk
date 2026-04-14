import { RiskSignal, getToneClasses } from "@/lib/security";

interface RiskAnalysisProps {
  signals: RiskSignal[];
  isReady: boolean;
}

function SignalGlyph({ tone, iconLabel }: { tone: RiskSignal["tone"]; iconLabel: string }) {
  const styles = getToneClasses(tone);

  return (
    <div
      className={`w-12 h-12 rounded-xl flex items-center justify-center text-[10px] font-bold tracking-[0.18em] ${styles.badge}`}
    >
      {iconLabel}
    </div>
  );
}

export function RiskAnalysis({ signals, isReady }: RiskAnalysisProps) {
  return (
    <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-6 border border-gray-800">
      <div className="flex items-center justify-between gap-4 mb-5">
        <div>
          <h3 className="text-xl font-bold text-blue-300">Risk Analysis</h3>
          <p className="text-sm text-gray-400 mt-1">
            Dynamic factors generated from login memory, device trust, and the
            current session context.
          </p>
        </div>
        <span className="text-xs uppercase tracking-[0.24em] text-gray-500">
          Live factors
        </span>
      </div>

      {isReady ? (
        <div className="space-y-4">
          {signals.map((signal) => {
            const styles = getToneClasses(signal.tone);

            return (
              <div
                key={signal.title}
                className="flex items-start gap-4 rounded-xl border border-white/5 bg-gray-950/40 p-4 transition-all duration-500 hover:-translate-y-0.5 hover:border-cyan-400/20"
              >
                <SignalGlyph tone={signal.tone} iconLabel={signal.iconLabel} />
                <div className="min-w-0">
                  <p className={`font-semibold ${styles.text}`}>{signal.title}</p>
                  <p className="text-sm text-gray-300 mt-1 leading-7">
                    {signal.detail}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-gray-700 bg-gray-950/40 p-5 text-sm text-gray-400 leading-7">
          Authenticate successfully to reveal first-use, device-recognition,
          gap, and anomaly factors for this session.
        </div>
      )}
    </div>
  );
}

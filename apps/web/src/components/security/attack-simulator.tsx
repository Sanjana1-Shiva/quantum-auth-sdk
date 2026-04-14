interface AttackSimulatorProps {
  canSimulate: boolean;
  isActive: boolean;
  onSimulate: () => void;
  onReset: () => void;
}

export function AttackSimulator({
  canSimulate,
  isActive,
  onSimulate,
  onReset,
}: AttackSimulatorProps) {
  return (
    <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-6 border border-gray-800 shadow-2xl">
      <div className="mb-4">
        <div>
          <h3 className="text-xl font-bold text-blue-300">Attack Simulation</h3>
          <p className="text-sm text-gray-400 mt-1">
            Toggle attack mode to inject an anomaly signal and rerun the local
            risk engine.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-white/5 bg-gray-950/40 p-4 text-sm text-gray-300 leading-7">
        {canSimulate
          ? "Attack mode adds behavioral anomaly, device fingerprint mismatch, and location anomaly signals to the current session and lets the same risk engine recompute the score."
          : "Complete a successful login first, then toggle attack mode to simulate fingerprint drift and location anomalies without touching the backend verification flow."}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
        <button
          type="button"
          onClick={onSimulate}
          disabled={!canSimulate || isActive}
          className="w-full bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-700 hover:to-orange-600 text-white font-semibold py-3 px-4 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isActive ? "Attack Mode Active" : "Enable Attack Mode"}
        </button>
        <button
          type="button"
          onClick={onReset}
          disabled={!isActive}
          className="w-full border border-gray-700 bg-gray-900 hover:bg-gray-800 text-white font-semibold py-3 px-4 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Disable Attack Mode
        </button>
      </div>
    </div>
  );
}

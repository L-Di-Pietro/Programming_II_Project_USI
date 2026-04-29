import { useEffect, useState } from "react";

import { Api, type Strategy } from "@/api/client";

/** Browseable library of registered strategies — useful as a teaching tool. */
export function Strategies() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Api.listStrategies().then(setStrategies).catch((e) => setError(String(e)));
  }, []);

  return (
    <div className="space-y-6">
      <h1>Strategies</h1>
      {error && <div className="card text-accent-red text-sm">{error}</div>}
      <div className="grid md:grid-cols-2 gap-4">
        {strategies.map((s) => (
          <div key={s.slug} className="card">
            <h2>{s.name}</h2>
            <div className="text-xs text-slate-500 font-mono">{s.slug}</div>
            <p className="mt-2 text-sm text-slate-700">{s.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

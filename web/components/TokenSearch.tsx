"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export default function TokenSearch({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const errorId = useId();
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function go() {
    const v = q.trim();
    if (!BASE58.test(v)) {
      setErr("Paste a token mint address");
      return;
    }
    setErr(null);
    router.push(`/token/${v}`);
  }

  return (
    <div className={compact ? "w-full min-w-0 max-w-xs" : "w-full min-w-0"}>
      <div className="flex gap-2">
        <input
          className={`input ${compact ? "!py-1.5 text-xs" : ""}`}
          aria-label="Token mint address"
          aria-invalid={!!err}
          aria-describedby={err ? errorId : undefined}
          placeholder={compact ? "Find a token…" : "Paste a token mint address"}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && go()}
          spellCheck={false}
        />
        <button className={`btn-primary ${compact ? "!px-3 !py-1.5 text-xs" : ""}`} onClick={go}>
          Search
        </button>
      </div>
      {err && <div id={errorId} role="alert" className="mt-2 text-xs text-ember">{err}</div>}
    </div>
  );
}

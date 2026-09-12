"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export default function TokenSearch({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
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
    <div className={compact ? "w-full max-w-xs" : "w-full"}>
      <div className="flex gap-2">
        <input
          className={`input ${compact ? "!py-1.5 text-xs" : ""}`}
          placeholder={compact ? "Search token mint…" : "Paste a token mint address to see how much is locked"}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && go()}
          spellCheck={false}
        />
        <button className={`btn-primary ${compact ? "!px-3 !py-1.5 text-xs" : ""}`} onClick={go}>
          Search
        </button>
      </div>
      {err && <div className="mt-1 text-xs text-ember">{err}</div>}
    </div>
  );
}

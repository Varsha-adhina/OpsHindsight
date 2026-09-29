"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function SettingsPage() {
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  function refresh() {
    setLoading(true);
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .finally(() => setLoading(false));
  }

  useEffect(() => { refresh(); }, []);

  async function testHindsight() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/hindsight/test", { method: "POST" });
      setTestResult(await res.json());
    } catch (e: any) {
      setTestResult({ overall: false, results: [{ step: "request", ok: false, detail: e.message }] });
    } finally {
      setTesting(false);
      refresh();
    }
  }

  const hs = health?.services?.hindsight;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold text-[#e6edf3]">Settings</h1>
      <div className="card">
        <div className="card-header">Integration health</div>
        <div className="space-y-2 p-3 text-[13px]">
          {loading && !health ? (
            <div className="text-[#8b9cb3]"><Loader2 className="mr-2 inline h-3.5 w-3.5 animate-spin" /> Loading…</div>
          ) : (
            <>
              <Row label="Database" value={health?.services?.database} />
              <Row label="Groq" value={health?.services?.groq} />
              <Row label="Hindsight status" value={hs?.mode === "live" && hs?.status === "connected" ? "LIVE" : hs?.mode === "demo" ? "DEMO" : "OFFLINE"} />
              <Row label="Hindsight bank" value={hs?.bankId} />
              <Row label="Hindsight memories" value={String(hs?.totalMemories ?? "—")} />
              <Row label="Application mode" value={hs?.mode === "live" ? "Live" : "Demo"} />
              <p className="text-[12px] text-[#8b9cb3]">{hs?.message}</p>
            </>
          )}
          <div className="flex gap-2 pt-2">
            <button onClick={refresh} className="btn btn-secondary">Refresh health</button>
            <button onClick={testHindsight} disabled={testing} className="btn btn-primary">
              {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Test Hindsight Connection
            </button>
          </div>
        </div>
      </div>
      {testResult && (
        <div className="card p-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-[13px] font-medium text-[#e6edf3]">Connection test</span>
            <Badge variant={testResult.overall ? "success" : "danger"}>{testResult.overall ? "PASSED" : "FAILED"}</Badge>
          </div>
          {(testResult.results || []).map((r: any, i: number) => (
            <div key={i} className="flex gap-2 text-[12px]">
              <span className={r.ok ? "text-[#4ade80]" : "text-[#f87171]"}>{r.ok ? "PASS" : "FAIL"}</span>
              <span className="text-[#8b9cb3]">{r.step}</span>
              <span className="text-[#e6edf3]">{r.detail}</span>
            </div>
          ))}
        </div>
      )}
      <div className="card p-3 text-[12px] text-[#8b9cb3]">
        Secrets via env only: GROQ_API_KEY, HINDSIGHT_API_KEY, HINDSIGHT_BASE_URL, HINDSIGHT_BANK_ID, DEMO_MODE=false
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-[#5c6b7f]">{label}</span>
      <Badge variant="outline">{value || "—"}</Badge>
    </div>
  );
}

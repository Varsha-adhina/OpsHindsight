"use client";

import { useEffect, useState, useMemo } from "react";
import { Brain, Search, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function MemoryPage() {
  const [status, setStatus] = useState<any>(null);
  const [query, setQuery] = useState("payments-api connection pool");
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [serviceFilter, setServiceFilter] = useState("");
  const [selected, setSelected] = useState<any>(null);

  useEffect(() => {
    fetch("/api/memory/status").then((r) => r.json()).then(setStatus);
  }, []);

  async function recall() {
    setSearching(true);
    setSelected(null);
    const res = await fetch("/api/memory/recall", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit: 15, service: serviceFilter || undefined }),
    });
    const data = await res.json();
    setResults(data.memories || []);
    setSearching(false);
  }

  const displayList = useMemo(() => {
    const base = results.length ? results : status?.recentMemories || [];
    if (!serviceFilter) return base;
    return base.filter((m: any) =>
      (m.service && m.service === serviceFilter) ||
      (m.content || "").toLowerCase().includes(serviceFilter.toLowerCase())
    );
  }, [results, status, serviceFilter]);

  function parseFields(content: string) {
    const get = (label: string) => {
      const m = content.match(new RegExp(label + ":\\s*(.+)", "i"));
      return m ? m[1].trim() : null;
    };
    return {
      incidentId: get("Incident ID"),
      service: get("Service"),
      severity: get("Severity"),
      rootCause: get("Root cause"),
      resolution: get("Successful resolution"),
      runbook: get("Runbook"),
      lessons: get("Lessons"),
    };
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-[#e6edf3]">Memory Explorer</h1>
        <p className="text-[13px] text-[#8b9cb3]">
          These results are retrieved from the OpsHindsight Hindsight bank (live recall when connected).
        </p>
      </div>
      {status && (
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="card p-3"><div className="text-[11px] text-[#5c6b7f]">Mode</div><div className="font-medium text-[#e6edf3]">{status.mode}</div></div>
          <div className="card p-3"><div className="text-[11px] text-[#5c6b7f]">Bank</div><div className="font-mono text-[12px] text-[#e6edf3]">{status.bankId}</div></div>
          <div className="card p-3"><div className="text-[11px] text-[#5c6b7f]">Hindsight memories</div><div className="font-medium text-[#e6edf3]">{status.totalMemories}</div></div>
          <div className="card p-3"><div className="text-[11px] text-[#5c6b7f]">Connected</div><div className="font-medium text-[#e6edf3]">{status.connected ? "Yes" : "No"}</div></div>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <input value={query} onChange={(e) => setQuery(e.target.value)} className="input max-w-md flex-1" placeholder="Search memories…" />
        <select value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)} className="select w-auto">
          <option value="">All services</option>
          {["payments-api","auth-service","checkout-service","redis-cache","orders-api"].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <button onClick={recall} disabled={searching} className="btn btn-primary">
          {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />} Recall
        </button>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-2">
          {displayList.map((m: any) => {
            const f = parseFields(m.content || "");
            return (
              <button key={m.id} type="button" onClick={() => setSelected(m)} className="card w-full p-3 text-left hover:bg-[#1c2530]">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <Brain className="h-3.5 w-3.5 text-[#3b82f6]" />
                  <span className="font-mono text-[11px] text-[#93c5fd]">{f.incidentId || String(m.id).slice(0, 24)}</span>
                  {(f.service || m.service) && <Badge>{f.service || m.service}</Badge>}
                </div>
                <p className="line-clamp-2 text-[12px] text-[#8b9cb3]">{f.rootCause || (m.content || "").slice(0, 160)}</p>
              </button>
            );
          })}
        </div>
        <div className="card h-fit p-3 text-[13px]">
          {selected ? (() => {
            const f = parseFields(selected.content || "");
            return (
              <div className="space-y-2">
                <div className="text-[11px] font-semibold uppercase text-[#8b9cb3]">Memory detail</div>
                <div><span className="text-[#5c6b7f]">Incident: </span>{f.incidentId || "—"}</div>
                <div><span className="text-[#5c6b7f]">Service: </span>{f.service || selected.service || "—"}</div>
                <div><span className="text-[#5c6b7f]">Root cause: </span>{f.rootCause || "—"}</div>
                <div><span className="text-[#5c6b7f]">Resolution: </span>{f.resolution || "—"}</div>
                <div><span className="text-[#5c6b7f]">Runbook: </span>{f.runbook || "—"}</div>
                <div><span className="text-[#5c6b7f]">Lessons: </span>{f.lessons || "—"}</div>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded border border-[#2a3441] bg-[#0c1117] p-2 text-[11px] text-[#8b9cb3]">{selected.content}</pre>
              </div>
            );
          })() : <p className="text-[#5c6b7f]">Select a memory to inspect.</p>}
        </div>
      </div>
    </div>
  );
}

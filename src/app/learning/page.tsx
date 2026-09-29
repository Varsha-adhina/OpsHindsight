"use client";

import { useEffect, useState } from "react";
import { Loader2, Brain } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function LearningPage() {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    fetch("/api/learning/analytics").then((r) => r.json()).then(setData);
  }, []);

  if (!data) {
    return (
      <div className="flex h-40 items-center justify-center text-[#8b9cb3]">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-[#e6edf3]">Learning Analytics</h1>
        <p className="text-[13px] text-[#8b9cb3]">
          Persistent operational memory — not model training. OpsHindsight improves by retaining and recalling incident knowledge in Hindsight.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Incidents retained" value={data.incidentsRetained ?? data.totalIncidents} sub="resolved in app DB" />
        <Card label="Hindsight memories" value={data.hindsightMemories ?? data.retainedMemories} sub={data.hindsightMode === "live" ? "from Hindsight bank" : "demo / local"} />
        <Card label="Avg resolution" value={`${data.avgResolutionMinutes}m`} sub="application data" />
        <Card label="Learning events" value={data.learningEvents} sub="logged memory operations" />
      </div>

      <div className="card">
        <div className="card-header">Hindsight Learning Activity (application logs)</div>
        <div className="grid gap-3 p-3 sm:grid-cols-4">
          <div>
            <div className="text-[11px] text-[#8b9cb3]">Successful recalls</div>
            <div className="text-lg font-semibold text-[#e6edf3]">{data.hindsightActivity?.successfulRecalls ?? data.successfulRecalls ?? 0}</div>
          </div>
          <div>
            <div className="text-[11px] text-[#8b9cb3]">Reflections</div>
            <div className="text-lg font-semibold text-[#e6edf3]">{data.hindsightActivity?.reflections ?? 0}</div>
          </div>
          <div>
            <div className="text-[11px] text-[#8b9cb3]">Incidents influenced</div>
            <div className="text-lg font-semibold text-[#e6edf3]">{data.hindsightActivity?.incidentsInfluenced ?? 0}</div>
          </div>
          <div>
            <div className="text-[11px] text-[#8b9cb3]">Lessons retained</div>
            <div className="text-lg font-semibold text-[#e6edf3]">{data.hindsightActivity?.successfulRetains ?? data.successfulRetains ?? 0}</div>
          </div>
        </div>
        <p className="border-t border-[#1e2630] px-3 py-2 text-[11px] text-[#5c6b7f]">
          Source: application Hindsight operation logs — increases only when you Analyze / Resolve.
        </p>
      </div>

      {(data.learningTimeline || []).length > 0 && (
        <div className="card">
          <div className="card-header">Learning timeline</div>
          <ul className="max-h-72 space-y-2 overflow-auto p-3 text-[12px]">
            {(data.learningTimeline || []).map((e: any) => (
              <li key={e.id} className="border-l-2 border-[#2a3441] pl-2">
                <span className="font-mono text-[10px] text-[#5c6b7f]">
                  {e.at ? new Date(e.at).toLocaleString() : ""}
                </span>
                <div className="text-[#e6edf3]">
                  <span className={e.status === "success" ? "text-[#4ade80]" : "text-[#f87171]"}>
                    {e.status === "success" ? "✓" : "✕"} {String(e.operation).toUpperCase()}
                  </span>
                  {e.externalId && <span className="ml-2 font-mono text-[11px] text-[#93c5fd]">{e.externalId}</span>}
                  {e.service && <span className="ml-1 text-[#8b9cb3]">{e.service}</span>}
                </div>
                <p className="text-[#8b9cb3]">{e.summary}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card p-3">
        <div className="flex items-center gap-2 text-[13px]">
          <Brain className="h-4 w-4 text-[#3b82f6]" />
          <Badge variant={data.hindsightMode === "live" ? "live" : "warning"}>
            {data.hindsightMode === "live" ? "LIVE HINDSIGHT" : String(data.hindsightMode || "demo").toUpperCase()}
          </Badge>
          <span className="font-mono text-[11px] text-[#5c6b7f]">{data.bankId}</span>
        </div>
        <p className="mt-1 text-[12px] text-[#8b9cb3]">{data.hindsightMessage}</p>
      </div>

      <div className="card">
        <div className="card-header">Learning progression (persistent memory depth)</div>
        <div className="space-y-3 p-3">
          {(data.learningCurve || []).map((s: any, i: number) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-44 text-[12px] text-[#8b9cb3]">{s.stage}</div>
              <div className="h-1.5 flex-1 rounded-full bg-[#1c2530]">
                <div className="h-1.5 rounded-full bg-[#3b82f6]" style={{ width: `${(s.confidence || 0) * 100}%` }} />
              </div>
              <div className="w-56 text-[12px] text-[#e6edf3]">{s.description}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-header">Runbook effectiveness (Prisma source of truth)</div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Runbook</th>
                <th>Service</th>
                <th>Success rate</th>
                <th>Count</th>
                <th>Avg minutes</th>
              </tr>
            </thead>
            <tbody>
              {(data.runbooks || []).map((r: any) => (
                <tr key={r.name}>
                  <td className="font-mono text-[12px] text-[#e6edf3]">{r.name}</td>
                  <td className="text-[#8b9cb3]">{r.service}</td>
                  <td className="text-[#4ade80]">{Math.round((r.successRate || 0) * 100)}%</td>
                  <td className="text-[#8b9cb3]">{r.successCount}/{r.successCount + r.failureCount}</td>
                  <td className="text-[#8b9cb3]">{r.avgMinutes != null ? Math.round(r.avgMinutes) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header">Knowledge gained recently</div>
        <div className="divide-y divide-[#1e2630]">
          {(data.recentKnowledge || []).length === 0 && (
            <p className="p-3 text-[13px] text-[#5c6b7f]">No resolutions yet.</p>
          )}
          {(data.recentKnowledge || []).map((k: any, i: number) => (
            <div key={i} className="p-3 text-[13px]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11px] text-[#5c6b7f]">{k.externalId}</span>
                <span className="text-[#e6edf3]">{k.service}</span>
                <Badge variant="danger">{k.severity}</Badge>
              </div>
              <p className="mt-1 text-[#8b9cb3]">{k.rootCause}</p>
              {k.lessons && <p className="mt-0.5 text-[12px] text-[#93c5fd]">Lesson: {k.lessons}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Card({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="card p-3">
      <div className="text-[11px] text-[#8b9cb3]">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-[#e6edf3]">{value}</div>
      {sub && <div className="text-[10px] text-[#5c6b7f]">{sub}</div>}
    </div>
  );
}

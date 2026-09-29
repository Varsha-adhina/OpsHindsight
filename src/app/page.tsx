"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Brain,
  Clock,
  Activity,
  CheckCircle2,
  Play,
  Loader2,
  BookOpen,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { severityColor, statusColor } from "@/lib/utils";

export default function DashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center text-[#8b9cb3]">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading dashboard…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="card p-4 text-[#f87171]">
        Failed to load dashboard: {error || "unknown"}
        <p className="mt-2 text-[13px] text-[#8b9cb3]">
          Run <code className="text-[#e6edf3]">npm run db:setup</code> to seed data.
        </p>
      </div>
    );
  }

  const ms = data.memoryStatus || {};
  const impact = data.memoryImpact || {};

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#e6edf3]">MemoraX</h1>
          <p className="text-[13px] text-[#8b9cb3]">
            Persistent memory for faster incident response
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/incident/new?demo=1" className="btn btn-primary">
            <Play className="h-3.5 w-3.5" /> Start Demo Incident
          </Link>
          <Link href="/incident/new" className="btn btn-secondary">
            <AlertTriangle className="h-3.5 w-3.5" /> New Incident
          </Link>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Metric icon={<Activity className="h-3.5 w-3.5 text-[#f87171]" />} label="Active incidents" value={data.activeIncidents} />
        <Metric icon={<CheckCircle2 className="h-3.5 w-3.5 text-[#4ade80]" />} label="Incidents resolved" value={data.incidentsResolved ?? data.resolvedThisWeek} />
        <Metric icon={<Brain className="h-3.5 w-3.5 text-[#93c5fd]" />} label="Hindsight memories" value={data.hindsightMemories ?? data.historicalInMemory} sub="from Hindsight bank" />
        <Metric icon={<Clock className="h-3.5 w-3.5 text-[#8b9cb3]" />} label="Avg resolution" value={`${data.avgResolutionMinutes}m`} sub="application data" />
        <Metric icon={<BookOpen className="h-3.5 w-3.5 text-[#fbbf24]" />} label="Learning events" value={data.learningEvents} sub="memory operations logged" />
      </div>

      {/* Hindsight status */}
      <div className="card p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-[#3b82f6]" />
            <span className="text-[13px] font-medium text-[#e6edf3]">Hindsight status</span>
            <Badge variant={ms.mode === "live" ? "live" : ms.mode === "demo" ? "warning" : "danger"}>
              {ms.mode === "live" ? "LIVE HINDSIGHT" : ms.mode === "demo" ? "DEMO (local only)" : "Hindsight unavailable"}
            </Badge>
          </div>
          <span className="font-mono text-[11px] text-[#5c6b7f]">Bank: {ms.bankId}</span>
        </div>
        <p className="mt-1.5 text-[12px] text-[#8b9cb3]">{ms.message}</p>
      </div>

      {/* Charts row */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="card p-3">
          <div className="card-header !border-0 !p-0 !normal-case !tracking-normal mb-3">Incidents over time</div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={data.incidentsOverTime || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2630" />
              <XAxis dataKey="date" stroke="#5c6b7f" fontSize={11} />
              <YAxis stroke="#5c6b7f" fontSize={11} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "#161d27", border: "1px solid #2a3441", fontSize: 12 }} />
              <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="card p-3">
          <div className="card-header !border-0 !p-0 !normal-case !tracking-normal mb-3">Runbook success rate %</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={data.runbookSuccess || []} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2630" />
              <XAxis type="number" domain={[0, 100]} stroke="#5c6b7f" fontSize={11} />
              <YAxis dataKey="name" type="category" width={130} stroke="#5c6b7f" fontSize={10} />
              <Tooltip contentStyle={{ background: "#161d27", border: "1px solid #2a3441", fontSize: 12 }} />
              <Bar dataKey="rate" fill="#22c55e" radius={[0, 2, 2, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <p className="mt-1 text-[11px] text-[#5c6b7f]">Source: Prisma Runbook successCount / (success + failure)</p>
        </div>
      </div>

      {/* Memory impact — application-level Hindsight activity logs */}
      <div className="card">
        <div className="card-header">Memory impact</div>
        <div className="grid gap-3 p-3 sm:grid-cols-4">
          <Impact label="Incidents remembered" value={impact.incidentsRemembered ?? 0} hint="distinct incidents with successful RECALL" />
          <Impact label="Successful recalls" value={impact.memoriesRecalled ?? 0} hint="RECALL ops logged" />
          <Impact label="Recommendations influenced" value={impact.recommendationsInfluenced ?? 0} hint="analyses with recalled context" />
          <Impact label="Lessons retained" value={impact.lessonsRetained ?? 0} hint="post-mortem RETAIN ops" />
        </div>
        <p className="border-t border-[#1e2630] px-3 py-2 text-[11px] text-[#5c6b7f]">
          Source: persistent application Hindsight operation logs (Prisma MemoryOperation). Separate from Hindsight bank size.
        </p>
      </div>

      {/* Recent Hindsight operation logs */}
      <div className="card">
        <div className="card-header">Recent Hindsight Operations</div>
        {(data.recentHindsightOps || data.recentMemoryOps || []).length === 0 ? (
          <p className="p-3 text-[12px] text-[#5c6b7f]">
            No application operation logs yet. Run Analyze or Resolve &amp; Teach — these counters only grow from persisted MemoryOperation rows, not from the Hindsight bank size.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Operation</th>
                  <th>Status</th>
                  <th>Incident</th>
                  <th>Memories</th>
                  <th>Summary</th>
                </tr>
              </thead>
              <tbody>
                {(data.recentHindsightOps || data.recentMemoryOps || []).slice(0, 5).map((op: any) => (
                  <tr key={op.id}>
                    <td className="font-mono text-[11px] text-[#5c6b7f]">
                      {op.createdAt ? new Date(op.createdAt).toLocaleString() : "—"}
                    </td>
                    <td className="uppercase text-[#93c5fd]">{op.operationType}</td>
                    <td>
                      <span className={op.status === "success" ? "text-[#4ade80]" : op.status === "error" ? "text-[#f87171]" : "text-[#fbbf24]"}>
                        {op.status}
                      </span>
                    </td>
                    <td className="font-mono text-[11px] text-[#e6edf3]">
                      {op.externalId || op.incidentId?.slice?.(0, 8) || "—"}
                    </td>
                    <td className="tabular-nums text-[#8b9cb3]">
                      {op.resultCount != null ? op.resultCount : "—"}
                    </td>
                    <td className="max-w-[280px] truncate text-[#8b9cb3]">{op.summary || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent incidents table */}
      <div className="card">
        <div className="card-header">Recent incidents</div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Incident</th>
                <th>Service</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Root cause</th>
                <th>Duration</th>
                <th>Runbook</th>
              </tr>
            </thead>
            <tbody>
              {(data.recentIncidents || []).map((inc: any) => (
                <tr key={inc.id}>
                  <td>
                    <Link href={`/incident/${inc.id}`} className="text-[#93c5fd] hover:underline">
                      <span className="font-mono text-[11px] text-[#5c6b7f]">{inc.externalId}</span>
                      <div className="max-w-[220px] truncate text-[#e6edf3]">{inc.title}</div>
                    </Link>
                  </td>
                  <td className="text-[#8b9cb3]">{inc.service}</td>
                  <td><span className={`badge ${severityColor(inc.severity)}`}>{inc.severity}</span></td>
                  <td><span className={`badge ${statusColor(inc.status)}`}>{inc.status}</span></td>
                  <td className="max-w-[200px] truncate text-[#8b9cb3]">{inc.rootCause || "—"}</td>
                  <td className="text-[#8b9cb3]">{inc.durationMinutes != null ? `${inc.durationMinutes}m` : "—"}</td>
                  <td className="max-w-[140px] truncate font-mono text-[11px] text-[#5c6b7f]">{inc.runbook || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Metric({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string | number; sub?: string }) {
  return (
    <div className="card p-3">
      <div className="flex items-center gap-1.5 text-[11px] text-[#8b9cb3]">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-[#e6edf3]">{value}</div>
      {sub && <div className="mt-0.5 text-[10px] text-[#5c6b7f]">{sub}</div>}
    </div>
  );
}

function Impact({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div>
      <div className="text-[11px] text-[#8b9cb3]">{label}</div>
      <div className="text-lg font-semibold tabular-nums text-[#e6edf3]">{value}</div>
      {hint && <div className="text-[10px] text-[#5c6b7f]">{hint}</div>}
    </div>
  );
}

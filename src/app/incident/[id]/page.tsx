"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Loader2,
  Brain,
  RefreshCw,
  CheckCircle,
  MessageSquare,
  Download,
  GitCompare,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { severityColor, statusColor } from "@/lib/utils";

type StepState = "pending" | "active" | "done" | "failed";

function Investigation() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const autoAnalyze = searchParams.get("autoAnalyze") === "1";

  const [incident, setIncident] = useState<any>(null);
  const [analysis, setAnalysis] = useState<any>(null);
  const [memoryTrace, setMemoryTrace] = useState<any>(null);
  const [withoutAnalysis, setWithoutAnalysis] = useState<any>(null);
  const [whyChanged, setWhyChanged] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [withoutMemory, setWithoutMemory] = useState(false);
  const [observation, setObservation] = useState("");
  const [resolveOpen, setResolveOpen] = useState(false);
  const [rootCause, setRootCause] = useState("");
  const [successfulSteps, setSuccessfulSteps] = useState("");
  const [runbook, setRunbook] = useState("");
  const [acknowledgeMismatch, setAcknowledgeMismatch] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [feedbackRating, setFeedbackRating] = useState<string>("");
  const [learned, setLearned] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [failedStep, setFailedStep] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ label: string; state: StepState }[]>([
    { label: "Preparing analysis", state: "pending" },
    { label: "Searching Hindsight memory", state: "pending" },
    { label: "Reflecting on history", state: "pending" },
    { label: "Generating response", state: "pending" },
  ]);

  const load = useCallback(async () => {
    const res = await fetch(`/api/incidents/${id}`);
    const data = await res.json();
    if (data.incident) {
      setIncident(data.incident);
      if (data.incident.analyses?.[0]) {
        try {
          const parsed = JSON.parse(data.incident.analyses[0].responseJson);
          if (parsed.withMemory) {
            setAnalysis(parsed.withMemory.response || parsed.withMemory);
            setWithoutAnalysis(parsed.withoutMemory?.response || parsed.withoutMemory);
          } else {
            setAnalysis(parsed);
          }
        } catch { /* */ }
      }
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  function setStepStates(activeIdx: number, failed?: boolean) {
    setProgress((prev) =>
      prev.map((s, i) => ({
        ...s,
        state: failed && i === activeIdx ? "failed" : i < activeIdx ? "done" : i === activeIdx ? "active" : "pending",
      }))
    );
  }

  const runAnalyze = useCallback(
    async (noMem = withoutMemory) => {
      setAnalyzing(true);
      setError(null);
      setFailedStep(null);
      setStepStates(0);
      try {
        setStepStates(noMem ? 3 : 1);
        const res = await fetch(`/api/incidents/${id}/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ withoutMemory: noMem }),
        });
        setStepStates(2);
        const data = await res.json();
        if (!res.ok) {
          setFailedStep(noMem ? "Generating response" : "Hindsight recall / analysis");
          throw new Error(data.error || "Analyze failed");
        }
        setStepStates(3);
        setAnalysis(data.response);
        setMemoryTrace(data.memoryTrace);
        if (!noMem) setWithoutAnalysis(null);
        setWhyChanged(null);
        setProgress((p) => p.map((s) => ({ ...s, state: "done" as StepState })));
        await load();
      } catch (e: any) {
        setError(e.message);
      } finally {
        setAnalyzing(false);
      }
    },
    [id, withoutMemory, load]
  );

  const runCompare = useCallback(async () => {
    setComparing(true);
    setError(null);
    setFailedStep(null);
    setStepStates(0);
    try {
      setStepStates(1);
      const res = await fetch(`/api/incidents/${id}/compare`, { method: "POST" });
      setStepStates(2);
      const data = await res.json();
      if (!res.ok) {
        setFailedStep("Compare analysis");
        throw new Error(data.error || "Compare failed");
      }
      setStepStates(3);
      setAnalysis(data.withMemory.response);
      setMemoryTrace(data.withMemory.memoryTrace);
      setWithoutAnalysis(data.withoutMemory.response);
      setWhyChanged(data.whyMemoryChanged);
      setWithoutMemory(false);
      setProgress((p) => p.map((s) => ({ ...s, state: "done" as StepState })));
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setComparing(false);
    }
  }, [id, load]);

  useEffect(() => {
    if (autoAnalyze && incident && !analysis && !analyzing && !comparing) {
      runAnalyze(false);
    }
  }, [autoAnalyze, incident, analysis, analyzing, comparing, runAnalyze]);

  async function addObservation() {
    if (!observation.trim()) return;
    await fetch(`/api/incidents/${id}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventType: "observation", content: observation }),
    });
    setObservation("");
    await load();
    await runAnalyze(withoutMemory);
  }

  function consistencyWarnings(): string[] {
    if (!incident) return [];
    const svc = (incident.service || "").toLowerCase();
    const warnings: string[] = [];
    const text = `${rootCause} ${successfulSteps} ${runbook} ${feedback}`.toLowerCase();
    // Known service tokens that imply a different service than the incident
    const services = [
      "payments-api",
      "auth-service",
      "checkout-service",
      "redis-cache",
      "orders-api",
      "inventory-service",
      "notification-service",
      "postgres-primary",
      "kafka",
    ];
    for (const other of services) {
      if (!other || other === svc) continue;
      // Runbook prefix often encodes service: auth-service-crashloop-v1
      if (runbook.toLowerCase().startsWith(other) || runbook.toLowerCase().includes(other + "-")) {
        warnings.push(`Runbook "${runbook}" looks specific to ${other}, but this incident is ${incident.service}.`);
      }
      // Root cause / steps mentioning another service by name
      if (rootCause.toLowerCase().includes(other) || successfulSteps.toLowerCase().includes(other)) {
        warnings.push(`Root cause or resolution mentions ${other}, but this incident is ${incident.service}.`);
      }
    }
    // Generic mismatch: runbook does not contain current service token when it looks service-prefixed
    if (runbook && svc && !runbook.toLowerCase().includes(svc.split("-")[0]) && runbook.includes("-")) {
      // only warn if another service already flagged or runbook has a clear service-like prefix
      const prefix = runbook.split("-").slice(0, 2).join("-").toLowerCase();
      if (services.some((s) => s.startsWith(prefix) || prefix.startsWith(s.split("-")[0])) && !runbook.toLowerCase().includes(svc)) {
        if (!warnings.some((w) => w.includes("Runbook"))) {
          warnings.push(`Runbook "${runbook}" may not match service ${incident.service}.`);
        }
      }
    }
    return [...new Set(warnings)];
  }

  async function resolve() {
    setError(null);
    if (!rootCause.trim() || !successfulSteps.trim()) {
      setError("Root cause and successful resolution steps are required.");
      return;
    }
    const warnings = consistencyWarnings();
    if (warnings.length > 0 && !acknowledgeMismatch) {
      setError("Service mismatch detected. Review the warning and check the confirmation box to save.");
      return;
    }
    const res = await fetch(`/api/incidents/${id}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rootCause: rootCause.trim(),
        successfulSteps: successfulSteps.trim(),
        runbook: runbook.trim() || undefined,
        feedback: feedback.trim() || undefined,
        feedbackRating: feedbackRating || undefined,
        acknowledgeMismatch: warnings.length > 0 ? true : undefined,
      }),
    });
    const data = await res.json();
    if (res.ok || res.status === 207) {
      setLearned(data.learned);
      setResolveOpen(false);
      setAcknowledgeMismatch(false);
      await load();
      if (data.learned && !data.learned.retained) {
        setError("Resolution saved, but Hindsight retain failed — lesson was not stored in memory.");
      }
    } else {
      setError(
        typeof data.error === "string"
          ? data.error
          : data.warning
            ? data.warning
            : "Resolve failed"
      );
      if (data.learned) setLearned(data.learned);
    }
  }


  function openResolve() {
    setAcknowledgeMismatch(false);
    setError(null);
    // Always prefer current analysis for this incident; never keep a previous incident's defaults
    if (analysis) {
      const top = analysis.hypotheses?.[0];
      setRootCause(top?.cause || "");
      const steps = (analysis.recommendedSteps || [])
        .filter((s: any) => s.category !== "do_not_execute_automatically")
        .slice(0, 3)
        .map((s: any) => s.title)
        .join("; ");
      setSuccessfulSteps(steps || "");
      // Only use runbook if it is related; prefer ones that match this service
      const rbs = analysis.relatedRunbooks || [];
      const svc = (incident?.service || "").toLowerCase();
      const matched = rbs.find((r: any) =>
        String(r.name || "").toLowerCase().includes(svc.split("-")[0] || svc)
      );
      setRunbook(matched?.name || rbs[0]?.name || "");
      setFeedback(analysis.memoryExplanation ? String(analysis.memoryExplanation).slice(0, 240) : "");
    } else {
      setRootCause("");
      setSuccessfulSteps("");
      setRunbook("");
      setFeedback("");
    }
    setFeedbackRating("");
    setResolveOpen(true);
  }

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center text-[#8b9cb3]">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading incident…
      </div>
    );
  }
  if (!incident) return <div className="text-[#f87171]">Incident not found</div>;

  const busy = analyzing || comparing;

  return (
    <div className="mx-auto max-w-[1400px] space-y-3">
      {/* Header */}
      <div className="card p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[12px] text-[#5c6b7f]">{incident.externalId}</span>
              <span className={`badge ${severityColor(incident.severity)}`}>{incident.severity}</span>
              <span className={`badge ${statusColor(incident.status)}`}>{incident.status}</span>
            </div>
            <h1 className="mt-1 text-lg font-semibold text-[#e6edf3]">{incident.title}</h1>
            <p className="text-[12px] text-[#8b9cb3]">
              {incident.service} · {incident.environment}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 rounded border border-[#2a3441] bg-[#12181f] px-2 py-1 text-[12px] text-[#8b9cb3]">
              <input
                type="checkbox"
                checked={withoutMemory}
                onChange={(e) => setWithoutMemory(e.target.checked)}
              />
              Without Memory
            </label>
            <button
              onClick={() => runAnalyze(withoutMemory)}
              disabled={busy}
              className="btn btn-secondary"
            >
              {analyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Analyze
            </button>
            <button onClick={runCompare} disabled={busy} className="btn btn-primary">
              {comparing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitCompare className="h-3.5 w-3.5" />}
              Compare Memory Impact
            </button>
            <button onClick={openResolve} className="btn btn-success">
              <CheckCircle className="h-3.5 w-3.5" /> Resolve & Teach
            </button>
            <a href={`/api/incidents/${id}/export`} className="btn btn-secondary">
              <Download className="h-3.5 w-3.5" /> Export
            </a>
          </div>
        </div>
      </div>

      {/* Progress */}
      {busy && (
        <div className="card p-3 space-y-1.5">
          {progress.map((s, i) => (
            <div
              key={i}
              className={`progress-step ${s.state === "active" ? "active" : ""} ${s.state === "done" ? "done" : ""} ${s.state === "failed" ? "failed" : ""}`}
            >
              {s.state === "active" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {s.state === "done" && <CheckCircle className="h-3.5 w-3.5" />}
              {s.state === "failed" && <span className="text-[#f87171]">✕</span>}
              {s.state === "pending" && <span className="inline-block h-3.5 w-3.5 rounded-full border border-[#2a3441]" />}
              {s.label}
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="card border-[#991b1b] p-3 text-[13px] text-[#f87171]">
          {failedStep ? `${failedStep} failed: ` : ""}
          {error}
          <button onClick={() => runAnalyze(withoutMemory)} className="btn btn-secondary ml-3">
            Retry
          </button>
        </div>
      )}

      {/* Learning impact after resolve */}
      {learned && (
        <div className="card border-[#166534] p-3">
          <h3 className="flex items-center gap-2 text-[13px] font-semibold text-[#4ade80]">
            <Brain className="h-4 w-4" /> How this incident teaches OpsHindsight
          </h3>
          {learned.retained ? (
            <>
              <p className="mt-2 text-[12px] text-[#8b9cb3]">
                NEW MEMORY RETAINED · mode={learned.mode}
                {learned.memoryId ? ` · id=${learned.memoryId}` : ""}
              </p>
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded border border-[#2a3441] bg-[#0c1117] p-2 text-[12px] text-[#e6edf3]">
                {learned.contentPreview}
              </pre>
              <p className="mt-2 text-[12px] text-[#4ade80]">
                This knowledge is now available to future investigations via Hindsight recall.
              </p>
            </>
          ) : (
            <p className="mt-2 text-[13px] text-[#f87171]">
              Hindsight retain failed — resolution was saved in the application database but not taught to memory.
              {learned.error ? ` (${learned.error})` : ""}
            </p>
          )}
          <Link href="/incident/new?demo=1" className="mt-2 inline-block text-[13px] text-[#93c5fd] hover:underline">
            Start another similar incident →
          </Link>
        </div>
      )}

      {/* Memory impact comparison */}
      {analysis && withoutAnalysis && (
        <div className="card">
          <div className="card-header">Memory impact</div>
          <div className="grid gap-0 md:grid-cols-2">
            <div className="border-b border-[#2a3441] p-3 md:border-b-0 md:border-r">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#8b9cb3]">
                Without Hindsight
              </div>
              <p className="text-[13px] text-[#e6edf3]">
                <span className="text-[#5c6b7f]">Hypothesis: </span>
                {withoutAnalysis.hypotheses?.[0]?.cause || "—"}
              </p>
              <p className="mt-1 text-[13px] text-[#e6edf3]">
                <span className="text-[#5c6b7f]">Top step: </span>
                {withoutAnalysis.recommendedSteps?.[0]?.title || "—"}
              </p>
              <p className="mt-1 text-[13px]">
                <span className="text-[#5c6b7f]">Confidence: </span>
                <span className="text-[#fbbf24]">
                  {Math.round((withoutAnalysis.overallConfidence || 0) * 100)}%
                </span>
              </p>
            </div>
            <div className="p-3">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#93c5fd]">
                With Hindsight
              </div>
              <p className="text-[13px] text-[#e6edf3]">
                <span className="text-[#5c6b7f]">Hypothesis: </span>
                {analysis.hypotheses?.[0]?.cause || "—"}
              </p>
              <p className="mt-1 text-[13px] text-[#e6edf3]">
                <span className="text-[#5c6b7f]">Top step: </span>
                {analysis.recommendedSteps?.[0]?.title || "—"}
              </p>
              <p className="mt-1 text-[13px]">
                <span className="text-[#5c6b7f]">Confidence: </span>
                <span className="text-[#4ade80]">
                  {Math.round((analysis.overallConfidence || 0) * 100)}%
                </span>
              </p>
              {(analysis.similarIncidents?.length > 0) && (
                <p className="mt-1 text-[12px] text-[#8b9cb3]">
                  Historical: {analysis.similarIncidents.map((s: any) => s.incidentId).join(", ")}
                </p>
              )}
              {(analysis.relatedRunbooks?.length > 0) && (
                <p className="mt-0.5 text-[12px] text-[#8b9cb3]">
                  Runbooks: {analysis.relatedRunbooks.map((r: any) => r.name).join(", ")}
                </p>
              )}
            </div>
          </div>
          {whyChanged && (
            <div className="border-t border-[#2a3441] bg-[#12181f] p-3 text-[13px] text-[#e6edf3]">
              <span className="font-medium text-[#93c5fd]">Why memory changed the recommendation: </span>
              {whyChanged}
            </div>
          )}
        </div>
      )}

      {/* 3-column layout */}
      <div className="grid gap-3 lg:grid-cols-12">
        {/* LEFT */}
        <div className="space-y-3 lg:col-span-3">
          <div className="card">
            <div className="card-header">Incident details</div>
            <dl className="space-y-2 p-3 text-[13px]">
              <Row label="Alert" value={incident.alertType} />
              <Row label="Signature" value={incident.errorSignature} />
              <Row label="Impact" value={incident.customerImpact} />
            </dl>
            {incident.rawAlert && (
              <pre className="mx-3 mb-3 max-h-28 overflow-auto rounded border border-[#2a3441] bg-[#0c1117] p-2 text-[11px] text-[#8b9cb3]">
                {incident.rawAlert}
              </pre>
            )}
          </div>
          <div className="card">
            <div className="card-header">Timeline</div>
            <ul className="max-h-64 space-y-2 overflow-auto p-3 text-[12px]">
              {(incident.events || []).map((e: any) => (
                <li key={e.id} className="border-l-2 border-[#2a3441] pl-2">
                  <span className="font-mono text-[10px] text-[#5c6b7f]">
                    {new Date(e.timestamp).toLocaleTimeString()}
                  </span>
                  <div className="text-[#e6edf3]">
                    <Badge className="mr-1">{e.eventType}</Badge>
                    {e.content}
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex gap-2 border-t border-[#2a3441] p-2">
              <input
                value={observation}
                onChange={(e) => setObservation(e.target.value)}
                placeholder="Add observation…"
                className="input flex-1 !py-1.5"
              />
              <button onClick={addObservation} className="btn btn-secondary !px-2">
                <MessageSquare className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* CENTER */}
        <div className="space-y-3 lg:col-span-5">
          <div className="card">
            <div className="card-header">
              {withoutMemory ? "AI response (no memory)" : "AI incident response"}
            </div>
            <div className="p-3">
              {busy && !analysis && (
                <div className="flex items-center gap-2 text-[#8b9cb3]">
                  <Loader2 className="h-4 w-4 animate-spin" /> Searching historical incidents…
                </div>
              )}
              {analysis ? (
                <div className="space-y-3 text-[13px]">
                  <p className="text-[#e6edf3]">{analysis.incidentSummary}</p>
                  <Section title="Known facts">
                    <ul className="list-disc space-y-0.5 pl-4 text-[#8b9cb3]">
                      {(analysis.knownFacts || []).map((f: string, i: number) => (
                        <li key={i}>{f}</li>
                      ))}
                    </ul>
                  </Section>
                  <Section title="Hypotheses">
                    {(analysis.hypotheses || []).map((h: any, i: number) => (
                      <div key={i} className="mb-2 rounded border border-[#2a3441] bg-[#0c1117] p-2">
                        <div className="flex justify-between gap-2">
                          <span className="font-medium text-[#e6edf3]">{h.cause}</span>
                          <span className="text-[12px] text-[#93c5fd]">
                            {Math.round(h.confidence * 100)}%
                          </span>
                        </div>
                        {h.historicalSupport?.length > 0 && (
                          <p className="mt-1 text-[11px] text-[#8b9cb3]">
                            Historical: {h.historicalSupport.join("; ")}
                          </p>
                        )}
                      </div>
                    ))}
                  </Section>
                  <Section title="Recommended steps">
                    {(analysis.recommendedSteps || []).map((s: any) => (
                      <div key={s.order} className="mb-2 rounded border border-[#2a3441] p-2">
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-medium text-[#e6edf3]">
                            {s.order}. {s.title}
                          </span>
                          <CategoryBadge cat={s.category} />
                        </div>
                        <p className="mt-1 text-[12px] text-[#8b9cb3]">{s.description}</p>
                        <p className="mt-0.5 text-[11px] text-[#5c6b7f]">Expected: {s.expectedSignal}</p>
                      </div>
                    ))}
                  </Section>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-[#5c6b7f]">Confidence</span>
                    <div className="h-1.5 flex-1 rounded-full bg-[#1c2530]">
                      <div
                        className="h-1.5 rounded-full bg-[#3b82f6]"
                        style={{ width: `${Math.round((analysis.overallConfidence || 0) * 100)}%` }}
                      />
                    </div>
                    <span className="text-[12px] text-[#93c5fd]">
                      {Math.round((analysis.overallConfidence || 0) * 100)}%
                    </span>
                  </div>
                  <p className="text-[11px] text-[#5c6b7f]">{analysis.memoryExplanation}</p>
                </div>
              ) : (
                !busy && (
                  <p className="text-[13px] text-[#5c6b7f]">
                    Click Analyze or Compare Memory Impact to generate a response.
                  </p>
                )
              )}
            </div>
          </div>
        </div>

        {/* RIGHT */}
        <div className="space-y-3 lg:col-span-4">
          <div className="card">
            <div className="card-header">Hindsight Memory Activity</div>
            <div className="space-y-2 p-3 text-[13px]">
              {memoryTrace && (
                <div className="flex flex-wrap gap-1 mb-2">
                  <Badge variant={memoryTrace.recalled ? "success" : "outline"}>RECALL</Badge>
                  <Badge variant={memoryTrace.reflected ? "success" : "outline"}>REFLECT</Badge>
                  <Badge variant={memoryTrace.retained ? "success" : "outline"}>RETAIN</Badge>
                  <Badge variant={memoryTrace.mode === "live" ? "live" : "warning"}>
                    {memoryTrace.mode === "live" ? "LIVE HINDSIGHT" : String(memoryTrace.mode).toUpperCase()}
                  </Badge>
                </div>
              )}
              {/* Prefer persisted ops from DB; fall back to this-session trace */}
              {(incident.memoryOps?.length > 0
                ? incident.memoryOps
                : (memoryTrace?.operations || []).map((op: any, i: number) => ({
                    id: `session-${i}`,
                    operationType: op.operation,
                    status: op.status,
                    summary: op.summary,
                    durationMs: op.durationMs,
                    resultCount: op.operation === "recall" ? memoryTrace?.memoryCount : null,
                    createdAt: new Date().toISOString(),
                  }))
              ).map((op: any) => (
                <div key={op.id} className="rounded border border-[#2a3441] bg-[#0c1117] p-2 text-[11px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className={op.status === "success" ? "text-[#4ade80]" : op.status === "error" ? "text-[#f87171]" : "text-[#fbbf24]"}>
                      {op.status === "success" ? "✓" : op.status === "error" ? "✕" : "○"}{" "}
                      <span className="font-semibold uppercase">{op.operationType}</span>
                    </span>
                    <span className="font-mono text-[10px] text-[#5c6b7f]">
                      {op.createdAt ? new Date(op.createdAt).toLocaleTimeString() : ""}
                      {op.durationMs != null ? ` · ${op.durationMs}ms` : ""}
                    </span>
                  </div>
                  <p className="text-[#8b9cb3]">{op.summary}</p>
                  {op.resultCount != null && (
                    <p className="text-[#5c6b7f]">Retrieved {op.resultCount} memories</p>
                  )}
                </div>
              ))}
              {!incident.memoryOps?.length && !memoryTrace && (
                <p className="text-[#5c6b7f]">Run Analyze to log RECALL / REFLECT activity.</p>
              )}
            </div>
          </div>

          {/* Memory evidence */}
          {analysis && (
            <div className="card">
              <div className="card-header">Why OpsHindsight recommends this</div>
              <div className="space-y-2 p-3">
                {(analysis.similarIncidents || []).length === 0 &&
                !(memoryTrace?.memoryCount > 0) ? (
                  <p className="text-[12px] text-[#5c6b7f]">
                    No historical Hindsight memories influenced this response.
                  </p>
                ) : (
                  (analysis.similarIncidents || []).map((s: any, i: number) => (
                    <div key={i} className="rounded border border-[#1e3a5f] bg-[#12181f] p-2 text-[12px]">
                      <div className="font-mono text-[11px] text-[#93c5fd]">{s.incidentId}</div>
                      <p className="text-[#8b9cb3]">{s.similarityReason}</p>
                      <p className="mt-1 text-[#e6edf3]">
                        <span className="text-[#5c6b7f]">Root cause: </span>
                        {s.rootCause}
                      </p>
                      <p className="text-[#4ade80]">
                        Resolved in {s.timeToResolveMinutes}m — {s.resolution}
                      </p>
                    </div>
                  ))
                )}
                {(analysis.relatedRunbooks || []).map((r: any, i: number) => (
                  <div key={`rb-${i}`} className="text-[12px]">
                    <span className="font-medium text-[#e6edf3]">{r.name}</span>
                    <span className="ml-2 text-[#4ade80]">
                      {Math.round((r.successRate || 0) * 100)}% success
                    </span>
                    <p className="text-[11px] text-[#8b9cb3]">{r.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Resolve modal */}
      {resolveOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="card w-full max-w-lg space-y-3 p-4">
            <h3 className="text-[15px] font-semibold text-[#e6edf3]">
              Resolve & teach OpsHindsight
            </h3>
            <div className="rounded border border-[#2a3441] bg-[#0c1117] p-2 text-[12px] text-[#8b9cb3]">
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <span><span className="text-[#5c6b7f]">Incident:</span> <span className="font-mono text-[#e6edf3]">{incident.externalId}</span></span>
                <span><span className="text-[#5c6b7f]">Service:</span> <span className="font-medium text-[#93c5fd]">{incident.service}</span></span>
                <span><span className="text-[#5c6b7f]">Severity:</span> <span className="text-[#e6edf3]">{incident.severity}</span></span>
              </div>
              <p className="mt-1 text-[11px] text-[#5c6b7f]">
                Post-mortem will be retained for this service only. Edit fields if analysis prefill is wrong.
              </p>
            </div>
            <Field label="Root cause" value={rootCause} onChange={(v) => { setRootCause(v); setAcknowledgeMismatch(false); }} placeholder={`Root cause for ${incident.service}`} />
            <Field label="Successful resolution steps" value={successfulSteps} onChange={(v) => { setSuccessfulSteps(v); setAcknowledgeMismatch(false); }} placeholder="What fixed this incident" />
            <Field label="Runbook" value={runbook} onChange={(v) => { setRunbook(v); setAcknowledgeMismatch(false); }} placeholder={`${incident.service}-…`} />
            <Field label="Lessons learned" value={feedback} onChange={setFeedback} placeholder="What should future responders know?" />
            {consistencyWarnings().length > 0 && (
              <div className="rounded border border-[#92400e] bg-[#78350f]/20 p-2 text-[12px] text-[#fbbf24]">
                <div className="font-medium">Service consistency warning</div>
                <ul className="mt-1 list-disc pl-4">
                  {consistencyWarnings().map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
                <label className="mt-2 flex items-start gap-2 text-[#e6edf3]">
                  <input
                    type="checkbox"
                    checked={acknowledgeMismatch}
                    onChange={(e) => setAcknowledgeMismatch(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>I understand this may not match {incident.service} and still want to save.</span>
                </label>
              </div>
            )}
            <div>
              <div className="mb-1 text-[11px] text-[#8b9cb3]">Was this recommendation useful?</div>
              <div className="flex flex-wrap gap-2">
                {[
                  { v: "helpful", l: "Helpful" },
                  { v: "partially_helpful", l: "Partially helpful" },
                  { v: "not_helpful", l: "Not helpful" },
                ].map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => setFeedbackRating(o.v)}
                    className={`btn ${feedbackRating === o.v ? "btn-primary" : "btn-secondary"}`}
                  >
                    {o.l}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => { setResolveOpen(false); setAcknowledgeMismatch(false); }} className="btn btn-secondary">
                Cancel
              </button>
              <button onClick={resolve} className="btn btn-success">
                Save and teach
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-[#5c6b7f]">{label}</dt>
      <dd className="text-right text-[#e6edf3]">{value || "—"}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#5c6b7f]">
        {title}
      </h4>
      {children}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] text-[#8b9cb3]">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input"
      />
    </div>
  );
}

function CategoryBadge({ cat }: { cat: string }) {
  const map: Record<string, string> = {
    safe_diagnostic: "Safe diagnostic",
    low_risk_remediation: "Low-risk remediation",
    requires_approval: "Requires approval",
    do_not_execute_automatically: "Do not execute",
  };
  const variant =
    cat === "requires_approval" || cat === "do_not_execute_automatically"
      ? "warning"
      : "success";
  return <Badge variant={variant as any}>{map[cat] || cat}</Badge>;
}

export default function IncidentPage() {
  return (
    <Suspense fallback={<div className="text-[#8b9cb3]">Loading…</div>}>
      <Investigation />
    </Suspense>
  );
}

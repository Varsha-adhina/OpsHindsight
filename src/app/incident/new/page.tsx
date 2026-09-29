"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";

const EXAMPLES = [
  {
    id: "payment",
    label: "Payment API 5xx spike",
    text: "HTTP 5xx rate exceeded 18% on payments-api. Database connection pool utilization at 98%. Deployment PAY-2026.09.12.3 completed 8 minutes ago. Payment requests timed out. Latency increased after deployment.",
  },
  {
    id: "k8s",
    label: "Kubernetes CrashLoopBackOff",
    text: "Pod auth-service-7d8f9 in CrashLoopBackOff. Last state: Error. Missing JWT_SIGNING_KEY environment variable after chart upgrade.",
  },
  {
    id: "redis",
    label: "Redis connection exhaustion",
    text: "Redis max number of clients reached. New connections refused. Cache miss rate 94%. Unbounded client creation suspected in background job.",
  },
  {
    id: "auth",
    label: "Authentication latency increase",
    text: "auth-service p99 latency elevated to 2.4s. Token validation path slow. Possible expired signing-key cache.",
  },
];

function IntakeForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isDemo = searchParams.get("demo") === "1";

  const [mode, setMode] = useState<"form" | "paste">("paste");
  const [rawText, setRawText] = useState("");
  const [title, setTitle] = useState("");
  const [service, setService] = useState("");
  const [environment, setEnvironment] = useState("production");
  const [severity, setSeverity] = useState("SEV-1");
  const [alertType, setAlertType] = useState("");
  const [errorSignature, setErrorSignature] = useState("");
  const [recentDeployment, setRecentDeployment] = useState("");
  const [customerImpact, setCustomerImpact] = useState("high");
  const [parsing, setParsing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isDemo) {
      const ex = EXAMPLES[0];
      setRawText(ex.text);
      setMode("paste");
      // auto-parse
      handleParse(ex.text);
    }
  }, [isDemo]);

  async function handleParse(text?: string) {
    const t = text || rawText;
    if (!t.trim()) return;
    setParsing(true);
    setError(null);
    try {
      const res = await fetch("/api/incidents/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText: t }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Parse failed");
      const p = data.parsed;
      setTitle(p.title || "");
      setService(p.service || "");
      setEnvironment(p.environment || "production");
      setSeverity(p.severity || "SEV-2");
      setAlertType(p.alertType || "");
      setErrorSignature(p.errorSignature || "");
      setRecentDeployment(p.recentDeployment || "");
      setCustomerImpact(p.customerImpact || "medium");
      setMode("form");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setParsing(false);
    }
  }

  async function handleSubmit() {
    if (!title || !service) {
      setError("Title and service are required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          service,
          environment,
          severity,
          alertType,
          errorSignature,
          rawAlert: rawText || undefined,
          customerImpact,
          recentDeployment,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(JSON.stringify(data.error) || "Create failed");
      router.push(`/incident/${data.incident.id}?autoAnalyze=1${isDemo ? "&demo=1" : ""}`);
    } catch (e: any) {
      setError(e.message);
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-50">Incident Intake</h1>
        <p className="text-slate-400">Paste an alert or fill the form to start investigation with Hindsight memory.</p>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setMode("paste")} className={`rounded-md px-3 py-1.5 text-sm ${mode === "paste" ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-300"}`}>Paste alert</button>
        <button onClick={() => setMode("form")} className={`rounded-md px-3 py-1.5 text-sm ${mode === "form" ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-300"}`}>Form</button>
      </div>

      {mode === "paste" && (
        <div className="space-y-3 rounded-xl border border-slate-700 bg-slate-900/60 p-4">
          <textarea
            className="h-40 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-slate-200 placeholder:text-slate-600 focus:border-blue-500 focus:outline-none"
            placeholder="Paste PagerDuty / CloudWatch / K8s / Slack alert…"
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button key={ex.id} onClick={() => { setRawText(ex.text); }} className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700">
                {ex.label}
              </button>
            ))}
          </div>
          <button onClick={() => handleParse()} disabled={parsing || !rawText.trim()} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50">
            {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Parse Alert
          </button>
        </div>
      )}

      {mode === "form" && (
        <div className="space-y-4 rounded-xl border border-slate-700 bg-slate-900/60 p-4">
          <Field label="Title" value={title} onChange={setTitle} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Service" value={service} onChange={setService} />
            <Field label="Environment" value={environment} onChange={setEnvironment} />
            <div>
              <label className="mb-1 block text-xs text-slate-400">Severity</label>
              <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200">
                {["SEV-1", "SEV-2", "SEV-3", "SEV-4"].map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <Field label="Alert type" value={alertType} onChange={setAlertType} />
            <Field label="Error signature" value={errorSignature} onChange={setErrorSignature} />
            <Field label="Recent deployment" value={recentDeployment} onChange={setRecentDeployment} />
            <Field label="Customer impact" value={customerImpact} onChange={setCustomerImpact} />
          </div>
          <button onClick={handleSubmit} disabled={submitting} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Start Investigation
          </button>
        </div>
      )}

      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-slate-400">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none" />
    </div>
  );
}

export default function NewIncidentPage() {
  return (
    <Suspense fallback={<div className="text-slate-400">Loading…</div>}>
      <IntakeForm />
    </Suspense>
  );
}

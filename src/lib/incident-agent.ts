import { z } from "zod";
import { chatCompletion } from "./groq";
import {
  retainMemory,
  recallMemories,
  reflectOnIncident,
  BANK_ID,
  getMode,
} from "./hindsight";
import {
  AgentResponseSchema,
  type AgentResponse,
  type NormalizedIncident,
  type MemoryTrace,
  type HindsightMemory,
} from "@/types";
import { hasGroqKey } from "./utils";
import { logMemoryOperation } from "./memory-ops";

const SYSTEM_PROMPT = `You are OpsHindsight, an incident-response copilot for production engineering teams. Your job is to help engineers diagnose incidents safely using current evidence and historical operational memory from Hindsight.

Rules:
- Treat Hindsight memories as useful evidence, not absolute truth.
- Separate known facts from hypotheses.
- Prefer safe diagnostics before remediation.
- Never claim that an action was executed.
- Never recommend destructive or production-changing actions without clearly marking them as requiring human approval.
- If evidence is insufficient, say so clearly.
- Use historical incidents to identify patterns, successful runbooks, failed approaches, recurring root causes, and deployment correlations.
- Explain why each recommendation was made and cite the relevant memory or incident ID.
- Output ONLY valid JSON matching the required schema. No markdown fences.`;

function buildRecallQuery(incident: NormalizedIncident): string {
  const parts = [
    `Find historical incidents similar to a ${incident.severity} incident`,
    `on service ${incident.service}`,
    incident.environment ? `in ${incident.environment}` : null,
    incident.alertType ? `alert type ${incident.alertType}` : null,
    incident.errorSignature ? `error signature ${incident.errorSignature}` : null,
    incident.recentDeployment ? `after deployment ${incident.recentDeployment}` : null,
    ...(incident.symptoms || []).map((s) => `symptom: ${s}`),
    ...(incident.dependencies || []).map((d) => `dependency: ${d}`),
    "Include root causes, successful resolutions, failed approaches, and runbooks.",
  ].filter(Boolean);
  return parts.join(". ");
}

function demoAgentResponse(
  incident: NormalizedIncident,
  memories: HindsightMemory[],
  withoutMemory = false
): AgentResponse {
  const hasPaymentMemory =
    !withoutMemory &&
    memories.length > 0 &&
    memories.some(
      (m) =>
        m.content.toLowerCase().includes("inc-1042") ||
        m.content.toLowerCase().includes("connection") ||
        m.content.toLowerCase().includes("retry") ||
        m.content.toLowerCase().includes("payments-api")
    );

  if (hasPaymentMemory && incident.service.toLowerCase().includes("payment")) {
    return {
      incidentSummary: `SEV-1 payments-api 5xx spike after deployment ${incident.recentDeployment || "recent"}. Connection pool utilization high. Strong historical match to INC-1042 (connection leak in retry handler).`,
      knownFacts: [
        `Service: ${incident.service}`,
        `Environment: ${incident.environment}`,
        `Severity: ${incident.severity}`,
        incident.errorSignature
          ? `Error signature: ${incident.errorSignature}`
          : "HTTP 5xx rate elevated",
        incident.recentDeployment
          ? `Recent deployment: ${incident.recentDeployment}`
          : "Deployment correlation present",
        "Historical memory indicates prior connection-pool exhaustion after retry-handler changes",
      ],
      hypotheses: [
        {
          cause: "Retry-handler connection leak (failed to release DB connections)",
          confidence: 0.82,
          evidence: [
            "High connection pool utilization",
            "5xx spike shortly after deployment",
            "Matches INC-1042 pattern exactly",
          ],
          counterEvidence: ["Database health checks may still appear normal"],
          historicalSupport: ["INC-1042: same root cause, resolved by rollback + pod restart"],
        },
        {
          cause: "Upstream database outage or saturation",
          confidence: 0.18,
          evidence: ["Connection pool near capacity"],
          counterEvidence: [
            "Historical pattern points to application-level leak",
            "Prior similar incidents had healthy DB metrics",
          ],
          historicalSupport: [],
        },
      ],
      recommendedSteps: [
        {
          order: 1,
          title: "Inspect connection-pool utilization metrics",
          description:
            "Check payments-api connection pool gauge and active connections. Confirm if pool is exhausted and whether connections are released after retries complete.",
          category: "safe_diagnostic",
          risk: "low",
          expectedSignal: "Pool utilization >90% and climbing after request completion indicates leak",
          rollback: "N/A — read-only",
          sourceMemoryIds: memories.slice(0, 2).map((m) => m.id),
        },
        {
          order: 2,
          title: "Diff recent deployment for retry-handler changes",
          description: `Review deployment ${incident.recentDeployment || "PAY-*"} for changes to payment retry logic, especially connection lifecycle (acquire/release).`,
          category: "safe_diagnostic",
          risk: "low",
          expectedSignal: "Missing connection release in error/retry path",
          rollback: "N/A",
          sourceMemoryIds: memories.slice(0, 1).map((m) => m.id),
        },
        {
          order: 3,
          title: "Consider rollback of recent deployment",
          description:
            "If connection leak is confirmed, roll back the deployment after approval. Restart affected payment pods to drain leaked connections.",
          category: "requires_approval",
          risk: "medium",
          expectedSignal: "5xx rate drops; pool utilization recovers",
          rollback: "Re-deploy previous version if rollback causes regression",
          sourceMemoryIds: memories.slice(0, 1).map((m) => m.id),
        },
      ],
      relatedRunbooks: [
        {
          name: "payments-api-high-5xx-v2",
          reason: "Historically successful for post-deployment 5xx + pool exhaustion",
          successRate: 0.91,
          sourceMemoryIds: memories.slice(0, 1).map((m) => m.id),
        },
      ],
      similarIncidents: [
        {
          incidentId: "INC-1042",
          similarityReason:
            "Same service, 5xx spike, connection pool exhaustion after deployment involving retry handler",
          rootCause: "Retry-loop code path failed to release database connections",
          resolution: "Rolled back deployment, restarted pods, added regression test and pool alert",
          timeToResolveMinutes: 17,
          sourceMemoryIds: memories.slice(0, 1).map((m) => m.id),
        },
      ],
      customerImpact: "high",
      escalationRecommendation:
        "Escalate to payments on-call and platform if pool utilization does not improve within 10 minutes of diagnostics",
      overallConfidence: 0.84,
      memoryExplanation:
        "Hindsight recalled INC-1042 and related runbook memories. The recommendation prioritizes the historically successful path while requiring approval for rollback.",
      limitations: [
        "Current live metrics not available to the agent — verify pool gauges in your observability tool",
        "Deployment diff must be inspected by an engineer",
      ],
    };
  }

  // Generic response (no / suppressed memory)
  return {
    incidentSummary: `${incident.severity} incident on ${incident.service} in ${incident.environment}. Limited historical context available.`,
    knownFacts: [
      `Service: ${incident.service}`,
      `Environment: ${incident.environment}`,
      `Severity: ${incident.severity}`,
      incident.alertType ? `Alert type: ${incident.alertType}` : "Alert received",
      incident.errorSignature ? `Signature: ${incident.errorSignature}` : "No specific signature",
    ],
    hypotheses: [
      {
        cause: "Application-level regression after recent change",
        confidence: 0.4,
        evidence: incident.recentDeployment ? [`Recent deployment: ${incident.recentDeployment}`] : [],
        counterEvidence: [],
        historicalSupport: [],
      },
      {
        cause: "Dependency or infrastructure degradation",
        confidence: 0.35,
        evidence: incident.dependencies?.length ? [`Dependencies: ${incident.dependencies.join(", ")}`] : [],
        counterEvidence: [],
        historicalSupport: [],
      },
      {
        cause: "Traffic spike or capacity issue",
        confidence: 0.25,
        evidence: [],
        counterEvidence: [],
        historicalSupport: [],
      },
    ],
    recommendedSteps: [
      {
        order: 1,
        title: "Gather current service health metrics",
        description:
          "Check error rate, latency, saturation, and dependency health for the affected service in your observability platform.",
        category: "safe_diagnostic",
        risk: "low",
        expectedSignal: "Confirm elevated error rate and isolate whether it is app, dependency, or infra",
        rollback: "N/A",
        sourceMemoryIds: [],
      },
      {
        order: 2,
        title: "Inspect recent deployments and config changes",
        description: "List deployments and feature flags changed in the last 60 minutes for the service.",
        category: "safe_diagnostic",
        risk: "low",
        expectedSignal: "Correlation between change window and incident start",
        rollback: "N/A",
        sourceMemoryIds: [],
      },
      {
        order: 3,
        title: "Review application and dependency logs",
        description: "Search logs around the incident start for stack traces, timeouts, and connection errors.",
        category: "safe_diagnostic",
        risk: "low",
        expectedSignal: "Specific error signatures that narrow the root cause",
        rollback: "N/A",
        sourceMemoryIds: [],
      },
    ],
    relatedRunbooks: [],
    similarIncidents: [],
    customerImpact: (incident.customerImpact as AgentResponse["customerImpact"]) || "medium",
    escalationRecommendation:
      "If severity remains high after initial diagnostics and no clear path emerges, escalate to the service owner and incident commander.",
    overallConfidence: withoutMemory || memories.length === 0 ? 0.32 : 0.45,
    memoryExplanation: withoutMemory
      ? "Memory recall was intentionally suppressed (Without Memory demo mode). Response is based only on the current incident payload."
      : memories.length === 0
        ? "No relevant Hindsight memories were found for this query. Providing cautious generic guidance."
        : `Found ${memories.length} memories but none strongly matched the current pattern.`,
    limitations: [
      "Insufficient historical memory for a high-confidence diagnosis",
      "Verify all live metrics before taking remediation actions",
    ],
  };
}

export async function analyzeIncident(
  incident: NormalizedIncident,
  options?: {
    timeline?: string[];
    observations?: string[];
    withoutMemory?: boolean;
    incidentId?: string;
  }
): Promise<{ response: AgentResponse; memoryTrace: MemoryTrace }> {
  const operations: MemoryTrace["operations"] = [];
  const memoryIds: string[] = [];
  let memories: HindsightMemory[] = [];
  let retained = false;
  let recalled = false;
  let reflected = false;
  const mode = getMode();

  // 1. Retain initial context (meaningful facts only)
  const retainContent = [
    `Incident intake`,
    `Service: ${incident.service}`,
    `Environment: ${incident.environment}`,
    `Severity: ${incident.severity}`,
    incident.alertType ? `Alert: ${incident.alertType}` : null,
    incident.errorSignature ? `Error: ${incident.errorSignature}` : null,
    incident.recentDeployment ? `Deployment: ${incident.recentDeployment}` : null,
    incident.rawAlert ? `Raw: ${incident.rawAlert.slice(0, 500)}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const retainResult = await retainMemory({
    content: retainContent,
    documentId: options?.incidentId
      ? `intake-${options.incidentId}`
      : undefined,
    context: "incident_intake",
    metadata: {
      service: incident.service,
      severity: incident.severity,
      category: "intake",
      environment: incident.environment,
    },
    tags: [`service:${incident.service}`, "type:intake"],
  });
  operations.push({
    operation: "retain",
    status: retainResult.success ? "success" : "error",
    durationMs: retainResult.durationMs,
    summary: retainResult.success
      ? "Retained initial incident context"
      : retainResult.error || "retain failed",
  });
  // Persist to application DB immediately (dashboard source of truth)
  await logMemoryOperation({
    incidentId: options?.incidentId,
    operationType: "retain",
    status: retainResult.success ? "success" : "error",
    durationMs: retainResult.durationMs,
    resultCount: retainResult.success ? 1 : 0,
    query: options?.incidentId ? `intake:${options.incidentId}` : "intake",
    summary: retainResult.success
      ? "Retained initial incident context"
      : retainResult.error || "retain failed",
  });
  retained = retainResult.success;
  if (retainResult.memoryId) memoryIds.push(retainResult.memoryId);

  // 2. Recall
  if (!options?.withoutMemory) {
    const query = buildRecallQuery(incident);
    const recallResult = await recallMemories({
      query,
      limit: 8,
      filters: { service: incident.service },
    });
    memories = recallResult.memories;
    recalled = true;
    operations.push({
      operation: "recall",
      status: recallResult.error ? "error" : "success",
      durationMs: recallResult.durationMs,
      summary: recallResult.error
        ? recallResult.error
        : `Found ${memories.length} related memories`,
    });
    await logMemoryOperation({
      incidentId: options?.incidentId,
      operationType: "recall",
      status: recallResult.error ? "error" : "success",
      durationMs: recallResult.durationMs,
      resultCount: memories.length,
      query,
      summary: recallResult.error
        ? recallResult.error
        : `Found ${memories.length} related memories`,
    });
    memoryIds.push(...memories.map((m) => m.id));
  } else {
    operations.push({
      operation: "recall",
      status: "skipped",
      durationMs: 0,
      summary: "Memory recall suppressed (Without Memory mode)",
    });
    await logMemoryOperation({
      incidentId: options?.incidentId,
      operationType: "recall",
      status: "skipped",
      durationMs: 0,
      resultCount: 0,
      summary: "Memory recall suppressed (Without Memory mode)",
    });
  }

  // 3. Reflect context
  const reflectResult = await reflectOnIncident({
    incident,
    memories,
    timeline: options?.timeline,
    observations: options?.observations,
  });
  operations.push({
    operation: "reflect",
    status: "success",
    durationMs: reflectResult.durationMs,
    summary: memories.length
      ? `Prepared reflection using ${memories.length} recalled memories`
      : "Prepared reflection without recalled memories",
  });
  await logMemoryOperation({
    incidentId: options?.incidentId,
    operationType: "reflect",
    status: "success",
    durationMs: reflectResult.durationMs,
    resultCount: memories.length,
    query: options?.incidentId ? `reflect:${options.incidentId}` : "reflect",
    summary: memories.length
      ? `Prepared reflection using ${memories.length} recalled memories`
      : "Prepared reflection without recalled memories",
  });
  reflected = true;

  // 4. LLM synthesis (or demo fallback)
  let response: AgentResponse;

  if (hasGroqKey() && !options?.withoutMemory) {
    const userPrompt = `${reflectResult.reflection}

Produce a JSON object with exactly these keys:
incidentSummary, knownFacts, hypotheses, recommendedSteps, relatedRunbooks, similarIncidents, customerImpact, escalationRecommendation, overallConfidence, memoryExplanation, limitations.

Schema constraints:
- hypotheses[].confidence 0-1
- recommendedSteps[].category one of: safe_diagnostic | low_risk_remediation | requires_approval | do_not_execute_automatically
- recommendedSteps[].risk one of: low | medium | high
- customerImpact one of: none | low | medium | high | critical
- overallConfidence 0-1
- Cite sourceMemoryIds from the recalled memories where applicable.
- Prefer diagnostics first. Mark production-changing actions as requires_approval.
- Never claim actions were executed.`;

    const llm = await chatCompletion(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      { temperature: 0.15, maxTokens: 4096, json: true }
    );

    if (llm.content && !llm.error) {
      try {
        let parsed = JSON.parse(llm.content);
        const validated = AgentResponseSchema.safeParse(parsed);
        if (validated.success) {
          response = validated.data;
        } else {
          // one retry with correction
          const retry = await chatCompletion(
            [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: userPrompt },
              { role: "assistant", content: llm.content },
              {
                role: "user",
                content: `The previous JSON failed validation: ${validated.error.message}. Return corrected valid JSON only.`,
              },
            ],
            { temperature: 0.1, json: true }
          );
          if (retry.content) {
            const retryParsed = AgentResponseSchema.safeParse(JSON.parse(retry.content));
            response = retryParsed.success
              ? retryParsed.data
              : demoAgentResponse(incident, memories, options?.withoutMemory);
          } else {
            response = demoAgentResponse(incident, memories, options?.withoutMemory);
          }
        }
      } catch {
        response = demoAgentResponse(incident, memories, options?.withoutMemory);
      }
    } else {
      response = demoAgentResponse(incident, memories, options?.withoutMemory);
    }
  } else {
    response = demoAgentResponse(incident, memories, options?.withoutMemory);
  }

  const memoryTrace: MemoryTrace = {
    retained,
    recalled,
    reflected,
    bankId: BANK_ID,
    memoryCount: memories.length,
    memoryIds: [...new Set(memoryIds)],
    operations,
    mode: options?.withoutMemory ? "demo" : mode,
  };

  return { response, memoryTrace };
}

export async function parseAlertText(rawText: string): Promise<NormalizedIncident> {
  const lower = rawText.toLowerCase();

  // Deterministic parsers for demo examples
  if (lower.includes("payments-api") && (lower.includes("5xx") || lower.includes("connection pool"))) {
    return {
      title: "Payment API 5xx Spike After Deployment",
      service: "payments-api",
      environment: "production",
      severity: "SEV-1",
      alertType: "HTTP 5xx rate",
      errorSignature: "HTTP 5xx rate exceeded",
      rawAlert: rawText,
      recentDeployment: extractDeployment(rawText) || "PAY-2026.09.12.3",
      dependencies: ["postgres-primary", "redis-cache"],
      customerImpact: "high",
      symptoms: ["Payment requests timed out", "Database connection pool exhausted", "Elevated latency"],
    };
  }
  if (lower.includes("crashloopbackoff") || lower.includes("crashloop")) {
    return {
      title: "Kubernetes CrashLoopBackOff",
      service: detectService(rawText) || "auth-service",
      environment: "production",
      severity: "SEV-2",
      alertType: "Pod CrashLoopBackOff",
      errorSignature: "CrashLoopBackOff",
      rawAlert: rawText,
      symptoms: ["Container repeatedly restarting", "Possible missing env var"],
      customerImpact: "medium",
    };
  }
  if (lower.includes("redis") && (lower.includes("connection") || lower.includes("exhaust"))) {
    return {
      title: "Redis Connection Exhaustion",
      service: "redis-cache",
      environment: "production",
      severity: "SEV-1",
      alertType: "Connection exhaustion",
      errorSignature: "max number of clients reached",
      rawAlert: rawText,
      symptoms: ["Unbounded client creation", "Cache misses cascading"],
      customerImpact: "high",
    };
  }
  if (lower.includes("auth") && lower.includes("latency")) {
    return {
      title: "Authentication Latency Increase",
      service: "auth-service",
      environment: "production",
      severity: "SEV-2",
      alertType: "Latency",
      errorSignature: "p99 latency elevated",
      rawAlert: rawText,
      symptoms: ["Signing-key cache possibly expired"],
      customerImpact: "medium",
    };
  }

  // LLM parse if available
  if (hasGroqKey()) {
    const llm = await chatCompletion(
      [
        {
          role: "system",
          content:
            "Extract structured incident fields from the alert text. Return JSON with keys: title, service, environment, severity (SEV-1..SEV-4), alertType, errorSignature, recentDeployment, dependencies (array), customerImpact, symptoms (array).",
        },
        { role: "user", content: rawText.slice(0, 4000) },
      ],
      { json: true, temperature: 0.1 }
    );
    if (llm.content) {
      try {
        const p = JSON.parse(llm.content);
        return {
          title: p.title || "Parsed Incident",
          service: p.service || "unknown-service",
          environment: p.environment || "production",
          severity: ["SEV-1", "SEV-2", "SEV-3", "SEV-4"].includes(p.severity)
            ? p.severity
            : "SEV-2",
          alertType: p.alertType,
          errorSignature: p.errorSignature,
          rawAlert: rawText,
          recentDeployment: p.recentDeployment,
          dependencies: p.dependencies || [],
          customerImpact: p.customerImpact,
          symptoms: p.symptoms || [],
        };
      } catch {
        /* fall through */
      }
    }
  }

  return {
    title: "Incident from pasted alert",
    service: detectService(rawText) || "unknown-service",
    environment: "production",
    severity: lower.includes("sev-1") || lower.includes("critical") ? "SEV-1" : "SEV-2",
    alertType: "unknown",
    rawAlert: rawText,
    symptoms: [],
    customerImpact: "medium",
  };
}

function detectService(text: string): string | null {
  const services = [
    "payments-api",
    "auth-service",
    "checkout-service",
    "inventory-service",
    "notification-service",
    "orders-api",
    "redis-cache",
    "postgres-primary",
    "kubernetes-platform",
  ];
  const lower = text.toLowerCase();
  return services.find((s) => lower.includes(s)) || null;
}

function extractDeployment(text: string): string | null {
  const m = text.match(/PAY-[\d.]+|deploy[a-z0-9._-]+/i);
  return m ? m[0] : null;
}

export async function buildResolutionMemory(params: {
  externalId: string;
  service: string;
  severity: string;
  rootCause: string;
  successfulSteps: string;
  failedSteps?: string;
  runbook?: string;
  durationMinutes?: number;
  lessons?: string;
  preventiveActions?: string;
}): Promise<string> {
  return [
    `Incident ID: ${params.externalId}`,
    `Service: ${params.service}`,
    `Severity: ${params.severity}`,
    `Root cause: ${params.rootCause}`,
    `Successful resolution: ${params.successfulSteps}`,
    params.failedSteps ? `Failed approaches: ${params.failedSteps}` : null,
    params.runbook ? `Runbook: ${params.runbook}` : null,
    params.durationMinutes != null ? `Resolved in ${params.durationMinutes} minutes.` : null,
    params.lessons ? `Lessons: ${params.lessons}` : null,
    params.preventiveActions ? `Preventive actions: ${params.preventiveActions}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

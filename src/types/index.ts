import { z } from "zod";

export const SeveritySchema = z.enum(["SEV-1", "SEV-2", "SEV-3", "SEV-4"]);
export type Severity = z.infer<typeof SeveritySchema>;

export const StatusSchema = z.enum([
  "active",
  "investigating",
  "mitigating",
  "resolved",
  "escalated",
]);
export type Status = z.infer<typeof StatusSchema>;

export const StepCategorySchema = z.enum([
  "safe_diagnostic",
  "low_risk_remediation",
  "requires_approval",
  "do_not_execute_automatically",
]);
export type StepCategory = z.infer<typeof StepCategorySchema>;

export const HypothesisSchema = z.object({
  cause: z.string(),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string()),
  counterEvidence: z.array(z.string()),
  historicalSupport: z.array(z.string()),
});

export const RecommendedStepSchema = z.object({
  order: z.number(),
  title: z.string(),
  description: z.string(),
  category: StepCategorySchema,
  risk: z.enum(["low", "medium", "high"]),
  expectedSignal: z.string(),
  rollback: z.string(),
  sourceMemoryIds: z.array(z.string()),
});

export const RelatedRunbookSchema = z.object({
  name: z.string(),
  reason: z.string(),
  successRate: z.number(),
  sourceMemoryIds: z.array(z.string()),
});

export const SimilarIncidentSchema = z.object({
  incidentId: z.string(),
  similarityReason: z.string(),
  rootCause: z.string(),
  resolution: z.string(),
  timeToResolveMinutes: z.number(),
  sourceMemoryIds: z.array(z.string()),
});

export const AgentResponseSchema = z.object({
  incidentSummary: z.string(),
  knownFacts: z.array(z.string()),
  hypotheses: z.array(HypothesisSchema),
  recommendedSteps: z.array(RecommendedStepSchema),
  relatedRunbooks: z.array(RelatedRunbookSchema),
  similarIncidents: z.array(SimilarIncidentSchema),
  customerImpact: z.enum(["none", "low", "medium", "high", "critical"]),
  escalationRecommendation: z.string(),
  overallConfidence: z.number().min(0).max(1),
  memoryExplanation: z.string(),
  limitations: z.array(z.string()),
});

export type AgentResponse = z.infer<typeof AgentResponseSchema>;

export const MemoryTraceSchema = z.object({
  retained: z.boolean(),
  recalled: z.boolean(),
  reflected: z.boolean(),
  bankId: z.string(),
  memoryCount: z.number(),
  memoryIds: z.array(z.string()),
  operations: z.array(
    z.object({
      operation: z.string(),
      status: z.string(),
      durationMs: z.number(),
      summary: z.string(),
    })
  ),
  mode: z.enum(["live", "demo", "fallback"]).optional(),
});

export type MemoryTrace = z.infer<typeof MemoryTraceSchema>;

export interface NormalizedIncident {
  title: string;
  service: string;
  environment: string;
  severity: Severity;
  alertType?: string;
  errorSignature?: string;
  rawAlert?: string;
  logs?: string;
  recentDeployment?: string;
  dependencies?: string[];
  customerImpact?: string;
  symptoms?: string[];
}

export interface HindsightMemory {
  id: string;
  content: string;
  score?: number;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

export interface RetainInput {
  content: string;
  metadata?: Record<string, unknown>;
}

export interface RecallInput {
  query: string;
  limit?: number;
  filters?: Record<string, string>;
}

export interface ReflectInput {
  incident: NormalizedIncident;
  memories: HindsightMemory[];
  timeline?: string[];
  observations?: string[];
}

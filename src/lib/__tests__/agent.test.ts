import { describe, it, expect } from "vitest";
import { AgentResponseSchema } from "@/types";
import { buildResolutionMemory } from "@/lib/incident-agent";

describe("AgentResponseSchema", () => {
  it("validates a minimal valid response", () => {
    const sample = {
      incidentSummary: "test",
      knownFacts: ["a"],
      hypotheses: [{ cause: "x", confidence: 0.5, evidence: [], counterEvidence: [], historicalSupport: [] }],
      recommendedSteps: [{
        order: 1, title: "t", description: "d", category: "safe_diagnostic",
        risk: "low", expectedSignal: "s", rollback: "n/a", sourceMemoryIds: [],
      }],
      relatedRunbooks: [],
      similarIncidents: [],
      customerImpact: "medium",
      escalationRecommendation: "none",
      overallConfidence: 0.4,
      memoryExplanation: "demo",
      limitations: [],
    };
    expect(AgentResponseSchema.safeParse(sample).success).toBe(true);
  });
});

describe("buildResolutionMemory", () => {
  it("includes incident id and root cause", async () => {
    const text = await buildResolutionMemory({
      externalId: "INC-1",
      service: "payments-api",
      severity: "SEV-1",
      rootCause: "leak",
      successfulSteps: "rollback",
    });
    expect(text).toContain("INC-1");
    expect(text).toContain("leak");
  });
});

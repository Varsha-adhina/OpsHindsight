# MemoraX

**A Memory-Powered Incident Response Agent**

Resolve incidents faster with an AI responder that remembers what worked before.

MemoraX is an AI incident-response copilot that uses **Hindsight by Vectorize** as its core persistent memory system. It recalls similar past incidents, root causes, runbooks, and successful fixes — then learns from every resolution.

## Why this exists

When production incidents hit, engineers waste time searching old tickets, Slack, runbooks, and postmortems. Generic AI assistants suggest common fixes but do not know *your* infrastructure, prior incidents, or which steps actually worked. MemoraX closes that gap with retain → recall → reflect memory.

## Features

- Incident intake (form + paste alert + LLM parse)
- Hindsight-backed analysis (similar incidents, runbooks, confidence)
- “Without Memory” comparison for demos
- Timeline observations that feed memory
- Structured resolution that **retains** lessons in Hindsight
- Memory Explorer and Learning Analytics
- Demo mode with 12 seeded realistic incidents
- Advisory-only: never executes production actions

## Architecture

```mermaid
flowchart LR

  UI[Next.js App Router UI] --> API[API Routes]

  API --> Agent[Incident Agent]

  Agent --> Hindsight[Hindsight Memory]

  Agent --> Groq[Groq LLM]

  API --> DB[(SQLite / Prisma)]

  Hindsight --> Retain[Retain]

  Hindsight --> Recall[Recall]

  Hindsight --> Reflect[Reflect + LLM synthesis]
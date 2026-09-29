import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function severityColor(sev: string): string {
  switch (sev) {
    case "SEV-1":
      return "border-[#991b1b] bg-[#7f1d1d]/40 text-[#f87171]";
    case "SEV-2":
      return "border-[#9a3412] bg-[#7c2d12]/40 text-[#fb923c]";
    case "SEV-3":
      return "border-[#92400e] bg-[#78350f]/30 text-[#fbbf24]";
    default:
      return "border-[#2a3441] bg-[#1c2530] text-[#8b9cb3]";
  }
}

export function statusColor(status: string): string {
  switch (status) {
    case "active":
    case "investigating":
      return "border-[#991b1b] bg-[#7f1d1d]/40 text-[#f87171]";
    case "mitigating":
      return "border-[#92400e] bg-[#78350f]/30 text-[#fbbf24]";
    case "resolved":
      return "border-[#166534] bg-[#14532d]/40 text-[#4ade80]";
    case "escalated":
      return "border-[#6b21a8] bg-[#581c87]/40 text-[#c084fc]";
    default:
      return "border-[#2a3441] bg-[#1c2530] text-[#8b9cb3]";
  }
}

export function isDemoMode(): boolean {
  // Explicit DEMO_MODE=true forces demo.
  // Missing API key also forces demo so we never silently call Hindsight without credentials.
  if (process.env.DEMO_MODE === "true") return true;
  if (!process.env.HINDSIGHT_API_KEY || process.env.HINDSIGHT_API_KEY.length < 5) return true;
  return false;
}

export function hasGroqKey(): boolean {
  return Boolean(process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.length > 10);
}

export function hasHindsightKey(): boolean {
  return Boolean(process.env.HINDSIGHT_API_KEY && process.env.HINDSIGHT_API_KEY.length > 5);
}

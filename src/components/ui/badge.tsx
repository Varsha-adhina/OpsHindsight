import { cn } from "@/lib/utils";

const variants: Record<string, string> = {
  default: "border-[#2a3441] bg-[#1c2530] text-[#8b9cb3]",
  outline: "border-[#2a3441] bg-transparent text-[#8b9cb3]",
  success: "border-[#166534] bg-[#14532d]/40 text-[#4ade80]",
  warning: "border-[#92400e] bg-[#78350f]/30 text-[#fbbf24]",
  danger: "border-[#991b1b] bg-[#7f1d1d]/40 text-[#f87171]",
  info: "border-[#1e40af] bg-[#1e3a5f]/50 text-[#93c5fd]",
  live: "border-[#166534] bg-[#14532d]/40 text-[#4ade80]",
};

export function Badge({
  children,
  className,
  variant = "default",
}: {
  children: React.ReactNode;
  className?: string;
  variant?: keyof typeof variants;
}) {
  return (
    <span className={cn("badge", variants[variant] || variants.default, className)}>
      {children}
    </span>
  );
}

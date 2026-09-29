"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  AlertTriangle,
  Brain,
  LineChart,
  Settings,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/incident/new", label: "New Incident", icon: AlertTriangle },
  { href: "/memory", label: "Memory", icon: Brain },
  { href: "/learning", label: "Learning", icon: LineChart },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-[#2a3441] bg-[#0c1117]">
      <div className="mx-auto flex h-12 max-w-[1400px] items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-[#e6edf3]">
          <Shield className="h-4 w-4 text-[#3b82f6]" />
          MemoraX
        </Link>
        <nav className="flex items-center gap-0.5">
          {links.map(({ href, label, icon: Icon }) => {
            const active =
              pathname === href || (href !== "/" && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-1.5 rounded px-2.5 py-1.5 text-[13px] transition-colors",
                  active
                    ? "bg-[#1e3a5f] text-[#93c5fd]"
                    : "text-[#8b9cb3] hover:bg-[#1c2530] hover:text-[#e6edf3]"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="border-t border-[#2a3441] bg-[#12181f] px-4 py-1 text-center text-[11px] text-[#8b9cb3]">
        Advisory mode — MemoraX does not execute production actions
      </div>
    </header>
  );
}

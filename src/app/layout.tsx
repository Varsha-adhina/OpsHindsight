import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/nav";

export const metadata: Metadata = {
  title: "MemoraX — AI Incident Response That Learns",
  description:
    "Resolve incidents faster with an AI responder that remembers what worked before. Powered by Hindsight memory.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">
        <Nav />
        <main className="mx-auto max-w-[1400px] px-4 py-5">{children}</main>
      </body>
    </html>
  );
}

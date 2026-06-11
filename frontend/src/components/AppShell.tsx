"use client";

import { Activity, Camera, Home, MessageCircle, Shield, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getMe } from "@/lib/ascendApi";

export function AppShell({ children, active }: { children: React.ReactNode; active: "client" | "trainer" | "admin" }) {
  const [roles, setRoles] = useState<string[]>([]);

  useEffect(() => {
    getMe()
      .then((response) => setRoles(response.roles))
      .catch(() => setRoles(["client"]));
  }, []);

  const items = useMemo(() => {
    const canTrain = roles.some((role) => ["trainer", "admin", "owner"].includes(role));
    const canAdmin = roles.some((role) => ["admin", "owner"].includes(role));

    return [
      { href: "/dashboard", label: "Home", icon: Home, key: "client", show: true },
      { href: "/trainer", label: "Trainer", icon: Users, key: "trainer", show: canTrain || active === "trainer" },
      { href: "/admin", label: "Admin", icon: Shield, key: "admin", show: canAdmin || active === "admin" }
    ].filter((item) => item.show);
  }, [active, roles]);

  return (
    <main className="min-h-screen bg-ink pb-24 text-white">
      <div className="mx-auto min-h-screen w-full max-w-md px-4 pt-4">
        <header className="flex items-center justify-between py-3">
          <Link href="/" className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-lime text-ink">
              <Activity size={20} strokeWidth={2.5} />
            </span>
            <span>
              <span className="block text-lg font-semibold leading-5">Ascend</span>
              <span className="text-xs text-zinc-400">Anytime Fitness launch</span>
            </span>
          </Link>
          <Link href="/coach" className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-surface" aria-label="Open coach">
            <MessageCircle size={19} />
          </Link>
        </header>
        {children}
      </div>
      <nav className="fixed inset-x-0 bottom-0 border-t border-line bg-ink/95 px-4 pb-3 pt-2 backdrop-blur">
        <div className={`mx-auto grid max-w-md gap-2 ${items.length === 1 ? "grid-cols-1" : items.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
          {items.map((item) => {
            const Icon = item.icon;
            const selected = active === item.key;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex h-14 flex-col items-center justify-center gap-1 rounded-lg text-xs ${
                  selected ? "bg-lime text-ink" : "text-zinc-400"
                }`}
              >
                <Icon size={19} />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
      <Link
        href="/food-log"
        className="fixed bottom-24 right-5 grid h-14 w-14 place-items-center rounded-full bg-lime text-ink shadow-xl shadow-lime/20"
        aria-label="Log food photo"
      >
        <Camera size={24} />
      </Link>
    </main>
  );
}

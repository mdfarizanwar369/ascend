"use client";

import { Camera, CircleHelp, Crown, Home, MessageCircle, Shield, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AccountBar } from "@/components/AccountBar";
import { BackButton } from "@/components/BackButton";
import { BrandMark } from "@/components/BrandMark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getCachedAccountProfile, loadAccountPlan, loadAccountProfile } from "@/lib/accountSession";

export function AppShell({ children, active }: { children: React.ReactNode; active: "client" | "trainer" | "admin" | "founder" }) {
  const [account, setAccount] = useState<{
    email?: string;
    fullName?: string;
    roles?: string[];
    isPlatformOwner?: boolean;
    plan?: "free" | "premium" | "trainer_pro";
    profilePhotoUrl?: string | null;
  }>({});
  const roles = account.roles ?? [];
  const canTrain = roles.some((role) => ["trainer", "admin", "owner"].includes(role));
  const canAdmin = roles.some((role) => ["admin", "owner"].includes(role));
  const canFounder = account.isPlatformOwner === true;
  const items = [
    { href: "/dashboard", label: "Home", icon: Home, key: "client", show: true },
    { href: "/trainer", label: "Trainer", icon: Users, key: "trainer", show: canTrain },
    { href: "/admin", label: "Admin", icon: Shield, key: "admin", show: canAdmin },
    { href: "/founder", label: "Founder", icon: Crown, key: "founder", show: canFounder }
  ].filter((item) => item.show);
  const backHref = active === "founder" ? "/founder" : active === "admin" ? "/admin" : active === "trainer" ? "/trainer" : "/dashboard";
  const isOperational = active !== "client";

  useEffect(() => {
    let isMounted = true;

    async function loadAccount() {
      try {
        const cached = getCachedAccountProfile();
        if (cached && isMounted) {
          setAccount((current) => ({ ...current, ...cached }));
        }

        const profile = await loadAccountProfile();
        if (!isMounted) return;
        setAccount((current) => ({ ...current, ...profile }));

        const plan = await loadAccountPlan().catch(() => "free" as const);
        if (!isMounted) return;
        setAccount((current) => ({ ...current, plan }));
      } catch {
        if (isMounted) setAccount({});
      }
    }

    loadAccount();
    window.addEventListener("pageshow", loadAccount);

    return () => {
      isMounted = false;
      window.removeEventListener("pageshow", loadAccount);
    };
  }, []);

  return (
    <main className="ascend-page pb-24 text-white md:pb-8">
      <div className={`${isOperational ? "ascend-workspace-frame" : "ascend-member-frame"} min-h-screen px-4 pt-2 sm:px-5`}>
        <header className="ascend-shell-header flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BackButton fallbackHref={backHref} />
            <Link href="/dashboard" className="flex items-center gap-2">
              <BrandMark size="sm" />
              <span>
                <span className="block text-lg font-semibold leading-5">Ascend</span>
                <span className="hidden text-xs text-zinc-400 sm:block">Accountability between sessions</span>
              </span>
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link href="/contact" className="ascend-pressable grid h-11 w-11 place-items-center rounded-xl border border-line bg-surface" aria-label="Get support">
              <CircleHelp size={19} />
            </Link>
            <Link
              href={isOperational ? "/messages" : "/coach"}
              className="ascend-pressable grid h-11 w-11 place-items-center rounded-xl border border-line bg-surface"
              aria-label={isOperational ? "Open messages" : "Open coach"}
            >
              <MessageCircle size={19} />
            </Link>
          </div>
        </header>
        <div className={isOperational ? "ascend-operational-layout" : undefined}>
          {isOperational ? (
            <aside className="hidden md:block">
              <AccountBar email={account.email} fullName={account.fullName} roles={account.roles} plan={account.plan} profilePhotoUrl={account.profilePhotoUrl} />
              <nav aria-label="Role navigation" className="ascend-operational-nav mt-4">
                {items.map((item) => {
                  const Icon = item.icon;
                  const selected = active === item.key;
                  return (
                    <Link key={item.href} href={item.href} aria-current={selected ? "page" : undefined} className={`ascend-nav-item flex items-center gap-3 px-3 text-sm font-semibold ${selected ? "bg-lime text-ink" : "text-zinc-400 hover:bg-surface hover:text-white"}`}>
                      <Icon size={18} />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </aside>
          ) : null}
          <div className="ascend-workspace-content">
            <div className={isOperational ? "md:hidden" : undefined}>
              <AccountBar email={account.email} fullName={account.fullName} roles={account.roles} plan={account.plan} profilePhotoUrl={account.profilePhotoUrl} />
            </div>
            {children}
          </div>
        </div>
      </div>
      <nav aria-label="Primary navigation" className="ascend-bottom-nav fixed inset-x-0 bottom-0 z-40 border-t border-line px-4 pt-2 backdrop-blur md:hidden">
        <div className={`mx-auto grid max-w-md gap-2 ${items.length === 1 ? "grid-cols-1" : items.length === 2 ? "grid-cols-2" : items.length === 3 ? "grid-cols-3" : "grid-cols-4"}`}>
          {items.map((item) => {
            const Icon = item.icon;
            const selected = active === item.key;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={selected ? "page" : undefined}
                className={`ascend-nav-item flex flex-col items-center justify-center gap-1 px-1 text-center text-[10px] leading-tight sm:text-xs ${
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
      {active === "client" ? (
        <Link
          href="/food-log"
          className="ascend-pressable fixed bottom-24 right-5 z-30 grid h-14 w-14 place-items-center rounded-full bg-lime text-ink shadow-xl shadow-lime/20 md:bottom-6 md:right-6"
          aria-label="Log food photo"
        >
          <Camera size={24} />
        </Link>
      ) : null}
    </main>
  );
}

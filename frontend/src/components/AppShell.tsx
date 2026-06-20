"use client";

import { Camera, CircleHelp, Home, MessageCircle, Shield, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AccountBar } from "@/components/AccountBar";
import { BackButton } from "@/components/BackButton";
import { BrandMark } from "@/components/BrandMark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getMe, getMySubscription } from "@/lib/ascendApi";
import { usablePlan } from "@/lib/subscriptionPlan";

export function AppShell({ children, active }: { children: React.ReactNode; active: "client" | "trainer" | "admin" }) {
  const [account, setAccount] = useState<{
    email?: string;
    fullName?: string;
    roles?: string[];
    plan?: "free" | "premium" | "trainer_pro";
    profilePhotoUrl?: string | null;
  }>({});
  const roles = account.roles ?? [];
  const canTrain = roles.some((role) => ["trainer", "admin", "owner"].includes(role));
  const canAdmin = roles.some((role) => ["admin", "owner"].includes(role));
  const items = [
    { href: "/dashboard", label: "Home", icon: Home, key: "client", show: true },
    { href: "/trainer", label: "Trainer", icon: Users, key: "trainer", show: canTrain },
    { href: "/admin", label: "Admin", icon: Shield, key: "admin", show: canAdmin }
  ].filter((item) => item.show);
  const backHref = active === "admin" ? "/admin" : active === "trainer" ? "/trainer" : "/dashboard";

  useEffect(() => {
    let isMounted = true;

    function loadAccount() {
      Promise.allSettled([getMe(), getMySubscription()])
      .then(([meResult, subscriptionResult]) => {
        if (!isMounted) return;
        const me = meResult.status === "fulfilled" ? meResult.value : null;
        const subscription = subscriptionResult.status === "fulfilled" ? subscriptionResult.value : null;

        setAccount({
          email: me?.user.email,
          fullName: me?.user.full_name,
          roles: me?.roles ?? [],
          profilePhotoUrl: me?.user.profile_photo_url,
          plan: subscription
            ? usablePlan(subscription.subscription.plan, subscription.subscription.status, subscription.subscription.current_period_end)
            : "free"
        });
      })
      .catch(() => {
        if (isMounted) setAccount({});
      });
    }

    loadAccount();
    window.addEventListener("pageshow", loadAccount);

    return () => {
      isMounted = false;
      window.removeEventListener("pageshow", loadAccount);
    };
  }, []);

  return (
    <main className="min-h-screen bg-ink pb-24 text-white">
      <div className="mx-auto min-h-screen w-full max-w-md px-4 pt-4">
        <header className="flex items-center justify-between py-3">
          <div className="flex items-center gap-2">
            <BackButton fallbackHref={backHref} />
            <Link href="/" className="flex items-center gap-2">
              <BrandMark size="sm" />
              <span>
                <span className="block text-lg font-semibold leading-5">Ascend</span>
                <span className="text-xs text-zinc-400">Accountability between sessions</span>
              </span>
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link href="/contact" className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-surface" aria-label="Get support">
              <CircleHelp size={19} />
            </Link>
            <Link href="/coach" className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-surface" aria-label="Open coach">
              <MessageCircle size={19} />
            </Link>
          </div>
        </header>
        <AccountBar email={account.email} fullName={account.fullName} roles={account.roles} plan={account.plan} profilePhotoUrl={account.profilePhotoUrl} />
        {children}
      </div>
      <nav aria-label="Primary navigation" className="fixed inset-x-0 bottom-0 border-t border-line bg-ink/95 px-4 pb-3 pt-2 backdrop-blur">
        <div className={`mx-auto grid max-w-md gap-2 ${items.length === 1 ? "grid-cols-1" : items.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
          {items.map((item) => {
            const Icon = item.icon;
            const selected = active === item.key;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={selected ? "page" : undefined}
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

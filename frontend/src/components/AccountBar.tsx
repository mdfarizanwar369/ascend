"use client";

import { LogOut } from "lucide-react";
import { signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SubscriptionPlan } from "@ascend/shared";
import { getFirebaseClientAuth } from "@/lib/firebase";
import { formatPlan } from "@/lib/subscriptionPlan";
import { clearCachedAccountProfile } from "@/lib/accountSession";
import { disableCoachNotifications } from "@/lib/coachNotifications";
import Link from "next/link";
import { ProfileAvatar } from "@/components/ProfileAvatar";

function displayName(fullName?: string | null, email?: string | null) {
  const trimmedName = fullName?.trim();
  if (trimmedName) return trimmedName;
  return email ?? "Signed in";
}

function withTimeout<T>(promise: Promise<T>, ms: number) {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      window.setTimeout(() => reject(new Error("timeout")), ms);
    })
  ]);
}

function roleAccessLabel(roles: string[]) {
  if (roles.includes("owner")) return "Owner access";
  if (roles.includes("admin")) return "Admin access";
  if (roles.includes("trainer")) return "Trainer access";
  return null;
}

function accountAccessLabel({
  email,
  fullName,
  roles,
  plan
}: {
  email?: string | null;
  fullName?: string | null;
  roles?: string[];
  plan?: SubscriptionPlan | null;
}) {
  if (!email && !fullName) return "Checking access...";

  const normalizedRoles = roles?.map((role) => role.toLowerCase()) ?? [];
  const roleLabel = roleAccessLabel(normalizedRoles);
  if (!roleLabel) return plan ? formatPlan(plan) : "Checking plan...";

  return plan && plan !== "free" ? `${roleLabel} / ${formatPlan(plan)}` : roleLabel;
}

export function AccountBar({
  email,
  fullName,
  roles,
  plan,
  profilePhotoUrl
}: {
  email?: string | null;
  fullName?: string | null;
  roles?: string[];
  plan?: SubscriptionPlan | null;
  profilePhotoUrl?: string | null;
}) {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function handleLogout() {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    clearCachedAccountProfile();
    window.sessionStorage.clear();

    try {
      const { isNativeAndroidCapacitor } = await import("@/lib/nativePlatform");
      const cleanupTasks: Promise<unknown>[] = [
        withTimeout(disableCoachNotifications(), 2_500).catch(() => undefined),
        withTimeout(signOut(getFirebaseClientAuth()), 4_000).catch(() => undefined)
      ];

      if (isNativeAndroidCapacitor()) {
        const { FirebaseAuthentication } = await import("@capacitor-firebase/authentication");
        cleanupTasks.unshift(withTimeout(FirebaseAuthentication.signOut(), 4_000).catch(() => undefined));
      }

      await Promise.allSettled(cleanupTasks);
    } catch {
      await Promise.allSettled([
        withTimeout(disableCoachNotifications(), 2_500).catch(() => undefined),
        withTimeout(signOut(getFirebaseClientAuth()), 4_000).catch(() => undefined)
      ]);
    } finally {
      router.replace("/login");
      window.setTimeout(() => {
        window.location.replace("/login");
      }, 150);
    }
  }

  const accessLabel = accountAccessLabel({ email, fullName, roles, plan });

  return (
    <div className="ascend-card ascend-soft-enter mt-3 flex items-center justify-between gap-3 rounded-lg border border-line bg-surface/95 p-3">
      <div className="flex min-w-0 items-center gap-3">
        <Link href="/profile" aria-label="Open profile">
          <ProfileAvatar src={profilePhotoUrl} name={displayName(fullName, email)} size="sm" />
        </Link>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{displayName(fullName, email)}</p>
          <p className="mt-1 text-xs text-zinc-400">{accessLabel}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={handleLogout}
        disabled={isLoggingOut}
        className="ascend-pressable grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-line bg-ink text-zinc-100 hover:border-calm/50"
        aria-label="Log out"
      >
        <LogOut size={18} />
      </button>
    </div>
  );
}

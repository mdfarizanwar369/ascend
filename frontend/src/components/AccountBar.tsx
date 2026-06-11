"use client";

import { LogOut } from "lucide-react";
import { signOut } from "firebase/auth";
import { SubscriptionPlan } from "@ascend/shared";
import { getFirebaseClientAuth } from "@/lib/firebase";
import { formatPlan } from "@/lib/subscriptionPlan";

function displayName(fullName?: string | null, email?: string | null) {
  const trimmedName = fullName?.trim();
  if (trimmedName) return trimmedName;
  return email ?? "Signed in";
}

export function AccountBar({
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
  async function handleLogout() {
    await signOut(getFirebaseClientAuth());
    window.location.href = "/login";
  }

  const accessLabel = roles?.some((role) => role === "owner" || role === "admin")
    ? `Owner access / ${formatPlan(plan)}`
    : formatPlan(plan);

  return (
    <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-line bg-surface p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{displayName(fullName, email)}</p>
        <p className="mt-1 text-xs text-zinc-400">{accessLabel}</p>
      </div>
      <button
        type="button"
        onClick={handleLogout}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-line bg-ink text-zinc-200"
        aria-label="Log out"
      >
        <LogOut size={18} />
      </button>
    </div>
  );
}

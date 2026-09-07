"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SubscriptionPlan } from "@ascend/shared";
import { formatPlan } from "@/lib/subscriptionPlan";
import Link from "next/link";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { clearLocalAscendSession } from "@/lib/authSession";
import { useI18n } from "@/lib/i18n/I18nProvider";

function displayName(fullName: string | null | undefined, email: string | null | undefined, signedInLabel: string) {
  const trimmedName = fullName?.trim();
  if (trimmedName) return trimmedName;
  return email ?? signedInLabel;
}

function roleAccessLabel(roles: string[], t: (key: string) => string) {
  if (roles.includes("owner")) return t("account.ownerAccess");
  if (roles.includes("admin")) return t("account.adminAccess");
  if (roles.includes("trainer")) return t("account.trainerAccess");
  return null;
}

function accountAccessLabel({
  email,
  fullName,
  roles,
  plan,
  t
}: {
  email?: string | null;
  fullName?: string | null;
  roles?: string[];
  plan?: SubscriptionPlan | null;
  t: (key: string) => string;
}) {
  if (!email && !fullName) return t("account.checkingAccess");

  const normalizedRoles = roles?.map((role) => role.toLowerCase()) ?? [];
  const roleLabel = roleAccessLabel(normalizedRoles, t);
  if (!roleLabel) return plan ? formatPlan(plan, t) : t("account.checkingPlan");

  return plan && plan !== "free" ? `${roleLabel} / ${formatPlan(plan, t)}` : roleLabel;
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
  const { t } = useI18n();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function handleLogout() {
    if (isLoggingOut) return;
    setIsLoggingOut(true);

    try {
      await clearLocalAscendSession();
    } finally {
      router.replace("/login");
      window.setTimeout(() => {
        window.location.replace("/login");
      }, 150);
    }
  }

  const name = displayName(fullName, email, t("account.signedIn"));
  const accessLabel = accountAccessLabel({ email, fullName, roles, plan, t });

  return (
    <div className="ascend-account-strip ascend-soft-enter mt-2 flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 backdrop-blur">
      <div className="flex min-w-0 items-center gap-3">
        <Link href="/profile" aria-label="Open profile">
          <ProfileAvatar src={profilePhotoUrl} name={name} size="sm" />
        </Link>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="mt-0.5 text-xs text-zinc-400">{accessLabel}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={handleLogout}
        disabled={isLoggingOut}
        className="ascend-pressable grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-line bg-ink text-zinc-100 hover:border-calm/50"
        aria-label={t("common.logOut")}
      >
        <LogOut size={18} />
      </button>
    </div>
  );
}

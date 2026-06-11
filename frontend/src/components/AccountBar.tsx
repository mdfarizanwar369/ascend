"use client";

import { LogOut } from "lucide-react";
import { signOut } from "firebase/auth";
import { getFirebaseClientAuth } from "@/lib/firebase";

export function AccountBar({ email, roles }: { email?: string | null; roles?: string[] }) {
  async function handleLogout() {
    await signOut(getFirebaseClientAuth());
    window.location.href = "/login";
  }

  return (
    <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-line bg-surface p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{email ?? "Signed in"}</p>
        <p className="mt-1 text-xs text-zinc-400">{roles?.length ? `Role: ${roles.join(", ")}` : "Role: not loaded yet"}</p>
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

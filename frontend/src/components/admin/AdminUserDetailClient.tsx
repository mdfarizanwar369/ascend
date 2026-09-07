"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { SubscriptionPlan } from "@ascend/shared";
import {
  assignAdminClient,
  assignOwnerGym,
  deleteAdminUser,
  getAdminTrainers,
  getAdminUsers,
  getGyms,
  grantAdminSubscription,
  removeOwnerGym,
  setAdminAthleteMode,
  updateAdminUserDetails,
  updateAdminUserRole,
  updateAdminUserStatus
} from "@/lib/ascendApi";
import { BackButton } from "@/components/BackButton";
import { Field, inputClass, selectClass } from "@/components/Field";
import { useI18n } from "@/lib/i18n/I18nProvider";
import {
  AccountDetailsDraft,
  AdminTrainer,
  AdminUser,
  Gym,
  Role,
  accountDetailsChanged,
  adminUserDetailsDraft,
  assignmentLabel,
  formatCoachingMode,
  formatPlan,
  formatRole,
  referralLabel,
  trainersForUser
} from "./adminUsersModel";

export function AdminUserDetailClient({ userId }: { userId: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [trainers, setTrainers] = useState<AdminTrainer[]>([]);
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [canManageOwnerGyms, setCanManageOwnerGyms] = useState(false);
  const [draft, setDraft] = useState<AccountDetailsDraft>({ fullName: "", gymId: "" });
  const [status, setStatus] = useState("Loading account...");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [userResult, trainerResult, gymResult] = await Promise.allSettled([
      getAdminUsers(),
      getAdminTrainers(),
      getGyms()
    ]);

    if (userResult.status === "rejected") throw userResult.reason;
    const nextUser = userResult.value.users.find((candidate) => candidate.id === userId) ?? null;
    setUser(nextUser);
    setCanManageOwnerGyms(Boolean(userResult.value.canManageOwnerGyms));
    setTrainers(trainerResult.status === "fulfilled" && Array.isArray(trainerResult.value.trainers) ? trainerResult.value.trainers : []);
    setGyms(gymResult.status === "fulfilled" && Array.isArray(gymResult.value.gyms) ? gymResult.value.gyms : []);
    if (nextUser) setDraft(adminUserDetailsDraft(nextUser));
    setStatus(nextUser ? "" : "This account is unavailable or outside your business access.");
  }, [userId]);

  useEffect(() => {
    load().catch((error) =>
      setStatus(error instanceof Error ? `Could not load account: ${error.message}` : "Could not load this account.")
    );
  }, [load]);

  const activeTrainers = useMemo(
    () => trainers.filter((trainer) => trainer.user_status === "active" && trainer.status === "active"),
    [trainers]
  );
  const availableTrainers = user ? trainersForUser(user, activeTrainers) : [];

  async function runMutation(action: () => Promise<unknown>, successMessage: string) {
    setSaving(true);
    setStatus("");
    try {
      await action();
      await load();
      setStatus(successMessage);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not update this account.");
    } finally {
      setSaving(false);
    }
  }

  async function saveAccountDetails() {
    if (!user || !accountDetailsChanged(user, draft) || draft.fullName.trim().length < 2) return;
    await runMutation(
      () => updateAdminUserDetails({ userId: user.id, fullName: draft.fullName.trim(), gymId: draft.gymId || null }),
      `${draft.fullName.trim()}'s account details were updated.`
    );
  }

  async function changeRole(role: Role) {
    if (!user || role === user.primary_role) return;
    if ((role === "trainer" || role === "owner") && !user.gym_id) {
      setStatus(`Choose a gym for ${user.full_name} before granting ${formatRole(role, t)} access.`);
      return;
    }
    if (!window.confirm(`Change ${user.full_name}'s role from ${formatRole(user.primary_role, t)} to ${formatRole(role, t)}?`)) return;
    await runMutation(
      () => updateAdminUserRole({ userId: user.id, role, gymId: role === "trainer" || role === "owner" ? user.gym_id ?? undefined : undefined }),
      `${user.full_name} is now ${formatRole(role, t)}.`
    );
  }

  async function assignTrainer(trainerId: string) {
    if (!user) return;
    await runMutation(
      () => assignAdminClient({ clientId: user.id, trainerId: trainerId || null }),
      "Client assignment updated."
    );
  }

  async function grantPlan(plan: SubscriptionPlan) {
    if (!user || plan === user.current_plan) return;
    if (user.subscription_provider && user.subscription_provider !== "manual") {
      setStatus(`${user.full_name}'s access is managed by ${user.subscription_provider}. Update it through that billing provider.`);
      return;
    }
    if (!window.confirm(`Manually change ${user.full_name} from ${formatPlan(user.current_plan, t)} to ${formatPlan(plan, t)}?`)) return;
    await runMutation(
      () => grantAdminSubscription({ userId: user.id, plan }),
      `${user.full_name} is now on ${formatPlan(plan, t)}.`
    );
  }

  async function changeUserStatus(nextStatus: "active" | "inactive") {
    if (!user) return;
    if (nextStatus === "inactive" && !window.confirm(`Deactivate ${user.full_name}? They will lose access until reactivated.`)) return;
    await runMutation(
      () => updateAdminUserStatus({ userId: user.id, status: nextStatus }),
      nextStatus === "active" ? `${user.full_name} can access Ascend again.` : `${user.full_name} has been deactivated.`
    );
  }

  async function toggleAthleteMode() {
    if (!user) return;
    await runMutation(
      () => setAdminAthleteMode(user.id, !user.athlete_mode_enabled),
      `Athlete Mode ${user.athlete_mode_enabled ? "disabled" : "enabled"} for ${user.full_name}.`
    );
  }

  async function toggleOwnerGym(gymId: string) {
    if (!user) return;
    const assigned = (user.owner_gym_ids ?? []).includes(gymId);
    await runMutation(
      () => assigned ? removeOwnerGym(user.id, gymId) : assignOwnerGym(user.id, gymId),
      `${user.full_name}'s gym access was updated.`
    );
  }

  async function permanentlyDeleteUser() {
    if (!user) return;
    const confirmation = window.prompt(
      `Permanently delete ${user.full_name} (${user.email})?\n\nThis removes their login, logs, messages, photos, and subscription history. Live paid access must be cancelled first.\n\nType DELETE to continue.`
    );
    if (confirmation !== "DELETE") return;

    setSaving(true);
    setStatus("");
    try {
      await deleteAdminUser(user.id);
      router.replace("/admin/users");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not permanently delete this account.");
      setSaving(false);
    }
  }

  return (
    <>
      <section className="mt-3 flex items-start gap-3">
        <BackButton fallbackHref="/admin/users" />
        <div className="min-w-0">
          <p className="text-sm text-zinc-400">Business · People</p>
          <h1 className="mt-1 truncate text-2xl font-semibold">{user?.full_name ?? "Account"}</h1>
          <p className="mt-2 truncate text-sm text-zinc-400">{user?.email ?? "Manage one account."}</p>
        </div>
      </section>

      {status ? <p className="ascend-workspace-inset mt-4 p-3 text-sm text-zinc-300" role="status">{status}</p> : null}

      {!user ? null : (
        <div className="mt-4 space-y-4">
          <section className="ascend-workspace-section p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base font-semibold">Account</h2>
                <p className="mt-1 text-sm text-zinc-400">
                  {formatRole(user.primary_role, t)} · {user.gym_name ?? "No gym"} · {formatPlan(user.current_plan, t)}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <span className={`rounded px-2 py-1 text-xs ${user.status === "active" ? "bg-lime text-ink" : "bg-amber text-ink"}`}>
                  {user.status === "active" ? "Active" : "Inactive"}
                </span>
                {user.trainer_profile_status === "active" ? <span className="rounded bg-calm/15 px-2 py-1 text-xs font-semibold text-calm">Coach enabled</span> : null}
              </div>
            </div>
            {user.primary_role === "client" ? (
              <div className="mt-3 rounded-lg bg-ink p-3 text-xs leading-5 text-zinc-400">
                <p>{referralLabel(user, t)}</p>
                <p className="mt-1">{assignmentLabel(user, t)}</p>
                <p className="mt-1">{formatCoachingMode(user.coaching_mode, user.assigned_trainer_name, t)}</p>
              </div>
            ) : null}
          </section>

          {user.status !== "active" ? (
            <section className="ascend-workspace-section p-4 sm:p-5">
              <h2 className="text-base font-semibold">Deactivated account</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">History remains saved while access is paused.</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => changeUserStatus("active")}
                  className="h-11 rounded-lg bg-lime text-sm font-semibold text-ink disabled:opacity-60"
                >
                  Reactivate access
                </button>
                <button
                  type="button"
                  disabled={saving || user.primary_role === "owner" || user.primary_role === "admin"}
                  onClick={permanentlyDeleteUser}
                  className="flex h-11 items-center justify-center gap-2 rounded-lg border border-red-400/40 bg-red-400/10 text-sm font-semibold text-red-300 disabled:opacity-40"
                >
                  <Trash2 size={16} /> Delete permanently
                </button>
              </div>
              <p className="mt-3 text-xs leading-5 text-zinc-500">Permanent deletion removes the account and Ascend history. Live paid subscriptions must be cancelled first.</p>
            </section>
          ) : (
            <>
              <section className="ascend-workspace-section p-4 sm:p-5">
                <h2 className="text-base font-semibold">Account details</h2>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label={t("admin.fullName")}>
                    <input
                      className={inputClass}
                      disabled={saving}
                      value={draft.fullName}
                      onChange={(event) => setDraft((current) => ({ ...current, fullName: event.target.value }))}
                    />
                  </Field>
                  <Field label="Gym">
                    <select
                      className={selectClass}
                      disabled={saving}
                      value={draft.gymId}
                      onChange={(event) => setDraft((current) => ({ ...current, gymId: event.target.value }))}
                    >
                      <option value="">No gym</option>
                      {gyms.map((gym) => <option key={gym.id} value={gym.id}>{gym.name}</option>)}
                    </select>
                  </Field>
                </div>
                <button
                  type="button"
                  disabled={saving || draft.fullName.trim().length < 2 || !accountDetailsChanged(user, draft)}
                  onClick={saveAccountDetails}
                  className="ascend-pressable mt-3 h-11 w-full rounded-lg bg-lime text-sm font-semibold text-ink disabled:opacity-40"
                >
                  Save account details
                </button>
                <p className="mt-2 text-xs leading-5 text-zinc-500">Sign-in email is identity-managed. Assign a gym before choosing a trainer.</p>
              </section>

              <section className="ascend-workspace-section p-4 sm:p-5">
                <h2 className="text-base font-semibold">Role and coaching</h2>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label={t("admin.role")}>
                    <select
                      className={selectClass}
                      disabled={saving || user.is_platform_owner_account}
                      value={user.primary_role}
                      onChange={(event) => changeRole(event.target.value as Role)}
                    >
                      <option value="client">Client</option>
                      <option value="trainer">Trainer</option>
                      <option value="admin">Admin</option>
                      {canManageOwnerGyms || user.primary_role === "owner" ? <option value="owner">Owner</option> : null}
                    </select>
                    {user.is_platform_owner_account ? <p className="mt-1 text-xs leading-5 text-zinc-500">Owner remains the protected primary role; Coach access is added separately.</p> : null}
                  </Field>
                  <Field label={t("common.trainer")}>
                    <select
                      className={selectClass}
                      disabled={user.primary_role !== "client" || saving || (!user.trainer_assignment_eligible && !user.assigned_trainer_id)}
                      value={user.assigned_trainer_id ?? ""}
                      onChange={(event) => assignTrainer(event.target.value)}
                    >
                      <option value="">Unassigned</option>
                      {availableTrainers.map((trainer) => <option key={trainer.id} value={trainer.id}>{trainer.full_name} · {trainer.gym_name}</option>)}
                    </select>
                    {user.primary_role === "client" && !user.trainer_assignment_eligible && !user.assigned_trainer_id ? (
                      <p className="mt-1 text-xs leading-5 text-zinc-500">Upgrade to Premium before assigning a trainer.</p>
                    ) : null}
                  </Field>
                </div>
                {user.primary_role === "client" && !user.gym_id ? <p className="mt-2 text-xs text-amber">Assign a gym before assigning a trainer.</p> : null}
                {user.primary_role === "client" && user.gym_id && !availableTrainers.length ? <p className="mt-2 text-xs text-zinc-500">No active trainers are available in this gym.</p> : null}
              </section>

              <section className="ascend-workspace-section p-4 sm:p-5">
                <h2 className="text-base font-semibold">Plan access</h2>
                {user.subscription_provider && user.subscription_provider !== "manual" ? (
                  <p className="mt-3 rounded-lg border border-calm/30 bg-calm/10 p-3 text-xs leading-5 text-zinc-300">
                    Managed by {user.subscription_provider}. Billing changes must be made through that provider.
                  </p>
                ) : null}
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {(["free", "premium", "trainer_pro"] as SubscriptionPlan[]).map((plan) => {
                    const isCurrent = user.current_plan === plan;
                    return (
                      <button
                        key={plan}
                        type="button"
                        disabled={saving || isCurrent || Boolean(user.subscription_provider && user.subscription_provider !== "manual")}
                        onClick={() => grantPlan(plan)}
                        className={`h-11 rounded-lg text-xs font-semibold disabled:opacity-60 ${isCurrent ? "border border-lime bg-lime/10 text-lime" : "border border-line bg-ink text-zinc-200"}`}
                      >
                        {formatPlan(plan)}
                      </button>
                    );
                  })}
                </div>
              </section>

              {user.primary_role === "client" ? (
                <section className="rounded-xl border border-purple-400/30 bg-purple-400/10 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-semibold uppercase text-purple-300">Athlete Mode</h2>
                      <p className="mt-1 text-xs leading-5 text-zinc-400">Owner-controlled event preparation access.</p>
                    </div>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={toggleAthleteMode}
                      className={`h-11 shrink-0 rounded-lg px-3 text-xs font-semibold disabled:opacity-60 ${user.athlete_mode_enabled ? "bg-purple-400 text-ink" : "border border-purple-400/40 text-purple-300"}`}
                    >
                      {user.athlete_mode_enabled ? "Enabled" : "Enable"}
                    </button>
                  </div>
                </section>
              ) : null}

              {user.primary_role === "owner" && canManageOwnerGyms ? (
                <section className="ascend-workspace-section p-4 sm:p-5">
                  <h2 className="text-base font-semibold">Owner gym access</h2>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {gyms.map((gym) => {
                      const assigned = (user.owner_gym_ids ?? []).includes(gym.id);
                      return (
                        <button
                          key={gym.id}
                          type="button"
                          disabled={saving}
                          onClick={() => toggleOwnerGym(gym.id)}
                          className={`h-11 rounded-lg border text-sm font-semibold disabled:opacity-60 ${assigned ? "border-lime bg-lime/10 text-lime" : "border-line bg-ink text-zinc-300"}`}
                        >
                          {assigned ? "Assigned: " : "Add: "}{gym.name}
                        </button>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              <section className="ascend-workspace-section p-4 sm:p-5">
                <h2 className="text-base font-semibold">Account access</h2>
                {user.primary_role === "owner" ? (
                  <p className="mt-3 rounded-lg bg-ink p-3 text-sm text-zinc-400">Owner accounts are protected from deactivation here.</p>
                ) : (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => changeUserStatus("inactive")}
                    className="ascend-pressable mt-3 h-11 w-full rounded-lg border border-amber/40 bg-amber/10 text-sm font-semibold text-amber disabled:opacity-60"
                  >
                    Deactivate access
                  </button>
                )}
              </section>
            </>
          )}
        </div>
      )}
    </>
  );
}

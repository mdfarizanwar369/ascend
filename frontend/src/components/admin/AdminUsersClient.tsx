"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Search } from "lucide-react";
import {
  assignAdminClient,
  createAdminReferral,
  getAdminTrainers,
  getAdminUsers,
  getGyms,
  updateAdminUserRole
} from "@/lib/ascendApi";
import { BackButton } from "@/components/BackButton";
import { Field, inputClass, selectClass } from "@/components/Field";
import {
  AdminTrainer,
  AdminUser,
  Gym,
  Role,
  assignmentLabel,
  assignmentTone,
  formatCoachingMode,
  formatPlan,
  formatRole,
  referralLabel,
  trainerCode,
  trainersForUser
} from "./adminUsersModel";

export { accountDetailsChanged, adminUserDetailsDraft, trainersForUser } from "./adminUsersModel";

type WorkspaceView = "people" | "assignments" | "trainers";

const workspaceViews: Array<{ id: WorkspaceView; label: string }> = [
  { id: "people", label: "People" },
  { id: "assignments", label: "Assignments" },
  { id: "trainers", label: "Trainers" }
];

export function AdminUsersClient() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [trainers, setTrainers] = useState<AdminTrainer[]>([]);
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [status, setStatus] = useState("Loading people...");
  const [referralStatus, setReferralStatus] = useState("");
  const [savingUserId, setSavingUserId] = useState("");
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("people");
  const [userView, setUserView] = useState<"active" | "inactive">("active");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | Role>("all");
  const [gymFilter, setGymFilter] = useState("all");

  async function load() {
    const [userResult, trainerResult, gymResult] = await Promise.allSettled([
      getAdminUsers(),
      getAdminTrainers(),
      getGyms()
    ]);

    if (userResult.status === "rejected") throw userResult.reason;
    setUsers(Array.isArray(userResult.value.users) ? userResult.value.users : []);
    setTrainers(trainerResult.status === "fulfilled" && Array.isArray(trainerResult.value.trainers) ? trainerResult.value.trainers : []);
    setGyms(gymResult.status === "fulfilled" && Array.isArray(gymResult.value.gyms) ? gymResult.value.gyms : []);

    const partialFailures = [
      trainerResult.status === "rejected" ? "trainers" : "",
      gymResult.status === "rejected" ? "gyms" : ""
    ].filter(Boolean);
    setStatus(partialFailures.length ? `People loaded, but ${partialFailures.join(" and ")} could not load yet.` : "");
  }

  useEffect(() => {
    load().catch((error) =>
      setStatus(error instanceof Error ? `Could not load people: ${error.message}` : "Could not load people. Use an owner or admin account.")
    );
  }, []);

  const activeUsers = useMemo(() => users.filter((user) => user.status === "active"), [users]);
  const inactiveUsers = useMemo(() => users.filter((user) => user.status !== "active"), [users]);
  const clients = useMemo(() => activeUsers.filter((user) => user.primary_role === "client"), [activeUsers]);
  const pendingTrainers = useMemo(() => trainers.filter((trainer) => trainer.user_status === "active" && trainer.status !== "active"), [trainers]);
  const activeTrainers = useMemo(() => trainers.filter((trainer) => trainer.user_status === "active" && trainer.status === "active"), [trainers]);
  const unassignedClients = useMemo(() => clients.filter((client) => !client.assigned_trainer_id), [clients]);
  const trainerClientCounts = useMemo(() => {
    const counts = new Map<string, number>();
    clients.forEach((client) => {
      if (client.assigned_trainer_id) counts.set(client.assigned_trainer_id, (counts.get(client.assigned_trainer_id) ?? 0) + 1);
    });
    return counts;
  }, [clients]);
  const visibleUsers = useMemo(() => {
    const source = userView === "active" ? activeUsers : inactiveUsers;
    const normalizedSearch = search.trim().toLowerCase();
    return source.filter((user) => {
      if (roleFilter !== "all" && user.primary_role !== roleFilter) return false;
      if (gymFilter !== "all" && user.gym_id !== gymFilter) return false;
      if (!normalizedSearch) return true;
      return `${user.full_name} ${user.email} ${user.gym_name ?? ""}`.toLowerCase().includes(normalizedSearch);
    });
  }, [activeUsers, gymFilter, inactiveUsers, roleFilter, search, userView]);

  const viewCounts: Record<WorkspaceView, string> = {
    people: `${activeUsers.length} active`,
    assignments: `${unassignedClients.length} open`,
    trainers: pendingTrainers.length ? `${pendingTrainers.length} pending` : `${activeTrainers.length} active`
  };

  async function assignTrainer(clientId: string, trainerId: string) {
    setSavingUserId(clientId);
    setStatus("");
    try {
      await assignAdminClient({ clientId, trainerId: trainerId || null });
      await load();
      setStatus("Client assignment updated.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not assign trainer.");
    } finally {
      setSavingUserId("");
    }
  }

  async function approveTrainer(trainer: AdminTrainer) {
    setSavingUserId(trainer.user_id);
    setStatus("");
    try {
      await updateAdminUserRole({ userId: trainer.user_id, role: "trainer", gymId: trainer.gym_id });
      await load();
      setStatus(`${trainer.full_name} approved as an active trainer.`);
    } catch {
      setStatus("Could not approve trainer.");
    } finally {
      setSavingUserId("");
    }
  }

  async function createTrainerReferral(trainer: AdminTrainer) {
    setSavingUserId(trainer.user_id);
    setReferralStatus("");
    try {
      await createAdminReferral({ code: trainerCode(trainer.full_name), type: "trainer", trainerId: trainer.id });
      setReferralStatus(`Referral code ready: ${trainerCode(trainer.full_name)}`);
    } catch {
      setReferralStatus("Could not create referral code. It may already exist.");
    } finally {
      setSavingUserId("");
    }
  }

  return (
    <>
      <section className="mt-3 flex items-start gap-3">
        <BackButton fallbackHref="/admin" />
        <div className="min-w-0">
          <p className="text-sm text-zinc-400">Owner tools</p>
          <h1 className="mt-1 text-2xl font-semibold">Business</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-400">Manage one business task at a time.</p>
        </div>
      </section>

      {status ? <p className="ascend-workspace-inset mt-4 p-3 text-sm text-zinc-300" role="status">{status}</p> : null}
      {referralStatus ? <p className="mt-3 rounded-lg border border-lime/40 bg-lime/10 p-3 text-sm text-lime" role="status">{referralStatus}</p> : null}

      <nav aria-label="Business sections" className="mt-4 grid grid-cols-3 gap-1 rounded-xl border border-line bg-ink p-1">
        {workspaceViews.map((view) => (
          <button
            key={view.id}
            type="button"
            aria-pressed={workspaceView === view.id}
            onClick={() => setWorkspaceView(view.id)}
            className={`min-h-12 rounded-lg px-2 py-2 text-xs font-semibold sm:text-sm ${
              workspaceView === view.id ? "bg-lime text-ink" : "text-zinc-300"
            }`}
          >
            <span className="block">{view.label}</span>
            <span className={`mt-0.5 block text-[11px] ${workspaceView === view.id ? "text-ink/70" : "text-zinc-500"}`}>
              {viewCounts[view.id]}
            </span>
          </button>
        ))}
      </nav>

      {workspaceView === "people" ? (
        <section className="ascend-workspace-section mt-4 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">People</h2>
              <p className="mt-1 text-sm text-zinc-400">Open one account to make changes.</p>
            </div>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-ink p-1">
              <button
                type="button"
                onClick={() => setUserView("active")}
                className={`min-h-10 rounded-md px-2 text-xs font-semibold ${userView === "active" ? "bg-lime text-ink" : "text-zinc-300"}`}
              >
                Active {activeUsers.length}
              </button>
              <button
                type="button"
                onClick={() => setUserView("inactive")}
                className={`min-h-10 rounded-md px-2 text-xs font-semibold ${userView === "inactive" ? "bg-lime text-ink" : "text-zinc-300"}`}
              >
                Inactive {inactiveUsers.length}
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-2 md:grid-cols-[minmax(0,1fr)_180px_220px]">
            <label className="relative block">
              <span className="sr-only">Search people</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
              <input
                className={`${inputClass} pl-10`}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, email, or gym"
              />
            </label>
            <label>
              <span className="sr-only">Filter by role</span>
              <select className={selectClass} value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as "all" | Role)}>
                <option value="all">All roles</option>
                <option value="client">Clients</option>
                <option value="trainer">Trainers</option>
                <option value="owner">Owners</option>
                <option value="admin">Admins</option>
              </select>
            </label>
            <label>
              <span className="sr-only">Filter by gym</span>
              <select className={selectClass} value={gymFilter} onChange={(event) => setGymFilter(event.target.value)}>
                <option value="all">All gyms</option>
                {gyms.map((gym) => <option key={gym.id} value={gym.id}>{gym.name}</option>)}
              </select>
            </label>
          </div>

          <div className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line">
            {visibleUsers.map((user) => (
              <Link
                key={user.id}
                href={`/admin/users/${encodeURIComponent(user.id)}`}
                className="ascend-pressable flex min-h-20 items-center justify-between gap-3 bg-ink p-3 hover:bg-surface/50"
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate text-sm font-medium">{user.full_name}</p>
                    {user.is_platform_owner_account ? <span className="rounded bg-calm/15 px-2 py-0.5 text-[10px] font-semibold text-calm">Platform Owner</span> : null}
                  </div>
                  <p className="mt-1 truncate text-xs text-zinc-400">{user.email}</p>
                  <p className="mt-1 truncate text-xs text-zinc-500">
                    {formatRole(user.primary_role)} · {user.gym_name ?? "No gym"} · {formatPlan(user.current_plan)}
                  </p>
                  {user.primary_role === "client" ? (
                    <p className="mt-1 truncate text-xs text-zinc-500">{formatCoachingMode(user.coaching_mode, user.assigned_trainer_name)}</p>
                  ) : null}
                </div>
                <span className="inline-flex min-h-11 shrink-0 items-center gap-1 text-sm font-semibold text-lime">
                  Manage <ChevronRight size={17} />
                </span>
              </Link>
            ))}
            {!visibleUsers.length ? (
              <p className="bg-ink p-4 text-sm leading-6 text-zinc-400">
                {userView === "active" ? "No active people match these filters." : "No deactivated people match these filters."}
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {workspaceView === "assignments" ? (
        <section className="ascend-workspace-section mt-4 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Clients needing a trainer</h2>
              <p className="mt-1 text-sm leading-6 text-zinc-400">Only unassigned clients appear here.</p>
            </div>
            <span className="rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-lime">{clients.length - unassignedClients.length}/{clients.length}</span>
          </div>

          <div className="mt-4 space-y-3">
            {unassignedClients.map((client) => {
              const availableTrainers = trainersForUser(client, activeTrainers);
              return (
                <article key={client.id} className="rounded-xl border border-line bg-ink p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{client.full_name}</p>
                      <p className="mt-1 truncate text-xs text-zinc-400">{client.email}</p>
                      <p className="mt-1 text-xs text-zinc-500">{referralLabel(client)}</p>
                    </div>
                    <span className={`shrink-0 rounded px-2 py-1 text-xs ${assignmentTone(client)}`}>{assignmentLabel(client)}</span>
                  </div>
                  <div className="mt-3">
                    <Field label="Assign trainer">
                      <select
                        className={selectClass}
                        disabled={savingUserId === client.id || !client.trainer_assignment_eligible}
                        value=""
                        onChange={(event) => assignTrainer(client.id, event.target.value)}
                      >
                        <option value="">Choose trainer</option>
                        {availableTrainers.map((trainer) => (
                          <option key={trainer.id} value={trainer.id}>
                            {trainer.full_name} · {trainerClientCounts.get(trainer.id) ?? 0} clients
                          </option>
                        ))}
                      </select>
                    </Field>
                    {!client.trainer_assignment_eligible ? (
                      <p className="mt-2 text-xs text-zinc-500">Upgrade to Premium before assigning a trainer.</p>
                    ) : !client.gym_id ? (
                      <p className="mt-2 text-xs text-amber">Open this account and assign a gym first.</p>
                    ) : !availableTrainers.length ? (
                      <p className="mt-2 text-xs text-zinc-500">No active trainers are available in this client&apos;s gym.</p>
                    ) : null}
                    <Link href={`/admin/users/${encodeURIComponent(client.id)}`} className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-lime">
                      Manage account <ChevronRight size={17} />
                    </Link>
                  </div>
                </article>
              );
            })}
            {!unassignedClients.length ? <p className="rounded-xl bg-ink p-4 text-sm text-zinc-400">All eligible clients are assigned.</p> : null}
          </div>
        </section>
      ) : null}

      {workspaceView === "trainers" ? (
        <div className="mt-4 space-y-4">
          {pendingTrainers.length ? (
            <section className="rounded-xl border border-amber/40 bg-amber/10 p-4">
              <h2 className="text-base font-semibold text-amber">Pending approval</h2>
              <div className="mt-3 space-y-2">
                {pendingTrainers.map((trainer) => (
                  <article key={trainer.id} className="flex items-center justify-between gap-3 rounded-lg bg-ink p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{trainer.full_name}</p>
                      <p className="mt-1 truncate text-xs text-zinc-400">{trainer.gym_name}</p>
                    </div>
                    <button
                      type="button"
                      disabled={savingUserId === trainer.user_id}
                      onClick={() => approveTrainer(trainer)}
                      className="h-11 rounded-lg bg-lime px-3 text-sm font-semibold text-ink disabled:opacity-60"
                    >
                      Approve
                    </button>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          <section className="ascend-workspace-section p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Active trainers</h2>
                <p className="mt-1 text-sm text-zinc-400">Workload and referral tools together.</p>
              </div>
              <span className="rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-lime">{activeTrainers.length}</span>
            </div>
            <div className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line">
              {activeTrainers.map((trainer) => (
                <article key={trainer.id} className="bg-ink p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{trainer.full_name}</p>
                      <p className="mt-1 truncate text-xs text-zinc-400">{trainer.gym_name}</p>
                    </div>
                    <span className="rounded bg-surface px-3 py-1 text-sm font-semibold text-lime">{trainerClientCounts.get(trainer.id) ?? 0} clients</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <p className="truncate text-xs text-zinc-500">{trainerCode(trainer.full_name)}</p>
                    <button
                      type="button"
                      disabled={savingUserId === trainer.user_id}
                      onClick={() => createTrainerReferral(trainer)}
                      className="ascend-pressable h-11 rounded-lg border border-lime/40 px-3 text-sm font-semibold text-lime disabled:opacity-60"
                    >
                      Create code
                    </button>
                  </div>
                </article>
              ))}
              {!activeTrainers.length ? <p className="bg-ink p-4 text-sm text-zinc-400">No active trainers yet.</p> : null}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

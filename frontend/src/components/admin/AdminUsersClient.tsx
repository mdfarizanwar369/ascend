"use client";

import { useEffect, useMemo, useState } from "react";
import {
  assignAdminClient,
  createAdminReferral,
  getAdminTrainers,
  getAdminUsers,
  getGyms,
  updateAdminUserRole
} from "@/lib/ascendApi";
import { BackButton } from "@/components/BackButton";
import { Field, inputClass } from "@/components/Field";

type AdminUser = Awaited<ReturnType<typeof getAdminUsers>>["users"][number];
type AdminTrainer = Awaited<ReturnType<typeof getAdminTrainers>>["trainers"][number];
type Gym = Awaited<ReturnType<typeof getGyms>>["gyms"][number];
type Role = AdminUser["primary_role"];

const selectClass = `${inputClass} appearance-none`;

function formatRole(role: string) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function trainerCode(name: string) {
  return `TRAINER-${name.split(/\s+/)[0]?.replace(/[^a-z0-9]/gi, "").toUpperCase() || "NEW"}`;
}

export function AdminUsersClient() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [trainers, setTrainers] = useState<AdminTrainer[]>([]);
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [status, setStatus] = useState("Loading users...");
  const [savingUserId, setSavingUserId] = useState("");
  const [referralStatus, setReferralStatus] = useState("");

  async function load() {
    const userResponse = await getAdminUsers();
    setUsers(Array.isArray(userResponse.users) ? userResponse.users : []);
    setStatus("");

    try {
      const trainerResponse = await getAdminTrainers();
      setTrainers(Array.isArray(trainerResponse.trainers) ? trainerResponse.trainers : []);
    } catch {
      setReferralStatus("Users loaded, but trainers could not load yet.");
    }

    try {
      const gymResponse = await getGyms();
      setGyms(Array.isArray(gymResponse.gyms) ? gymResponse.gyms : []);
    } catch {
      setReferralStatus("Users loaded, but gyms could not load yet.");
    }
  }

  useEffect(() => {
    load().catch((error) =>
      setStatus(error instanceof Error ? `Could not load users: ${error.message}` : "Could not load users. Use an owner or admin account.")
    );
  }, []);

  const clients = useMemo(() => users.filter((user) => user.primary_role === "client"), [users]);
  const activeTrainers = useMemo(() => trainers.filter((trainer) => trainer.status === "active"), [trainers]);
  const unassignedClients = useMemo(() => clients.filter((client) => !client.assigned_trainer_id), [clients]);
  const assignedClients = useMemo(() => clients.filter((client) => client.assigned_trainer_id), [clients]);
  const trainerClientCounts = useMemo(() => {
    const counts = new Map<string, number>();
    clients.forEach((client) => {
      if (client.assigned_trainer_id) counts.set(client.assigned_trainer_id, (counts.get(client.assigned_trainer_id) ?? 0) + 1);
    });
    return counts;
  }, [clients]);

  async function changeRole(user: AdminUser, role: Role) {
    setSavingUserId(user.id);
    setStatus("");

    try {
      const gymId = user.gym_id ?? gyms[0]?.id;
      await updateAdminUserRole({ userId: user.id, role, gymId: role === "trainer" ? gymId : undefined });
      await load();
      setStatus(`${user.full_name} is now ${formatRole(role)}.`);
    } catch {
      setStatus("Could not update role. Make sure trainer accounts have a gym.");
    } finally {
      setSavingUserId("");
    }
  }

  async function assignTrainer(clientId: string, trainerId: string) {
    setSavingUserId(clientId);
    setStatus("");

    try {
      await assignAdminClient({ clientId, trainerId: trainerId || null });
      await load();
      setStatus("Client assignment updated.");
    } catch {
      setStatus("Could not assign trainer.");
    } finally {
      setSavingUserId("");
    }
  }

  async function createTrainerReferral(trainer: AdminTrainer) {
    setSavingUserId(trainer.user_id);
    setReferralStatus("");

    try {
      await createAdminReferral({
        code: trainerCode(trainer.full_name),
        type: "trainer",
        trainerId: trainer.id
      });
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
        <div>
          <p className="text-sm text-zinc-400">Owner tools</p>
          <h1 className="mt-1 text-2xl font-semibold">Users</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-400">Approve trainers, assign clients, and create referral codes.</p>
        </div>
      </section>

      {status ? <p className="mt-4 rounded-lg border border-line bg-surface p-3 text-sm text-zinc-300">{status}</p> : null}
      {referralStatus ? <p className="mt-3 rounded-lg border border-lime/40 bg-lime/10 p-3 text-sm text-lime">{referralStatus}</p> : null}

      <section className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-line bg-surface p-4">
          <p className="text-xs uppercase text-zinc-400">Users</p>
          <p className="mt-2 text-2xl font-semibold">{users.length}</p>
        </div>
        <div className="rounded-lg border border-line bg-surface p-4">
          <p className="text-xs uppercase text-zinc-400">Unassigned</p>
          <p className="mt-2 text-2xl font-semibold">{unassignedClients.length}</p>
        </div>
      </section>

      <section className="mt-4 rounded-lg border border-lime/40 bg-lime/10 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-lime">Trainer assignment</h2>
            <p className="mt-1 text-sm leading-6 text-zinc-300">
              Assign clients to a trainer before they start messaging.
            </p>
          </div>
          <span className="rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-lime">{assignedClients.length}/{clients.length}</span>
        </div>

        <div className="mt-4 space-y-3">
          {unassignedClients.map((client) => (
            <article key={client.id} className="rounded-lg bg-ink p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{client.full_name}</p>
                  <p className="mt-1 truncate text-xs text-zinc-400">{client.email}</p>
                  <p className="mt-1 text-xs text-zinc-500">{client.gym_name ?? "No gym yet"}</p>
                </div>
                <span className="rounded bg-amber px-2 py-1 text-xs text-ink">Needs trainer</span>
              </div>
              <div className="mt-3">
                <Field label="Assign trainer">
                  <select
                    className={selectClass}
                    disabled={savingUserId === client.id}
                    value=""
                    onChange={(event) => assignTrainer(client.id, event.target.value)}
                  >
                    <option value="">Choose trainer</option>
                    {activeTrainers.map((trainer) => (
                      <option key={trainer.id} value={trainer.id}>
                        {trainer.full_name} / {trainer.gym_name} ({trainerClientCounts.get(trainer.id) ?? 0} clients)
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </article>
          ))}
          {!unassignedClients.length ? (
            <p className="rounded-lg bg-ink p-3 text-sm text-zinc-400">All clients are assigned to trainers.</p>
          ) : null}
        </div>
      </section>

      <section className="mt-4 rounded-lg border border-line bg-surface p-4">
        <h2 className="text-base font-semibold">Trainer workload</h2>
        <div className="mt-3 space-y-2">
          {activeTrainers.map((trainer) => (
            <div key={trainer.id} className="flex items-center justify-between rounded-lg bg-ink px-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{trainer.full_name}</p>
                <p className="mt-1 truncate text-xs text-zinc-400">{trainer.gym_name}</p>
              </div>
              <span className="rounded bg-surface px-3 py-1 text-sm font-semibold text-lime">{trainerClientCounts.get(trainer.id) ?? 0}</span>
            </div>
          ))}
          {!activeTrainers.length ? <p className="rounded-lg bg-ink p-3 text-sm text-zinc-400">No active trainers yet.</p> : null}
        </div>
      </section>

      <section className="mt-4 rounded-lg border border-line bg-surface p-4">
        <h2 className="text-base font-semibold">Approve roles</h2>
        <div className="mt-3 space-y-3">
          {users.map((user) => (
            <article key={user.id} className="rounded-lg bg-ink p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{user.full_name}</p>
                  <p className="mt-1 truncate text-xs text-zinc-400">{user.email}</p>
                  <p className="mt-1 text-xs text-zinc-500">{user.gym_name ?? "No gym"}</p>
                </div>
                <span className="rounded bg-surface px-2 py-1 text-xs text-zinc-300">{formatRole(user.primary_role)}</span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <Field label="Role">
                  <select
                    className={selectClass}
                    disabled={savingUserId === user.id}
                    value={user.primary_role}
                    onChange={(event) => changeRole(user, event.target.value as Role)}
                  >
                    <option value="client">Client</option>
                    <option value="trainer">Trainer</option>
                    <option value="admin">Admin</option>
                    <option value="owner">Owner</option>
                  </select>
                </Field>
                <Field label="Trainer">
                  <select
                    className={selectClass}
                    disabled={user.primary_role !== "client" || savingUserId === user.id}
                    value={user.assigned_trainer_id ?? ""}
                    onChange={(event) => assignTrainer(user.id, event.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {activeTrainers.map((trainer) => (
                      <option key={trainer.id} value={trainer.id}>
                        {trainer.full_name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </article>
          ))}
          {!users.length ? <p className="rounded-lg bg-ink p-3 text-sm text-zinc-400">No users found yet.</p> : null}
        </div>
      </section>

      <section className="mt-4 rounded-lg border border-line bg-surface p-4">
        <h2 className="text-base font-semibold">Trainer referral codes</h2>
        <div className="mt-3 space-y-3">
          {activeTrainers.map((trainer) => (
            <article key={trainer.id} className="rounded-lg bg-ink p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{trainer.full_name}</p>
                  <p className="mt-1 text-xs text-zinc-400">{trainer.gym_name}</p>
                </div>
                <button
                  type="button"
                  disabled={savingUserId === trainer.user_id}
                  onClick={() => createTrainerReferral(trainer)}
                  className="h-10 rounded-lg bg-lime px-3 text-sm font-semibold text-ink disabled:opacity-60"
                >
                  Create
                </button>
              </div>
              <p className="mt-2 text-xs text-zinc-500">Suggested code: {trainerCode(trainer.full_name)}</p>
            </article>
          ))}
          {!activeTrainers.length ? <p className="rounded-lg bg-ink p-3 text-sm text-zinc-400">No active trainers yet.</p> : null}
        </div>
      </section>
    </>
  );
}

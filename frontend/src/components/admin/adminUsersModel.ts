import { getAdminTrainers, getAdminUsers, getGyms } from "@/lib/ascendApi";
import { CoachingMode } from "@ascend/shared";

export type AdminUser = Awaited<ReturnType<typeof getAdminUsers>>["users"][number];
export type AdminTrainer = Awaited<ReturnType<typeof getAdminTrainers>>["trainers"][number];
export type Gym = Awaited<ReturnType<typeof getGyms>>["gyms"][number];
export type Role = AdminUser["primary_role"];
export type AccountDetailsDraft = { fullName: string; gymId: string };

export function adminUserDetailsDraft(user: Pick<AdminUser, "full_name" | "gym_id">): AccountDetailsDraft {
  return { fullName: user.full_name, gymId: user.gym_id ?? "" };
}

export function accountDetailsChanged(user: Pick<AdminUser, "full_name" | "gym_id">, draft: AccountDetailsDraft) {
  return draft.fullName.trim() !== user.full_name || (draft.gymId || null) !== user.gym_id;
}

export function formatRole(role: string) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function formatPlan(plan?: string | null) {
  if (plan === "trainer_pro") return "Trainer Pro";
  if (plan === "premium") return "Premium";
  return "Free";
}

export function formatCoachingMode(mode?: CoachingMode | string | null, assignedTrainerName?: string | null) {
  if (assignedTrainerName) return "Human Coach";
  if (mode === "human_coach") return "Human Coach";
  if (mode === "ai_coach") return "AI Coach";
  return "Self-Coached";
}

export function trainerCode(name: string) {
  return `TRAINER-${name.split(/\s+/)[0]?.replace(/[^a-z0-9]/gi, "").toUpperCase() || "NEW"}`;
}

export function referralLabel(user: AdminUser) {
  if (user.referral_source === "trainer") return `Trainer referral / ${user.referred_trainer_name ?? "Unknown trainer"}`;
  if (user.referral_source === "gym") return `Gym referral / ${user.referred_gym_name ?? user.gym_name ?? "Unknown gym"}`;
  return "No referral / Needs review";
}

export function assignmentLabel(user: AdminUser) {
  if (user.assigned_trainer_name) return `Assigned to ${user.assigned_trainer_name}`;
  if (user.referral_source === "gym") return "Needs trainer";
  if (user.referral_source === "trainer") return "Trainer referral missing assignment";
  return "Needs review";
}

export function assignmentTone(user: AdminUser) {
  if (user.assigned_trainer_name) return "bg-lime text-ink";
  if (user.referral_source === "gym") return "bg-amber text-ink";
  return "bg-surface text-zinc-300";
}

export function trainersForUser(user: AdminUser, trainers: AdminTrainer[]) {
  if (!user.gym_id) return [];
  return trainers.filter((trainer) => trainer.gym_id === user.gym_id && trainer.user_status === "active" && trainer.status === "active");
}

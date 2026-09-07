import { getAdminTrainers, getAdminUsers, getGyms } from "@/lib/ascendApi";
import { CoachingMode } from "@ascend/shared";
import { messages } from "@/lib/i18n/messages";

type Translate = (key: string, values?: Record<string, string | number>) => string;
const english: Translate = (key, values) => {
  const template = messages.en[key] ?? key;
  if (!values) return template;
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, valueKey) => String(values[valueKey] ?? match));
};

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

export function formatRole(role: string, t: Translate = english) {
  if (role === "owner") return t("admin.roleOwner");
  if (role === "admin") return t("admin.roleAdmin");
  if (role === "trainer") return t("admin.roleTrainer");
  if (role === "client") return t("admin.roleClient");
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function formatPlan(plan?: string | null, t: Translate = english) {
  if (plan === "trainer_pro") return t("common.trainerPro");
  if (plan === "premium") return t("common.premium");
  return t("admin.planFree");
}

export function formatCoachingMode(mode?: CoachingMode | string | null, assignedTrainerName?: string | null, t: Translate = english) {
  if (assignedTrainerName) return t("onboarding.humanCoach");
  if (mode === "human_coach") return t("onboarding.humanCoach");
  if (mode === "ai_coach") return t("onboarding.aiCoach");
  return t("onboarding.selfCoached");
}

export function trainerCode(name: string) {
  return `TRAINER-${name.split(/\s+/)[0]?.replace(/[^a-z0-9]/gi, "").toUpperCase() || "NEW"}`;
}

export function referralLabel(user: AdminUser, t: Translate = english) {
  if (user.referral_source === "trainer") return t("admin.trainerReferral", { name: user.referred_trainer_name ?? t("admin.unknownTrainer") });
  if (user.referral_source === "gym") return t("admin.gymReferral", { name: user.referred_gym_name ?? user.gym_name ?? t("admin.unknownGym") });
  return t("admin.noReferralReview");
}

export function assignmentLabel(user: AdminUser, t: Translate = english) {
  if (user.assigned_trainer_name) return t("admin.assignedTo", { name: user.assigned_trainer_name });
  if (user.referral_source === "gym") return t("admin.needsTrainer");
  if (user.referral_source === "trainer") return t("admin.trainerReferralMissing");
  return t("admin.needsReview");
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

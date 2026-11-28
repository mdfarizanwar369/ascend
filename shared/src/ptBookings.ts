export type PtBookingRole = "client" | "trainer" | "manager";
export type PtBookingStatus = "pending" | "confirmed" | "declined" | "cancelled" | "expired";
export type PtBookingAction = "confirm" | "decline" | "cancel";
export type PtBookingUpdateKind = "confirmed" | "moved";
export const ptSessionFeelings = ["good", "low_energy", "sore", "uncomfortable"] as const;
export const ptSessionPreferences = ["lighter", "talk_first"] as const;
export const ptSessionWellbeingWindowMs = 24 * 60 * 60 * 1000;

export interface PtSessionWellbeing {
  feeling: typeof ptSessionFeelings[number] | null;
  preference: typeof ptSessionPreferences[number] | null;
}

export interface PtCalendarBlockInput {
  startsOn: string;
  endsOn: string;
  startsAt: string | null;
  endsAt: string | null;
  repeat: "none" | "daily" | "weekly";
}

export interface PtCalendarBlock extends PtCalendarBlockInput {
  id: string;
}

export interface PtAppointment {
  id: string;
  clientId: string;
  clientName: string;
  trainerName: string;
  startsAt: string;
  endsAt: string;
  status: PtBookingStatus;
  version: number;
  wellbeing?: PtSessionWellbeing | null;
}

export type PtBookingSlot = Pick<PtAppointment, "startsAt" | "endsAt">;

export interface PtBookingUpdate {
  id: string;
  kind: PtBookingUpdateKind;
  startsAt: string;
  timeZone: string;
}

export interface PtRebookingClient {
  clientId: string;
  clientName: string;
  trainerName: string;
  lastSessionAt: string;
}

export interface PtTrainerOpenings {
  clientName: string;
  today: string;
  week: string;
  timeZone: string;
  slots: PtBookingSlot[];
  nextBooking: PtAppointment | null;
}

export interface PtBookingWeek {
  enabled: boolean;
  gym: { id: string; name: string; timeZone: string } | null;
  gyms: { id: string; name: string }[];
  week: string;
  today: string;
  trainerId?: string;
  trainerName?: string;
  blocks?: PtCalendarBlock[];
  slots?: PtBookingSlot[];
  bookings: PtAppointment[];
  updates?: PtBookingUpdate[];
  needsRebooking?: PtRebookingClient[];
  wellbeingEnabled?: boolean;
}

const dayMilliseconds = 86_400_000;

export function ptLocalDate(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(date);
  return ["year", "month", "day"].map((type) => parts.find((part) => part.type === type)?.value).join("-");
}

export function shiftPtDate(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * dayMilliseconds).toISOString().slice(0, 10);
}

export function ptWeekStart(date: string) {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return shiftPtDate(date, -((weekday + 6) % 7));
}

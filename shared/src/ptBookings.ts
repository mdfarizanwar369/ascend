export type PtBookingRole = "client" | "trainer" | "manager";
export type PtBookingStatus = "pending" | "confirmed" | "declined" | "cancelled" | "expired";
export type PtBookingAction = "confirm" | "decline" | "cancel";

export interface PtAvailability {
  weekday: number;
  opensAt: string;
  closesAt: string;
}

export interface PtAppointment {
  id: string;
  clientId: string;
  clientName: string;
  trainerName: string;
  startsAt: string;
  endsAt: string;
  status: PtBookingStatus;
}

export type PtBookingSlot = Pick<PtAppointment, "startsAt" | "endsAt">;

export interface PtBookingWeek {
  enabled: boolean;
  gym: { id: string; name: string; timeZone: string } | null;
  gyms: { id: string; name: string }[];
  week: string;
  today: string;
  trainerId?: string;
  trainerName?: string;
  availability?: PtAvailability[];
  slots?: PtBookingSlot[];
  bookings: PtAppointment[];
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

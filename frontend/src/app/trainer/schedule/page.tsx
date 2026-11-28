import { PtBookingPage } from "@/components/bookings/PtBookingPage";
import { nudgeUuid, ptBookingNotificationTarget } from "@ascend/shared";

export default async function TrainerSchedulePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { clientId, day, booking } = await searchParams;
  return <PtBookingPage role="trainer" bookingClientId={typeof clientId === "string" && nudgeUuid.test(clientId) ? clientId : undefined}
    notificationTarget={ptBookingNotificationTarget(day, booking)} />;
}

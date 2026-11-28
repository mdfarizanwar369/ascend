import { PtBookingPage } from "@/components/bookings/PtBookingPage";
import { ptBookingNotificationTarget } from "@ascend/shared";

export default async function ClientPtBookingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { day, booking } = await searchParams;
  return <PtBookingPage role="client" notificationTarget={ptBookingNotificationTarget(day, booking)} />;
}

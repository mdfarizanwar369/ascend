import { PtBookingPage } from "@/components/bookings/PtBookingPage";
import { nudgeUuid } from "@ascend/shared";

export default async function TrainerSchedulePage({ searchParams }: { searchParams: Promise<{ clientId?: string | string[] }> }) {
  const { clientId } = await searchParams;
  return <PtBookingPage role="trainer" bookingClientId={typeof clientId === "string" && nudgeUuid.test(clientId) ? clientId : undefined} />;
}

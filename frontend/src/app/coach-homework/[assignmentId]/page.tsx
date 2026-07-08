import { CoachHomeworkClient } from "@/components/tracking/CoachHomeworkClient";

export default async function CoachHomeworkPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params;
  return <CoachHomeworkClient assignmentId={assignmentId} />;
}

import { notFound } from "next/navigation";
import { EssentialsMorphLab } from "@/components/dev/EssentialsMorphLab";

export default function EssentialsMorphLabPage() {
  if (process.env.NODE_ENV === "production" && process.env.ASCEND_MORPH_AUDIT !== "true") notFound();
  return <EssentialsMorphLab />;
}

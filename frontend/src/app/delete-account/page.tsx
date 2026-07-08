import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Delete Account | Ascend" };

export default async function DeleteAccountPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolved = (await searchParams) ?? {};
  const status = Array.isArray(resolved.status) ? resolved.status[0] : resolved.status;
  const banner =
    status === "deleted"
      ? "Your Ascend account deletion has been completed."
      : status === "requested"
        ? "Your deletion request has been received. Ascend has disabled account access while the review is completed."
        : null;

  return (
    <>
      <LegalPage
        eyebrow="Account control"
        title="Delete your Ascend account"
        introduction="Ascend gives you a public path to request account deletion even if you no longer have the app installed. The fastest path is inside Ascend under Profile → Account → Delete Account."
        sections={[
          {
            title: "What data Ascend deletes",
            bullets: [
              "Your Ascend profile, sign-in access, and assigned in-app roles.",
              "Your meals, water, weight, workouts, habits, messages, Coach Zoe history, weekly reflections, Health Sync records, and other account-linked personal records stored by Ascend.",
              "Food, progress, profile, and body scan images stored by Ascend where available."
            ]
          },
          {
            title: "What may be retained",
            bullets: [
              "Payment processor, invoice, and tax/accounting records where retention is legally required.",
              "Security, fraud-prevention, and abuse-prevention logs where retention is reasonably necessary.",
              "Limited operational backups until they expire from normal backup retention cycles."
            ]
          },
          {
            title: "Deletion timeframe",
            paragraphs: [
              "Most standard member account deletions complete immediately after confirmation in the app.",
              "If your account has active billing, trainer/business role relationships, or another dependency that requires review, Ascend disables account access and completes the deletion workflow within a typical 30-day period."
            ]
          },
          {
            title: "How to request deletion without the app",
            paragraphs: [
              "Email support@getascend.fit from the email address linked to your Ascend account and use the subject line Account Deletion Request. Include any detail that helps us identify the account if you cannot access the app.",
              "You can also use the in-app self-service path after signing in: Profile → Account → Delete Account."
            ]
          },
          {
            title: "Privacy and support",
            paragraphs: [
              "Read our Privacy Policy for more detail about retention and data handling.",
              "For help, contact support@getascend.fit."
            ]
          }
        ]}
      />
      <div className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-xl rounded-lg border border-calm/30 bg-surface/95 p-4 text-sm text-zinc-200 shadow-2xl">
        {banner ? <p>{banner}</p> : <p>Need account deletion without the app? Use the direct request path below.</p>}
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <a
            href="mailto:support@getascend.fit?subject=Ascend%20Account%20Deletion%20Request"
            className="flex min-h-11 items-center justify-center rounded-lg bg-calm px-4 font-semibold text-ink"
          >
            Email deletion request
          </a>
          <Link href="/privacy" className="flex min-h-11 items-center justify-center rounded-lg border border-line px-4 font-semibold text-zinc-100">
            Privacy Policy
          </Link>
        </div>
      </div>
    </>
  );
}

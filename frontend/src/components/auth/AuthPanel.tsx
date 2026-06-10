"use client";

import { FormEvent, useState } from "react";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from "firebase/auth";
import { ArrowRight, Dumbbell, LogIn } from "lucide-react";
import { getFirebaseClientAuth } from "@/lib/firebase";
import { api } from "@/lib/api";
import { Field, inputClass } from "@/components/Field";

type Mode = "signup" | "login";

export function AuthPanel() {
  const [mode, setMode] = useState<Mode>("signup");
  const [fullName, setFullName] = useState("Ahmad Rahman");
  const [email, setEmail] = useState("ahmad@example.com");
  const [password, setPassword] = useState("");
  const [referralCode, setReferralCode] = useState("TRAINER-JASON");
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const firebaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN &&
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
      process.env.NEXT_PUBLIC_FIREBASE_APP_ID
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus(null);

    try {
      const credential =
        mode === "signup"
          ? await createUserWithEmailAndPassword(getFirebaseClientAuth(), email, password)
          : await signInWithEmailAndPassword(getFirebaseClientAuth(), email, password);

      if (mode === "signup" && fullName) {
        await updateProfile(credential.user, { displayName: fullName });
      }

      const token = await credential.user.getIdToken();
      await api(
        "/auth/provision",
        {
          method: "POST",
          body: JSON.stringify({
            fullName,
            referralCode,
            primaryRole: "client"
          })
        },
        token
      );

      window.location.href = "/onboarding";
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to continue. Check Firebase settings and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-ink px-4 py-5 text-white">
      <div className="mx-auto flex min-h-screen max-w-md flex-col">
        <header className="flex items-center gap-3 py-3">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-lime text-ink">
            <Dumbbell size={21} />
          </span>
          <div>
            <p className="text-lg font-semibold">Ascend</p>
            <p className="text-xs text-zinc-400">Austin Green and Kulai Indahpura launch</p>
          </div>
        </header>

        <section className="flex flex-1 flex-col justify-center">
          <div>
            <p className="text-sm text-zinc-400">{mode === "signup" ? "Create account" : "Welcome back"}</p>
            <h1 className="mt-2 text-4xl font-semibold leading-tight">
              {mode === "signup" ? "Start your accountability profile." : "Continue your progress."}
            </h1>
          </div>

          <form className="mt-6 space-y-4 rounded-lg border border-line bg-surface p-4" onSubmit={handleSubmit}>
            {!firebaseConfigured ? (
              <div className="rounded-lg border border-amber/40 bg-amber/10 p-3 text-sm leading-6 text-amber">
                Firebase is not configured locally yet. Use demo mode to review the MVP screens, or add Firebase web app values to
                `frontend/.env.local` for real sign-up.
              </div>
            ) : null}
            {mode === "signup" ? (
              <Field label="Full name">
                <input className={inputClass} value={fullName} onChange={(event) => setFullName(event.target.value)} />
              </Field>
            ) : null}
            <Field label="Email">
              <input className={inputClass} value={email} type="email" onChange={(event) => setEmail(event.target.value)} />
            </Field>
            <Field label="Password" hint="Use at least 6 characters for Firebase email sign-up.">
              <input className={inputClass} value={password} type="password" onChange={(event) => setPassword(event.target.value)} />
            </Field>
            {mode === "signup" ? (
              <Field label="Referral code" hint="Try AF-AUSTIN, AF-KULAI, TRAINER-JASON, or TRAINER-SITI.">
                <input
                  className={inputClass}
                  value={referralCode}
                  onChange={(event) => setReferralCode(event.target.value.toUpperCase())}
                />
              </Field>
            ) : null}
            {status ? <p className="rounded-lg border border-amber/40 bg-amber/10 p-3 text-sm leading-6 text-amber">{status}</p> : null}
            <button className="flex h-12 w-full items-center justify-center rounded-lg bg-lime font-semibold text-ink" disabled={isSubmitting || !firebaseConfigured}>
              {mode === "signup" ? <ArrowRight className="mr-2" size={18} /> : <LogIn className="mr-2" size={18} />}
              {isSubmitting ? "Working..." : mode === "signup" ? "Create account" : "Log in"}
            </button>
            {!firebaseConfigured ? (
              <button
                className="flex h-12 w-full items-center justify-center rounded-lg border border-line bg-ink font-semibold text-white"
                onClick={() => {
                  window.location.href = "/dashboard";
                }}
                type="button"
              >
                Continue in demo mode
              </button>
            ) : null}
          </form>

          <button
            className="mt-4 text-sm font-medium text-lime"
            onClick={() => setMode(mode === "signup" ? "login" : "signup")}
            type="button"
          >
            {mode === "signup" ? "Already have an account? Log in" : "Need an account? Sign up"}
          </button>
        </section>
      </div>
    </main>
  );
}

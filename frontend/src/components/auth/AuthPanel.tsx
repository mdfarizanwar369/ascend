"use client";

import { FormEvent, useState } from "react";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from "firebase/auth";
import { ArrowRight, LogIn } from "lucide-react";
import { getFirebaseClientAuth, waitForFirebasePersistence } from "@/lib/firebase";
import { api } from "@/lib/api";
import { Field, inputClass } from "@/components/Field";
import { getMe } from "@/lib/ascendApi";
import { BrandMark } from "@/components/BrandMark";

type Mode = "signup" | "login";
type SignupRole = "client" | "trainer";

export function AuthPanel() {
  const [mode, setMode] = useState<Mode>("signup");
  const [signupRole, setSignupRole] = useState<SignupRole>("client");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const firebaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN &&
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
      process.env.NEXT_PUBLIC_FIREBASE_APP_ID
  );

  function roleHome(roles: string[]) {
    if (roles.includes("owner") || roles.includes("admin")) return "/admin";
    if (roles.includes("trainer")) return "/trainer";
    return "/dashboard";
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus(null);

    try {
      await waitForFirebasePersistence();
      const auth = getFirebaseClientAuth();
      const credential =
        mode === "signup"
          ? await createUserWithEmailAndPassword(auth, email, password)
          : await signInWithEmailAndPassword(auth, email, password);

      if (mode === "signup" && fullName) {
        await updateProfile(credential.user, { displayName: fullName });
      }

      const token = await credential.user.getIdToken();
      await api(
        "/auth/provision",
        {
          method: "POST",
          body: JSON.stringify({
            fullName: mode === "signup" ? fullName.trim() || undefined : undefined,
            referralCode: mode === "signup" ? referralCode.trim() || undefined : undefined,
            primaryRole: mode === "signup" ? signupRole : "client"
          })
        },
        token
      );

      const profile = await getMe();
      window.location.href = mode === "signup" && signupRole === "client" ? "/onboarding" : roleHome(profile.roles);
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
          <BrandMark />
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
                Firebase is not configured locally yet. Use local preview mode to review the MVP screens, or add Firebase web app values to
                `frontend/.env.local` for real sign-up.
              </div>
            ) : null}
            {mode === "signup" ? (
              <>
                <div>
                  <p className="mb-2 text-sm font-medium">I am signing up as</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { value: "client", title: "Client", detail: "Track progress" },
                      { value: "trainer", title: "Trainer", detail: "Apply for tools" }
                    ].map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => setSignupRole(item.value as SignupRole)}
                        className={`rounded-lg border p-3 text-left ${
                          signupRole === item.value ? "border-lime bg-lime text-ink" : "border-line bg-ink text-white"
                        }`}
                      >
                        <span className="block text-sm font-semibold">{item.title}</span>
                        <span className={`mt-1 block text-xs ${signupRole === item.value ? "text-ink/70" : "text-zinc-400"}`}>
                          {item.detail}
                        </span>
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs leading-5 text-zinc-500">Owner/admin access is invite-only and cannot be selected here.</p>
                </div>
                <Field label="Full name">
                  <input className={inputClass} value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Your name" />
                </Field>
              </>
            ) : null}
            <Field label="Email">
              <input className={inputClass} value={email} type="email" onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
            </Field>
            <Field label="Password" hint="Use at least 6 characters for Firebase email sign-up.">
              <input className={inputClass} value={password} type="password" onChange={(event) => setPassword(event.target.value)} />
            </Field>
            {mode === "signup" ? (
              <Field
                label="Referral code"
                hint={
                  signupRole === "trainer"
                    ? "Use a gym referral code if you have one, for example AF-AUSTIN or AF-KULAI."
                    : "Use your gym or trainer code, for example AF-AUSTIN, AF-KULAI, or TRAINER-JASON."
                }
              >
                <input
                  className={inputClass}
                  value={referralCode}
                  placeholder={signupRole === "trainer" ? "AF-AUSTIN" : "TRAINER-JASON"}
                  onChange={(event) => setReferralCode(event.target.value.toUpperCase())}
                />
              </Field>
            ) : null}
            {status ? <p className="rounded-lg border border-amber/40 bg-amber/10 p-3 text-sm leading-6 text-amber">{status}</p> : null}
            <button className="flex h-12 w-full items-center justify-center rounded-lg bg-lime font-semibold text-ink" disabled={isSubmitting || !firebaseConfigured}>
              {mode === "signup" ? <ArrowRight className="mr-2" size={18} /> : <LogIn className="mr-2" size={18} />}
              {isSubmitting ? "Working..." : mode === "signup" ? signupRole === "trainer" ? "Create trainer account" : "Create client account" : "Log in"}
            </button>
            {!firebaseConfigured ? (
              <button
                className="flex h-12 w-full items-center justify-center rounded-lg border border-line bg-ink font-semibold text-white"
                onClick={() => {
                  window.location.href = "/dashboard";
                }}
                type="button"
              >
                Continue in local preview mode
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

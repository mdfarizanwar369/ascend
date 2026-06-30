"use client";

import { FormEvent, MouseEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  type User,
  type UserCredential,
  updateProfile
} from "firebase/auth";
import { ArrowRight, Chrome, LogIn } from "lucide-react";
import { getFirebaseClientAuth, waitForFirebasePersistence } from "@/lib/firebase";
import { api } from "@/lib/api";
import { Field, inputClass } from "@/components/Field";
import { getMe } from "@/lib/ascendApi";
import { BrandMark } from "@/components/BrandMark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { PublicFooter } from "@/components/legal/PublicFooter";
import { markInstallEligible } from "@/lib/installAscend";
import { isProgressiveOnboardingEnabled } from "@/lib/onboardingVersion";
import { isNativeAndroidCapacitor } from "@/lib/nativePlatform";

type Mode = "signup" | "login";
type SignupRole = "client" | "trainer";
type GoogleAuthMethod = "popup" | "redirect" | "native";
const authDraftKey = "ascend.authDraft.v1";
const googleRedirectPendingKey = "ascend.googleRedirectPending.v1";
const authDebugEnabled = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_AUTH_DEBUG === "true";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

function withTimeout<T>(promise: Promise<T>, message: string, ms = 25_000) {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

function getFriendlyAuthError(error: unknown) {
  if (!(error instanceof Error)) return "Unable to continue. Please try again.";
  const code = getAuthErrorCode(error);
  if (code === "auth/popup-blocked") return "Google sign-in was blocked by the browser. Please allow popups or use Safari/Chrome normally and try again.";
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return "Google sign-in was closed before it finished. Please try again when you are ready.";
  if (code === "auth/unauthorized-domain") return "This website is not authorized for Google sign-in yet. Please contact Ascend support.";
  if (code === "auth/network-request-failed") return "Google sign-in could not connect. Please check your internet connection and try again.";
  if (code === "auth/operation-not-supported-in-this-environment") return "Google sign-in is not supported in this browser mode. Please open Ascend in Safari or Chrome and try again.";
  if (code === "auth/account-exists-with-different-credential") return "This email already has an Ascend account. Please log in with your original sign-in method.";
  if (code === "auth/invalid-api-key" || code === "auth/app-not-authorized") return "Google sign-in is not configured correctly yet. Please contact Ascend support.";
  if (/auth\/email-already-in-use/i.test(error.message)) return "This email already has an account. Please log in instead.";
  if (/auth\/invalid-email/i.test(error.message)) return "Please enter a valid email address.";
  if (/auth\/weak-password/i.test(error.message)) return "Please use a password with at least 6 characters.";
  if (/API request failed: 404/i.test(error.message)) return "That referral code was not found. Please check it with your gym or trainer.";
  if (/network|fetch|timeout|timed out|taking too long/i.test(error.message)) {
    return "The connection is taking too long. Please check your internet connection and try again.";
  }
  return error.message;
}

function getAuthErrorCode(error: unknown) {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

function getPlatformInfo() {
  if (typeof window === "undefined") {
    return {
      browser: "server",
      isAndroid: false,
      isIOS: false,
      isMobile: false,
      isSafari: false,
      isStandalone: false,
      userAgent: ""
    };
  }

  const userAgent = window.navigator.userAgent || "";
  const platform = window.navigator.platform || "";
  const maxTouchPoints = window.navigator.maxTouchPoints || 0;
  const isIPadOS = platform === "MacIntel" && maxTouchPoints > 1;
  const isIOS = /iPad|iPhone|iPod/i.test(userAgent) || isIPadOS;
  const isAndroid = /Android/i.test(userAgent);
  const isSafari = /Safari/i.test(userAgent) && !/Chrome|CriOS|FxiOS|Edg|OPR|SamsungBrowser/i.test(userAgent);
  const isStandalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);

  return {
    browser: isSafari ? "Safari" : isAndroid ? "Android browser" : "Desktop browser",
    isAndroid,
    isIOS,
    isMobile: isIOS || isAndroid,
    isSafari,
    isStandalone,
    userAgent
  };
}

function chooseGoogleAuthMethod(): GoogleAuthMethod {
  if (isNativeAndroidCapacitor()) return "native";
  const platform = getPlatformInfo();
  return platform.isMobile || platform.isStandalone || platform.isSafari ? "redirect" : "popup";
}

function authDebug(event: string, details?: Record<string, unknown>) {
  if (!authDebugEnabled) return;
  console.info("[Ascend Auth]", event, details ?? {});
}

function authTrace(stage: string, details?: Record<string, unknown>) {
  if (!authDebugEnabled) return;
  const payload = { at: new Date().toISOString(), stage, ...(details ?? {}) };
  console.info("[Ascend Google Auth]", payload);
}

function describeUnknownError(error: unknown) {
  if (error instanceof Error) {
    return {
      code: getAuthErrorCode(error),
      message: error.message
    };
  }
  return {
    code: null,
    message: String(error)
  };
}

function waitForAuthStateUser(ms = 10_000) {
  const auth = getFirebaseClientAuth();
  return new Promise<User | null>((resolve) => {
    let unsubscribe = () => {};
    const timeout = window.setTimeout(() => {
      unsubscribe();
      authTrace("onAuthStateChanged timeout", {
        hasCurrentUser: Boolean(auth.currentUser),
        uid: auth.currentUser?.uid ?? null
      });
      resolve(auth.currentUser);
    }, ms);

    unsubscribe = onAuthStateChanged(auth, (user) => {
      window.clearTimeout(timeout);
      unsubscribe();
      authTrace("onAuthStateChanged event", {
        hasUser: Boolean(user),
        uid: user?.uid ?? null,
        email: user?.email ?? null,
        providerIds: user?.providerData.map((provider) => provider.providerId) ?? []
      });
      resolve(user);
    });
  });
}

function setGoogleRedirectPending() {
  try {
    window.sessionStorage.setItem(googleRedirectPendingKey, "true");
  } catch {
    // Redirect sign-in still works without the marker; the current-user fallback handles Safari storage edge cases.
  }
}

function clearGoogleRedirectPending() {
  try {
    window.sessionStorage.removeItem(googleRedirectPendingKey);
  } catch {
    // Ignore storage cleanup failures.
  }
}

function wasGoogleRedirectPending() {
  try {
    return window.sessionStorage.getItem(googleRedirectPendingKey) === "true";
  } catch {
    return false;
  }
}

function roleHome(roles: string[]) {
  if (roles.includes("owner") || roles.includes("admin")) return "/admin";
  if (roles.includes("trainer")) return "/trainer";
  return "/dashboard";
}

async function signInWithNativeAndroidGoogle() {
  const [{ FirebaseAuthentication }, { getFirebaseClientAuth }, { GoogleAuthProvider, signInWithCredential }] = await Promise.all([
    import("@capacitor-firebase/authentication"),
    import("@/lib/firebase"),
    import("firebase/auth")
  ]);

  const nativeResult = await FirebaseAuthentication.signInWithGoogle({
    skipNativeAuth: true,
    useCredentialManager: false
  });

  const idToken = nativeResult.credential?.idToken;
  const accessToken = nativeResult.credential?.accessToken;
  if (!idToken) {
    throw new Error("Google sign-in finished, but no Google ID token was returned.");
  }

  const auth = getFirebaseClientAuth();
  const credential = GoogleAuthProvider.credential(idToken, accessToken ?? undefined);
  const userCredential = await signInWithCredential(auth, credential);
  return {
    nativeResult,
    userCredential
  };
}

export function AuthPanel() {
  const router = useRouter();
  const hasProcessedRedirectAuth = useRef(false);
  const [mode, setMode] = useState<Mode>("signup");
  const [signupRole, setSignupRole] = useState<SignupRole>("client");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showTrainerSignup, setShowTrainerSignup] = useState(false);
  const progressiveClientSignup = isProgressiveOnboardingEnabled() && !showTrainerSignup;
  const googleSignInEnabled = process.env.NEXT_PUBLIC_GOOGLE_SIGN_IN_ENABLED === "true";
  const firebaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN &&
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
      process.env.NEXT_PUBLIC_FIREBASE_APP_ID
  );

  useEffect(() => {
    try {
      const draft = window.sessionStorage.getItem(authDraftKey);
      if (!draft) return;
      const parsed = JSON.parse(draft) as Partial<{
        mode: Mode;
        signupRole: SignupRole;
        fullName: string;
        email: string;
        referralCode: string;
      }>;
      if (parsed.mode === "signup" || parsed.mode === "login") setMode(parsed.mode);
      if (parsed.signupRole === "client" || parsed.signupRole === "trainer") setSignupRole(parsed.signupRole);
      if (typeof parsed.fullName === "string") setFullName(parsed.fullName);
      if (typeof parsed.email === "string") setEmail(parsed.email);
      if (typeof parsed.referralCode === "string") setReferralCode(parsed.referralCode);
    } catch {
      window.sessionStorage.removeItem(authDraftKey);
    }
  }, []);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(authDraftKey, JSON.stringify({ mode, signupRole, fullName, email, referralCode }));
    } catch {
      // Safari private browsing can reject storage. The form still works without drafts.
    }
  }, [email, fullName, mode, referralCode, signupRole]);

  const provisionGoogleUser = useCallback(async (user: User) => {
    authTrace("Firebase user received", {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      providerIds: user.providerData.map((provider) => provider.providerId)
    });
    const token = await user.getIdToken();
    authTrace("ID token retrieved", { uid: user.uid, tokenLength: token.length });

    const provisionBody = {
      fullName: user.displayName || undefined,
      referralCode: referralCode.trim() || undefined,
      primaryRole: "client"
    };
    authTrace("/auth/provision request", { body: provisionBody });

    const provisionResponse = await withTimeout(
      fetch(`${API_URL}/auth/provision`, {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(provisionBody)
      }),
      "Ascend profile setup is taking too long. Please try logging in again."
    );
    const provisionPayload = await provisionResponse.json().catch(() => null);
    authTrace("/auth/provision response", {
      ok: provisionResponse.ok,
      status: provisionResponse.status,
      body: provisionPayload
    });

    if (!provisionResponse.ok) {
      const detail =
        typeof provisionPayload?.error === "string"
          ? `${provisionPayload.error}${typeof provisionPayload?.detail === "string" ? ` ${provisionPayload.detail}` : ""}`
          : `Google profile setup failed with status ${provisionResponse.status}.`;
      throw new Error(detail);
    }

    markInstallEligible("signup");
    authTrace("Session creation", { uid: user.uid, persistedByFirebase: Boolean(getFirebaseClientAuth().currentUser) });
    const profile = await withTimeout(getMe(), "Your account is ready, but the dashboard is taking too long to load. Please open Ascend again.");
    authTrace("Auth state update", {
      uid: user.uid,
      roles: profile.roles,
      primaryRole: profile.user.primary_role,
      hasGoal: Boolean(profile.user.goal_type),
      hasStartingWeight: Boolean(profile.user.starting_weight_kg)
    });
    if (!profile.roles.includes("client")) {
      const destination = roleHome(profile.roles);
      authTrace("Final navigation decision", { destination, reason: "non_client_role" });
      router.replace(destination);
      return;
    }
    if (profile.user.goal_type && profile.user.starting_weight_kg) {
      authTrace("Final navigation decision", { destination: "/dashboard", reason: "profile_complete" });
      router.replace("/dashboard");
      return;
    }
    authTrace("Final navigation decision", { destination: "/onboarding", reason: "profile_incomplete" });
    router.replace("/onboarding");
  }, [referralCode, router]);

  useEffect(() => {
    if (!progressiveClientSignup || !googleSignInEnabled || !firebaseConfigured) return;
    let cancelled = false;

    async function completeRedirectSignIn() {
      if (hasProcessedRedirectAuth.current) return;
      try {
        const auth = getFirebaseClientAuth();
        const hasFirebaseRedirectParams = /[?&](apiKey|authType|providerId|oauth_token|oauth_verifier|code|state)=/.test(window.location.search);
        authTrace("Returned from Google", {
          href: window.location.href,
          redirectWasPending: wasGoogleRedirectPending(),
          hasFirebaseRedirectParams,
          hasCurrentUserBeforeResult: Boolean(auth.currentUser)
        });
        const authStateProbe = onAuthStateChanged(auth, (user) => {
          authTrace("onAuthStateChanged event", {
            phase: "redirect_probe",
            hasUser: Boolean(user),
            uid: user?.uid ?? null,
            email: user?.email ?? null,
            providerIds: user?.providerData.map((provider) => provider.providerId) ?? []
          });
        });
        authDebug("redirect_result_check_started", getPlatformInfo());
        authTrace("getRedirectResult called", { authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN });
        let result: UserCredential | null;
        try {
          result = await getRedirectResult(auth);
        } finally {
          authStateProbe();
        }
        authTrace("getRedirectResult completed", {
          hasResult: Boolean(result),
          providerId: result?.providerId ?? null,
          hasUser: Boolean(result?.user),
          currentUserAfterResult: Boolean(auth.currentUser)
        });
        if (!result || cancelled) {
          const redirectWasPending = wasGoogleRedirectPending();
          const fallbackUser = auth.currentUser ?? (await waitForAuthStateUser());
          authTrace("Auth state fallback checked", {
            redirectWasPending,
            hasFallbackUser: Boolean(fallbackUser),
            uid: fallbackUser?.uid ?? null
          });
          if (fallbackUser && !cancelled) {
            authDebug("redirect_result_empty_current_user_fallback", { redirectWasPending, uid: fallbackUser.uid });
            hasProcessedRedirectAuth.current = true;
            clearGoogleRedirectPending();
            setIsSubmitting(true);
            setStatus("Finishing Google sign-in...");
            await provisionGoogleUser(fallbackUser);
            return;
          }
          authDebug("redirect_result_empty", { redirectWasPending, hasCurrentUser: Boolean(auth.currentUser) });
          if (redirectWasPending || hasFirebaseRedirectParams) {
            setStatus("Google returned to Ascend, but Firebase did not provide a signed-in user. Please try again.");
          }
          return;
        }
        authDebug("redirect_result_success", { providerId: result.providerId });
        authTrace("Firebase UID", { uid: result.user.uid });
        hasProcessedRedirectAuth.current = true;
        clearGoogleRedirectPending();
        setIsSubmitting(true);
        setStatus("Setting up your Ascend profile...");
        await provisionGoogleUser(result.user);
        authDebug("redirect_auth_completed");
        authTrace("Authentication completed", { uid: result.user.uid });
      } catch (error) {
        const errorDetails = describeUnknownError(error);
        authDebug("redirect_result_error", errorDetails);
        authTrace("Google redirect flow failed", errorDetails);
        if (!cancelled) setStatus(getFriendlyAuthError(error));
      } finally {
        if (!cancelled) setIsSubmitting(false);
      }
    }

    void completeRedirectSignIn();

    return () => {
      cancelled = true;
    };
  }, [firebaseConfigured, googleSignInEnabled, progressiveClientSignup, provisionGoogleUser]);

  async function handleAuthAction() {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setStatus(null);

    try {
      const normalizedEmail = email.trim();
      const normalizedFullName = fullName.trim();
      const normalizedReferralCode = referralCode.trim();
      const effectiveSignupRole: SignupRole = progressiveClientSignup ? "client" : signupRole;

      if (!normalizedEmail || !password) {
        setStatus("Please enter your email and password.");
        return;
      }

      if (mode === "signup" && !normalizedFullName) {
        setStatus("Please enter your full name.");
        return;
      }

      if (mode === "signup" && effectiveSignupRole === "trainer" && !normalizedReferralCode) {
        setStatus("Please enter the gym or trainer referral code provided by the gym owner.");
        return;
      }

      if (mode === "signup" && normalizedReferralCode) {
        setStatus("Checking your referral code...");
        await withTimeout(
          api(`/referrals/validate/${encodeURIComponent(normalizedReferralCode)}`),
          "The referral code check is taking too long. Please check your connection and try again.",
          15_000
        );
      }

      setStatus(mode === "signup" ? "Creating your Ascend account..." : "Logging you in...");
      await withTimeout(
        waitForFirebasePersistence(),
        "Secure login is taking too long to start. Please check your connection and try again.",
        15_000
      );
      const auth = getFirebaseClientAuth();
      const credential =
        mode === "signup"
          ? await withTimeout(
              createUserWithEmailAndPassword(auth, normalizedEmail, password),
              "Account creation is taking too long. Please check internet connection and try again."
            )
          : await withTimeout(
              signInWithEmailAndPassword(auth, normalizedEmail, password),
              "Login is taking too long. Please check internet connection and try again."
            );

      if (mode === "signup" && normalizedFullName) {
        await withTimeout(
          updateProfile(credential.user, { displayName: normalizedFullName }),
          "Your account was created, but the name update took too long. Please continue."
        );
      }

      const token = await credential.user.getIdToken();
      setStatus("Setting up your Ascend profile...");
      await withTimeout(
        api(
        "/auth/provision",
        {
          method: "POST",
          body: JSON.stringify({
            fullName: mode === "signup" ? normalizedFullName : undefined,
            referralCode: mode === "signup" ? normalizedReferralCode || undefined : undefined,
            primaryRole: mode === "signup" ? effectiveSignupRole : "client"
          })
        },
        token
        ),
        "Ascend profile setup is taking too long. Please try logging in again."
      );

      window.sessionStorage.removeItem(authDraftKey);

      if (mode === "signup") markInstallEligible("signup");

      if (mode === "signup" && effectiveSignupRole === "client") {
        router.replace("/onboarding");
        return;
      }

      const profile = await withTimeout(getMe(), "Your account is ready, but the dashboard is taking too long to load. Please open Ascend again.");
      router.replace(roleHome(profile.roles));
    } catch (error) {
      setStatus(getFriendlyAuthError(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void handleAuthAction();
  }

  function handleAuthButtonClick(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    void handleAuthAction();
  }

  async function handleGoogleSignIn() {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setStatus(null);

    try {
      const platform = getPlatformInfo();
      const method = chooseGoogleAuthMethod();
      authDebug("google_button_clicked", { ...platform, method });
      setStatus(
        method === "native"
          ? "Opening secure Google sign-in..."
          : method === "redirect"
            ? "Opening secure Google sign-in..."
            : "Opening secure Google sign-in popup..."
      );

      if (method === "native") {
        authTrace("Native Google sign-in initiated", { platform: "android-capacitor" });
        const { nativeResult, userCredential } = await withTimeout(
          signInWithNativeAndroidGoogle(),
          "Google sign-in is taking too long. Please check your connection and try again.",
          30_000
        );
        authTrace("Native Google sign-in completed", {
          providerId: nativeResult.credential?.providerId ?? null,
          hasAccessToken: Boolean(nativeResult.credential?.accessToken),
          hasIdToken: Boolean(nativeResult.credential?.idToken),
          firebaseUid: userCredential.user.uid
        });
        setStatus("Setting up your Ascend profile...");
        await provisionGoogleUser(userCredential.user);
        authDebug("google_native_auth_completed");
        return;
      }

      const auth = getFirebaseClientAuth();
      auth.useDeviceLanguage();
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });

      if (method === "redirect") {
        authTrace("Redirect initiated", {
          authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
          platform
        });
        authDebug("google_redirect_started", { authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN });
        setGoogleRedirectPending();
        await withTimeout(
          waitForFirebasePersistence(),
          "Secure Google sign-in is taking too long to start. Please check your connection and try again.",
          15_000
        );
        await signInWithRedirect(auth, provider);
        return;
      }

      authDebug("google_popup_opening", { authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN });
      let userCredential;
      try {
        userCredential = await withTimeout(
          signInWithPopup(auth, provider),
          "Google sign-in is taking too long. Please check your connection and try again.",
          25_000
        );
      } catch (error) {
        const code = getAuthErrorCode(error);
        authDebug("google_popup_error", {
          code,
          message: error instanceof Error ? error.message : String(error)
        });
        if (code === "auth/popup-blocked" || code === "auth/cancelled-popup-request") {
          authTrace("Redirect initiated", {
            authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
            reason: "popup_fallback",
            platform
          });
          authDebug("google_popup_fallback_redirect_started");
          setGoogleRedirectPending();
          await withTimeout(
            waitForFirebasePersistence(),
            "Secure Google sign-in is taking too long to start. Please check your connection and try again.",
            15_000
          );
          await signInWithRedirect(auth, provider);
          return;
        }
        throw error;
      }

      authDebug("google_popup_success");
      setStatus("Setting up your Ascend profile...");
      await provisionGoogleUser(userCredential.user);
      authDebug("google_auth_completed");
    } catch (error) {
      authDebug("google_auth_error", {
        code: getAuthErrorCode(error),
        message: error instanceof Error ? error.message : String(error)
      });
      setStatus(getFriendlyAuthError(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-ink px-4 py-5 text-white">
      <div className="mx-auto flex min-h-screen max-w-md flex-col">
        <header className="flex items-center justify-between gap-3 py-3">
          <div className="flex items-center gap-3">
            <BrandMark />
            <div>
              <p className="text-lg font-semibold">Ascend</p>
              <p className="text-xs text-zinc-400">The missing link between training and results</p>
            </div>
          </div>
          <ThemeToggle />
        </header>

        <section className="flex flex-1 flex-col justify-center">
          <div>
            <p className="text-sm text-zinc-400">{mode === "signup" ? "Create account" : "Welcome back"}</p>
            <h1 className="mt-2 text-4xl font-semibold leading-tight">
              {mode === "signup" ? "Start your Ascend journey." : "Continue your progress."}
            </h1>
          </div>

          <form className="mt-6 space-y-4 rounded-lg border border-line bg-surface p-4" noValidate onSubmit={handleAuthSubmit}>
            {!firebaseConfigured ? (
              <div className="rounded-lg border border-amber/40 bg-amber/10 p-3 text-sm leading-6 text-amber">
                Firebase is not configured locally yet. Use local preview mode to review the MVP screens, or add Firebase web app values to
                `frontend/.env.local` for real sign-up.
              </div>
            ) : null}
            {progressiveClientSignup && googleSignInEnabled ? (
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isSubmitting || !firebaseConfigured}
                className="flex h-12 w-full items-center justify-center rounded-lg bg-white font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Chrome className="mr-2" size={18} />
                {isSubmitting ? "Working..." : "Continue with Google"}
              </button>
            ) : null}
            {progressiveClientSignup && googleSignInEnabled ? (
              <div className="flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-zinc-500">
                <span className="h-px flex-1 bg-line" />
                <span>or</span>
                <span className="h-px flex-1 bg-line" />
              </div>
            ) : null}
            {mode === "signup" && !progressiveClientSignup ? (
              <>
                <div id="ascend-role-field">
                  <p className="mb-2 text-sm font-medium">I am signing up as</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { value: "client", title: "Client", detail: "Stay consistent" },
                      { value: "trainer", title: "Trainer", detail: "Coach clients" }
                    ].map((item) => (
                      <button
                        key={item.value}
                        id={`ascend-role-${item.value}`}
                        data-ascend-role={item.value}
                        type="button"
                        aria-pressed={signupRole === item.value}
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
                <div id="ascend-full-name-field">
                  <Field label="Full name">
                  <input
                    id="ascend-full-name"
                    autoComplete="name"
                    className={inputClass}
                    required
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    placeholder="Your name"
                  />
                  </Field>
                </div>
              </>
            ) : null}
            {mode === "signup" && progressiveClientSignup ? (
              <div id="ascend-full-name-field">
                <Field label="Full name">
                  <input
                    id="ascend-full-name"
                    autoComplete="name"
                    className={inputClass}
                    required
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    placeholder="Your name"
                  />
                </Field>
              </div>
            ) : null}
            <Field label="Email">
              <input
                id="ascend-email"
                autoComplete="email"
                className={inputClass}
                required
                value={email}
                type="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
              />
            </Field>
            <Field label="Password" hint="Use at least 6 characters for Firebase email sign-up.">
              <input
                id="ascend-password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                className={inputClass}
                minLength={6}
                required
                value={password}
                type="password"
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>
            {mode === "signup" ? (
              <div id="ascend-referral-field">
              <Field
                label="Referral code"
                hint={
                  signupRole === "trainer"
                    ? "Use your gym code if you have one."
                    : "Use your gym or trainer code if you have one."
                }
              >
                <input
                  id="ascend-referral"
                  autoComplete="off"
                  className={inputClass}
                  value={referralCode}
                  placeholder={signupRole === "trainer" ? "AF-AUSTIN" : "Optional"}
                  onChange={(event) => setReferralCode(event.target.value.toUpperCase())}
                />
              </Field>
              </div>
            ) : null}
            <p
              id="ascend-auth-status"
              role="alert"
              aria-live="polite"
              className={`rounded-lg border border-amber/40 bg-amber/10 p-3 text-sm leading-6 text-amber ${status ? "" : "hidden"}`}
            >
              {status}
            </p>
            <button
              id="ascend-auth-action"
              type="button"
              className="flex h-12 w-full items-center justify-center rounded-lg bg-lime font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSubmitting || !firebaseConfigured}
              onClick={handleAuthButtonClick}
            >
              {mode === "signup" ? <ArrowRight className="mr-2" size={18} /> : <LogIn className="mr-2" size={18} />}
              {isSubmitting ? "Working..." : mode === "signup" ? signupRole === "trainer" ? "Create trainer account" : progressiveClientSignup ? "Continue with Email" : "Create client account" : "Log in"}
            </button>
            {mode === "signup" ? (
              <p className="text-center text-xs leading-5 text-zinc-500">
                By creating an account, you agree to Ascend&apos;s{" "}
                <Link href="/terms" className="text-calm hover:underline">Terms</Link> and{" "}
                <Link href="/privacy" className="text-calm hover:underline">Privacy Policy</Link>.
              </p>
            ) : null}
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
            id="ascend-auth-toggle"
            className="mt-4 text-sm font-medium text-lime"
            onClick={() => setMode(mode === "signup" ? "login" : "signup")}
            type="button"
          >
            {mode === "signup" ? "Already have an account? Log in" : "Need an account? Sign up"}
          </button>
          {progressiveClientSignup && mode === "signup" ? (
            <button
              className="mt-3 text-sm font-medium text-zinc-400"
              onClick={() => {
                setShowTrainerSignup(true);
                setSignupRole("trainer");
                setMode("signup");
              }}
              type="button"
            >
              Are you a Trainer? <span className="text-lime">Register here</span>
            </button>
          ) : null}
        </section>
        <PublicFooter compact />
      </div>
    </main>
  );
}

import { SubscriptionPlan } from "@ascend/shared";
import { getMe, getMySubscription } from "@/lib/ascendApi";
import { usablePlan } from "@/lib/subscriptionPlan";

export type AccountProfileSnapshot = {
  email: string;
  fullName: string;
  roles: string[];
  isPlatformOwner?: boolean;
  profilePhotoUrl?: string | null;
};

const PROFILE_CACHE_KEY = "ascend:account-profile";
const PROFILE_CACHE_TTL_MS = 5 * 60 * 1000;

let profileMemoryCache: { value: AccountProfileSnapshot; cachedAt: number } | null = null;
let profileRequest: Promise<AccountProfileSnapshot> | null = null;

function accountTimingEnabled() {
  if (process.env.NEXT_PUBLIC_ACCOUNT_TIMING === "1") return true;
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem("ascend:account-timing") === "1";
}

function timing(label: string, startedAt: number, extra: Record<string, unknown> = {}) {
  if (!accountTimingEnabled()) return;
  console.info("[account-bar-timing]", label, {
    durationMs: Math.round(performance.now() - startedAt),
    ...extra
  });
}

function normalizeProfile(response: Awaited<ReturnType<typeof getMe>>): AccountProfileSnapshot {
  return {
    email: response.user.email,
    fullName: response.user.full_name,
    roles: response.roles ?? [],
    isPlatformOwner: response.user.is_platform_owner === true,
    profilePhotoUrl: response.user.profile_photo_url
  };
}

function readStoredProfile() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { value?: AccountProfileSnapshot; cachedAt?: number };
    if (!parsed.value || !parsed.cachedAt) return null;
    if (Date.now() - parsed.cachedAt > PROFILE_CACHE_TTL_MS) return null;
    return { value: parsed.value, cachedAt: parsed.cachedAt };
  } catch {
    return null;
  }
}

function writeStoredProfile(value: AccountProfileSnapshot) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ value, cachedAt: Date.now() }));
  } catch {
    // Session cache is a performance hint only.
  }
}

export function cacheAccountProfile(value: AccountProfileSnapshot) {
  profileMemoryCache = { value, cachedAt: Date.now() };
  writeStoredProfile(value);
}

export function getCachedAccountProfile() {
  if (profileMemoryCache && Date.now() - profileMemoryCache.cachedAt <= PROFILE_CACHE_TTL_MS) {
    return profileMemoryCache.value;
  }
  const stored = readStoredProfile();
  if (stored) {
    profileMemoryCache = stored;
    return stored.value;
  }
  return null;
}

export async function loadAccountProfile() {
  const startedAt = performance.now();
  const cached = getCachedAccountProfile();
  if (cached) {
    timing("/me cache hit", startedAt, { roles: cached.roles });
    return cached;
  }

  if (!profileRequest) {
    profileRequest = getMe()
      .then((response) => {
        const profile = normalizeProfile(response);
        cacheAccountProfile(profile);
        timing("/me network", startedAt, { roles: profile.roles });
        return profile;
      })
      .finally(() => {
        profileRequest = null;
      });
  }

  return profileRequest;
}

export async function loadAccountPlan() {
  const startedAt = performance.now();
  const subscription = await getMySubscription();
  const plan = usablePlan(subscription.subscription.plan, subscription.subscription.status, subscription.subscription.current_period_end);
  timing("subscription lookup", startedAt, { plan });
  return plan;
}

export function clearCachedAccountProfile() {
  profileMemoryCache = null;
  profileRequest = null;
  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(PROFILE_CACHE_KEY);
  }
}

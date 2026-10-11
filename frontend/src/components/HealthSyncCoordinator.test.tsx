import { act,cleanup,render } from "@testing-library/react";
import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";

const mocks=vi.hoisted(() => ({
  authCallback:null as ((user:unknown) => void) | null,
  resolvePersistence:null as (() => void) | null,
  runApple:vi.fn(),disconnect:vi.fn(),addListener:vi.fn(),remove:vi.fn()
}));

vi.mock("next/navigation",() => ({ usePathname:() => "/dashboard" }));
vi.mock("firebase/auth",() => ({ onAuthStateChanged:vi.fn((_auth,callback) => { mocks.authCallback=callback; return vi.fn(); }) }));
vi.mock("@capacitor/app",() => ({ App:{ addListener:mocks.addListener } }));
vi.mock("@/lib/healthConnect",() => ({ canUseHealthConnect:() => false }));
vi.mock("@/lib/healthSyncClient",() => ({ runHealthConnectSync:vi.fn(),shouldAutoSyncHealthConnect:vi.fn() }));
vi.mock("@/lib/appleHealth",() => ({
  AppleHealth:{ disconnect:mocks.disconnect },hasAppleHealthBridge:() => true,runAppleHealthSync:mocks.runApple
}));
vi.mock("@/lib/firebase",() => ({
  getFirebaseClientAuth:() => ({}),
  waitForFirebasePersistence:() => new Promise<void>(resolve => { mocks.resolvePersistence=resolve; })
}));

import { HealthSyncCoordinator } from "./HealthSyncCoordinator";

beforeEach(() => {
  vi.useFakeTimers();
  mocks.authCallback=null; mocks.resolvePersistence=null;
  mocks.runApple.mockReset().mockResolvedValue(undefined);
  mocks.disconnect.mockReset().mockResolvedValue(undefined);
  mocks.remove.mockReset().mockResolvedValue(undefined);
  mocks.addListener.mockReset().mockResolvedValue({ remove:mocks.remove });
});

afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); });

describe("Apple Health automatic sync coordinator",() => {
  it("waits for restored Firebase auth before touching the native Health connection",async () => {
    render(<HealthSyncCoordinator />);
    await act(async () => { vi.advanceTimersByTime(2_500); await Promise.resolve(); });

    expect(mocks.runApple).not.toHaveBeenCalled();
    expect(mocks.disconnect).not.toHaveBeenCalled();

    await act(async () => { mocks.resolvePersistence?.(); await Promise.resolve(); });
    expect(mocks.authCallback).not.toBeNull();
    act(() => { mocks.authCallback?.({ uid:"member" }); });
    await act(async () => { vi.advanceTimersByTime(2_100); await Promise.resolve(); });

    expect(mocks.runApple).toHaveBeenCalledOnce();
    expect(mocks.disconnect).not.toHaveBeenCalled();
  });

  it("clears native Health state only after restored auth confirms sign-out",async () => {
    render(<HealthSyncCoordinator />);
    await act(async () => { mocks.resolvePersistence?.(); await Promise.resolve(); });
    act(() => { mocks.authCallback?.(null); });
    await act(async () => { await Promise.resolve(); });

    expect(mocks.disconnect).toHaveBeenCalledOnce();
    expect(mocks.runApple).not.toHaveBeenCalled();
  });
});

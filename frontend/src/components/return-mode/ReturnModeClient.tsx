"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { claimReturnMode, continueReturnMode } from "@/lib/ascendApi";
import {
  consumeReturnModeHandoff,
  firstNameFromFullName,
  isReturnModeV1Enabled
} from "@/lib/returnMode";
import { claimTodayEssentialsColdLaunch } from "@/lib/todayEssentialsLaunch";

type ReturnModeViewProps = {
  firstName?: string | null;
  onContinue: () => void;
};

export function ReturnModeView({ firstName, onContinue }: ReturnModeViewProps) {
  return (
    <main className="ascend-return-mode" aria-labelledby="return-mode-title">
      <div className="ascend-return-mode__ambient" aria-hidden="true" />
      <div className="ascend-return-mode__shell">
        <div className="ascend-return-mode__mark" aria-hidden="true">
          <Image
            src="/brand/ascend-mark-exact.png"
            alt=""
            fill
            sizes="112px"
            className="object-contain"
            priority
          />
        </div>

        <section className="ascend-return-mode__message">
          <h1 id="return-mode-title">
            {firstName ? `Good to have you back, ${firstName}.` : "Good to have you back."}
          </h1>
          <p>Your progress is still here. We’ll continue from today—at your pace.</p>
        </section>

        <button type="button" className="ascend-return-mode__button" onClick={onContinue} autoFocus>
          See today
        </button>
      </div>
    </main>
  );
}

export function ReturnModeClient() {
  const router = useRouter();
  const [fullName, setFullName] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const continuedRef = useRef(false);
  const resolutionStartedRef = useRef(false);

  useEffect(() => {
    if (resolutionStartedRef.current) return;
    resolutionStartedRef.current = true;
    let active = true;
    router.prefetch("/dashboard");

    if (!isReturnModeV1Enabled()) {
      router.replace("/dashboard");
      return () => {
        active = false;
      };
    }

    const handoff = consumeReturnModeHandoff();
    if (handoff) {
      claimTodayEssentialsColdLaunch();
      setFullName(handoff.fullName);
      setReady(true);
      return () => {
        active = false;
      };
    }

    claimReturnMode()
      .then((response) => {
        if (!active) return;
        if (!response.returnMode.claimed) {
          router.replace("/dashboard");
          return;
        }
        claimTodayEssentialsColdLaunch();
        setFullName(response.returnMode.fullName ?? null);
        setReady(true);
      })
      .catch(() => {
        if (active) router.replace("/dashboard");
      });

    return () => {
      active = false;
    };
  }, [router]);

  function seeToday() {
    if (continuedRef.current) return;
    continuedRef.current = true;
    void continueReturnMode().catch(() => undefined);
    router.replace("/dashboard");
  }

  if (!ready) {
    return (
      <main className="ascend-return-mode" aria-busy="true" aria-label="Opening Today">
        <div className="ascend-return-mode__ambient" aria-hidden="true" />
        <div className="ascend-return-mode__resolving-mark" aria-hidden="true">
          <Image src="/brand/ascend-mark-exact.png" alt="" fill sizes="80px" className="object-contain" priority />
        </div>
      </main>
    );
  }

  return <ReturnModeView firstName={firstNameFromFullName(fullName)} onContinue={seeToday} />;
}

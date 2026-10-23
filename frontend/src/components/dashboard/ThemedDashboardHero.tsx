import Link from "next/link";
import type { CSSProperties } from "react";

type ThemedDashboardHeroProps = {
  calorieTarget: number;
  caloriesLogged: number;
  calorieProgress: number;
  guideNeedsProfile: boolean;
};

export function ThemedDashboardHero({ calorieTarget, caloriesLogged, calorieProgress, guideNeedsProfile }: ThemedDashboardHeroProps) {
  const hasGuide = Number.isFinite(calorieTarget) && calorieTarget > 0;
  const difference = hasGuide ? Math.round(calorieTarget - caloriesLogged) : null;
  const aboveGuide = difference !== null && difference < 0;
  const balance = difference === null ? "—" : Math.abs(difference).toLocaleString();
  const balanceLabel = difference === null ? "Set your calorie guide" : aboveGuide ? "kcal above guide" : "kcal left";
  const ringProgress = hasGuide ? Math.max(0, Math.min(100, calorieProgress)) : 0;
  const ringStyle = { "--ascend-themed-ring-progress": `${ringProgress}%` } as CSSProperties;

  return (
    <section className="ascend-themed-hero" aria-label="Your themed daily overview">
      <div className="ascend-themed-hero-intro">
        <p className="ascend-themed-kicker"><span className="ascend-themed-kicker-default">Your day</span><span className="ascend-themed-kicker-club">Ascend Club</span></p>
        <h1 className="ascend-themed-title">
          <span className="ascend-themed-title-gym">Gym<br />Girl Club</span>
          <span className="ascend-themed-title-cute">Cute ♡<br />Lift Club</span>
          <span className="ascend-themed-title-iron">Keep the<br />momentum.</span>
          <span className="ascend-themed-title-summit">Keep the<br />momentum.</span>
          <span className="ascend-themed-title-club">Move<br />together.</span>
        </h1>
        <p className="ascend-themed-mantra"><span className="ascend-themed-mantra-default">One good choice at a time.</span><span className="ascend-themed-mantra-club">Every step counts. Make it yours.</span></p>
      </div>

      <Link href={hasGuide ? "/food-log" : "/profile/guide"} className="ascend-themed-balance ascend-pressable" aria-label={difference === null ? "Set your calorie guide in Ascend" : `${balance} ${balanceLabel}. Open food log.`}>
        <span className="ascend-themed-balance-kicker">Today&apos;s balance</span>
        <span className="ascend-themed-balance-main">
          <span className="ascend-themed-calorie-ring" data-over={aboveGuide ? "true" : "false"} style={ringStyle} aria-hidden="true" />
          <span className="ascend-themed-balance-copy">
            <strong>{balance}</strong>
            <span>{balanceLabel}</span>
          </span>
        </span>
        <span className="ascend-themed-balance-footer">
          {guideNeedsProfile ? "Your guide becomes more personal with your profile." : caloriesLogged > 0 ? `${Math.round(caloriesLogged).toLocaleString()} of ${Math.round(calorieTarget).toLocaleString()} kcal logged today` : "Fuel the day you want to build."}
        </span>
      </Link>
    </section>
  );
}

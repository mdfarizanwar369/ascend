import { normalizeAscendLocale, type AscendLocale } from "@ascend/shared";
import type { TodayPriorityCandidate, TodayPriorityFacts } from "./todayPriorityService";

type PriorityLike = Omit<TodayPriorityCandidate, "rank"> & { rank: number } | {
  key: null;
  title: string;
  reason: string;
  href: string;
  cta: string;
  rank: number;
};

type Copy = { title: string; reason: string; cta: string; insight: string };

const copy: Record<AscendLocale, Record<"Meal" | "Water" | "Movement" | "default", Copy>> = {
  en: {
    Meal: { title: "Log a meal to make today visible", reason: "One honest meal log gives Ascend a useful signal for the rest of your day.", cta: "Log meal", insight: "Food is the clearest opportunity today. Keep the next meal simple and protein-rich." },
    Water: { title: "Keep sipping water", reason: "A steady approach to your water target works better than trying to finish it all at once.", cta: "Log water", insight: "Keep sipping gradually toward today's water guide rather than forcing it all at once." },
    Movement: { title: "Add useful movement today", reason: "Choose a manageable session or walk that suits your energy today.", cta: "Log movement", insight: "Movement is the clearest opportunity today. One manageable session is enough." },
    default: { title: "Keep today simple", reason: "Your important basics are already moving. Choose one useful action when you're ready.", cta: "View progress", insight: "Your important basics are already in motion. Keep the rest of today steady." }
  },
  "ms-MY": {
    Meal: { title: "Rekod makanan untuk lengkapkan gambaran hari ini", reason: "Satu rekod makanan yang jujur memberi Ascend petunjuk berguna untuk sepanjang hari anda.", cta: "Rekod makanan", insight: "Pemakanan ialah peluang paling jelas hari ini. Pastikan hidangan seterusnya ringkas dan tinggi protein." },
    Water: { title: "Teruskan minum air", reason: "Minum secara berkala lebih baik daripada cuba menghabiskan sasaran air sekaligus.", cta: "Rekod air", insight: "Minum air sedikit demi sedikit untuk mencapai sasaran hari ini, bukan sekaligus." },
    Movement: { title: "Tambah sedikit aktiviti hari ini", reason: "Pilih sesi ringan atau berjalan mengikut tahap tenaga anda hari ini.", cta: "Rekod aktiviti", insight: "Aktiviti ialah peluang paling jelas hari ini. Satu sesi yang mudah diselesaikan sudah mencukupi." },
    default: { title: "Ringkaskan hari ini", reason: "Perkara asas yang penting sudah berjalan. Pilih satu tindakan berguna apabila anda bersedia.", cta: "Lihat kemajuan", insight: "Perkara asas yang penting sudah berjalan. Kekalkan rentak yang stabil sepanjang hari ini." }
  },
  "zh-Hans": {
    Meal: { title: "记录一餐，完善今天的数据", reason: "如实记录一餐，就能让 Ascend 更好地指导你今天接下来的行动。", cta: "记录饮食", insight: "饮食是今天最值得关注的部分。下一餐保持简单，并优先选择蛋白质。" },
    Water: { title: "继续补充水分", reason: "持续少量补水，比一次喝完目标水量更合适。", cta: "记录饮水", insight: "请少量多次补水，逐步达到今天的饮水目标。" },
    Movement: { title: "今天增加一点活动", reason: "按照今天的精力，选择轻松可完成的训练或步行。", cta: "记录活动", insight: "活动是今天最值得关注的部分。完成一次适合自己的短时训练就足够了。" },
    default: { title: "今天保持简单", reason: "重要的基础行动已经开始。准备好时，再完成一件有帮助的事。", cta: "查看进度", insight: "重要的基础行动已经开始。今天接下来保持稳定即可。" }
  }
};

export function renderTodayPriorityCopy(priority: PriorityLike, _facts: TodayPriorityFacts, localeInput?: string | null): PriorityLike {
  const locale = normalizeAscendLocale(localeInput);
  if (locale === "en") return priority;
  const key = priority.key ?? "default";
  const value = copy[locale][key];
  return { ...priority, title: value.title, reason: value.reason, cta: value.cta };
}

export function renderDailyInsightCopy(priority: PriorityLike, facts: TodayPriorityFacts, localeInput?: string | null) {
  const locale = normalizeAscendLocale(localeInput);
  if (locale === "en") {
    if (priority.key === "Meal") {
      const body = facts.workoutCompletedToday
        ? "Your movement is complete. A protein-rich meal is the clearest way to support recovery now."
        : facts.mealsToday === 0
          ? "Start with one honest meal. That gives Ascend something real to guide the rest of your day."
          : "Food is the clearest opportunity left today. Make the next meal protein-rich and keep it simple.";
      return { title: "Today's Insight", body, href: priority.href, locale };
    }
    if (priority.key === "Movement") {
      const gentle = facts.daysSinceWorkout === 1 || facts.sleepQuality === "poor";
      const body = gentle
        ? "Today does not need intensity. Gentle movement is enough to keep your rhythm without forcing recovery."
        : facts.stepsToday >= 2_500
          ? `You already have ${facts.stepsToday.toLocaleString()} steps. A short walk is enough to build on that.`
          : facts.daysSinceWorkout !== null && facts.daysSinceWorkout >= 3
            ? `It has been ${facts.daysSinceWorkout} days since your last recorded workout. A short session is the most useful next step.`
            : "Movement is the clearest opportunity today. One manageable session is enough.";
      return { title: "Today's Insight", body, href: priority.href, locale };
    }
    if (priority.key === "Water") {
      const waterLeftMl = Math.max(0, facts.waterTargetMl - facts.waterTodayMl);
      return { title: "Today's Insight", body: `${Number((waterLeftMl / 1000).toFixed(1))}L remains toward today's water guide. Keep sipping gradually rather than forcing it at once.`, href: priority.href, locale };
    }
    return { title: "Today's Insight", body: "Your important basics are already in motion. Protect the progress you have built and keep the rest of today steady.", href: priority.href, locale };
  }
  const localizedPriority = renderTodayPriorityCopy(priority, facts, locale);
  const key = localizedPriority.key ?? "default";
  return {
    title: locale === "ms-MY" ? "Pandangan hari ini" : "今日洞察",
    body: copy[locale][key].insight,
    href: localizedPriority.href,
    locale
  };
}

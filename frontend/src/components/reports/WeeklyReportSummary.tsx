"use client";

import { useI18n } from "@/lib/i18n/I18nProvider";
import { englishMessage, type Translate } from "@/lib/i18n/static";

type WeeklyReportAudience = "client" | "trainer";

type Section = {
  title: string;
  body: string;
  tone: "calm" | "lime" | "amber" | "zinc";
};

function cleanText(value: string) {
  return value
    .replace(/\*\*/g, "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractNamedSections(value: string) {
  const compact = cleanText(value).replace(/\n+/g, " ");
  const match = compact.match(/(?:Trainer Weekly Check-in:\s*([^:]+?)\s*)?Wins:\s*(.*?)\s*(?:Risks|Watch-outs):\s*(.*?)\s*(?:Next Actions|Suggested action|Next steps):\s*(.*)$/i);
  if (!match) return null;

  const name = match[1]?.trim() ?? "";
  return {
    name,
    wins: polishSentence(match[2], name),
    risks: polishSentence(match[3], name),
    actions: polishSentence(match[4], name)
  };
}

function polishSentence(value: string, name: string) {
  let next = cleanText(value).replace(/\s+/g, " ");
  if (name) {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    next = next
      .replace(new RegExp(`\\b${escapedName}\\b`, "g"), "you")
      .replace(/\bclient\b/gi, "you");
  }
  return next
    .replace(/\bEncourage you to\b/gi, "Share")
    .replace(/\bindicate\b/gi, "show")
    .trim();
}

function parseDeterministicReport(value: string, audience: WeeklyReportAudience, t: Translate = englishMessage): Section[] {
  const cleaned = cleanText(value);
  const lines = cleaned.split("\n").map((line) => line.trim()).filter(Boolean);
  const sections: Section[] = [];
  let currentTitle = "";
  let currentLines: string[] = [];

  function pushCurrent() {
    if (!currentTitle || !currentLines.length) return;
    const normalizedTitle =
      audience === "client" && currentTitle === englishMessage("weekly.coachSummary")
        ? t("weekly.whatThisWeekShows")
        : currentTitle === englishMessage("weekly.suggestedFocusNextWeek")
          ? audience === "client" ? t("weekly.oneFocusNextWeek") : t("weekly.suggestedCoachFocus")
          : currentTitle === englishMessage("weekly.thisWeekAtGlance")
            ? t("weekly.thisWeekAtGlance")
            : currentTitle;

    sections.push({
      title: normalizedTitle,
      body: currentLines.join("\n").replace(/^- /gm, ""),
      tone: normalizedTitle.includes("focus") || normalizedTitle.includes("Focus") ? "amber" : normalizedTitle.includes("shows") || normalizedTitle.includes("summary") ? "calm" : "zinc"
    });
  }

  for (const line of lines) {
    const isHeading = !line.startsWith("-") && ["This week at a glance", "Coach summary", "Athlete Mode", "Suggested focus for next week"].includes(line);
    if (isHeading) {
      pushCurrent();
      currentTitle = line;
      currentLines = [];
    } else if (!line.toLowerCase().startsWith("weekly coach report")) {
      currentLines.push(line);
    }
  }
  pushCurrent();

  if (sections.length) return sections;
  return [{ title: audience === "client" ? t("weekly.yourWeekReview") : t("weekly.coachCheckinDraft"), body: cleaned, tone: "calm" }];
}

function buildSections(summary: string, audience: WeeklyReportAudience, t: Translate = englishMessage): Section[] {
  const named = extractNamedSections(summary);
  if (named) {
    return audience === "client"
      ? [
          { title: t("weekly.whatWentWell"), body: named.wins, tone: "lime" },
          { title: t("weekly.whatToKeepBuilding"), body: named.risks || t("weekly.noMajorConcerns"), tone: "amber" },
          { title: t("weekly.oneFocusNextWeek"), body: named.actions, tone: "calm" }
        ]
      : [
          { title: t("weekly.wins"), body: named.wins, tone: "lime" },
          { title: t("weekly.watchOuts"), body: named.risks || t("weekly.noImmediateConcerns"), tone: "amber" },
          { title: t("weekly.suggestedCoachAction"), body: named.actions, tone: "calm" }
        ];
  }

  return parseDeterministicReport(summary, audience, t);
}

function toneClasses(tone: Section["tone"]) {
  if (tone === "lime") return "text-lime";
  if (tone === "amber") return "text-amber";
  if (tone === "calm") return "text-calm";
  return "text-zinc-300";
}

export function WeeklyReportSummary({ summary, audience = "client" }: { summary: string; audience?: WeeklyReportAudience }) {
  const { t } = useI18n();
  const sections = buildSections(summary, audience, t);

  return (
    <div className="divide-y divide-line">
      {sections.slice(0, 3).map((section, index) => (
        <article key={section.title} className="py-5 first:pt-0 last:pb-0">
          <div className="flex items-center gap-3">
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border border-current/25 bg-current/10 text-sm font-semibold ${toneClasses(section.tone)}`} aria-hidden="true">{index + 1}</span>
            <p className={`text-sm font-semibold ${toneClasses(section.tone)}`}>{section.title}</p>
          </div>
          <p className="mt-3 whitespace-pre-line text-base leading-7 text-zinc-200">{section.body}</p>
        </article>
      ))}
    </div>
  );
}

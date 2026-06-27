"use client";

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

function parseDeterministicReport(value: string, audience: WeeklyReportAudience): Section[] {
  const cleaned = cleanText(value);
  const lines = cleaned.split("\n").map((line) => line.trim()).filter(Boolean);
  const sections: Section[] = [];
  let currentTitle = "";
  let currentLines: string[] = [];

  function pushCurrent() {
    if (!currentTitle || !currentLines.length) return;
    const normalizedTitle =
      audience === "client" && currentTitle === "Coach summary"
        ? "What this week shows"
        : currentTitle === "Suggested focus for next week"
          ? audience === "client" ? "One focus for next week" : "Suggested coach focus"
          : currentTitle === "This week at a glance"
            ? "This week at a glance"
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
  return [{ title: audience === "client" ? "Your week in review" : "Coach check-in draft", body: cleaned, tone: "calm" }];
}

function buildSections(summary: string, audience: WeeklyReportAudience): Section[] {
  const named = extractNamedSections(summary);
  if (named) {
    return audience === "client"
      ? [
          { title: "What went well", body: named.wins, tone: "lime" },
          { title: "What to keep building", body: named.risks || "No major concerns stood out this week.", tone: "amber" },
          { title: "One focus for next week", body: named.actions, tone: "calm" }
        ]
      : [
          { title: "Wins", body: named.wins, tone: "lime" },
          { title: "Watch-outs", body: named.risks || "No immediate concerns stood out.", tone: "amber" },
          { title: "Suggested coach action", body: named.actions, tone: "calm" }
        ];
  }

  return parseDeterministicReport(summary, audience);
}

function toneClasses(tone: Section["tone"]) {
  if (tone === "lime") return "border-lime/30 bg-lime/10 text-lime";
  if (tone === "amber") return "border-amber/30 bg-amber/10 text-amber";
  if (tone === "calm") return "border-calm/30 bg-calm/10 text-calm";
  return "border-line bg-ink text-zinc-300";
}

export function WeeklyReportSummary({ summary, audience = "client" }: { summary: string; audience?: WeeklyReportAudience }) {
  const sections = buildSections(summary, audience);

  return (
    <div className="space-y-3">
      {sections.map((section) => (
        <article key={section.title} className={`rounded-lg border p-3 ${toneClasses(section.tone)}`}>
          <p className="text-sm font-semibold">{section.title}</p>
          <p className="mt-2 whitespace-pre-line text-sm leading-6 text-zinc-200">{section.body}</p>
        </article>
      ))}
    </div>
  );
}

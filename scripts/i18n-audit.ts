import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { ASCEND_LOCALES } from "../shared/src/locale";
import { messages } from "../frontend/src/lib/i18n/messages";
import { renderedMessages } from "../frontend/src/lib/i18n/renderedMessages";

const root = process.cwd();
const frontendSrc = join(root, "frontend", "src");
const excludedHardcoded = [
  /className=/,
  /aria-hidden/,
  /data-/,
  /console\./,
  /import /,
  /from "/,
  /href="/,
  /id="/,
  /type="/,
  /value="/,
  /name="/,
  /event_name/,
  /analytics/i,
  /[A-Z_]{3,}/,
  /d="/,
  /viewBox=/,
  /MacIntel/,
  /AbortError/
];

const hardcodedReviewOnly = [
  /alt=/,
  /placeholder=/,
  /aria-label=/,
  /title=/,
  /frontend\\src\\components\\brand\\/,
  /frontend\\src\\components\\dashboard\\AscendRiseMomentum/,
  /frontend\\src\\components\\ProgressRing/
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) return walk(full);
    return /\.(tsx|ts)$/.test(entry) ? [full] : [];
  });
}

function auditMissingKeys() {
  const effectiveMessages = Object.fromEntries(ASCEND_LOCALES.map((locale) => [locale, { ...messages[locale], ...renderedMessages[locale] }]));
  const englishKeys = new Set(Object.keys(effectiveMessages.en));
  const results: Record<string, string[]> = {};

  for (const locale of ASCEND_LOCALES) {
    const keys = new Set(Object.keys(effectiveMessages[locale]));
    results[locale] = [...englishKeys].filter((key) => !keys.has(key)).sort();
  }

  return results;
}

function auditDuplicateEnglishKeys() {
  const source = readFileSync(join(frontendSrc, "lib", "i18n", "messages.ts"), "utf8");
  const englishBlock = source.match(/en:\s*\{([\s\S]*?)\n\s*\},\n\s*"ms-MY"/)?.[1] ?? "";
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const match of englishBlock.matchAll(/"([^"]+)":/g)) {
    const key = match[1];
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  return [...duplicates].sort();
}

function auditLikelyHardcodedStrings() {
  const matches: Array<{ file: string; line: number; text: string }> = [];
  const stringPattern = /(?:>|=\{?\s*|return\s+|throw new Error\()\s*["'`]([A-Z][^"'`{}<>]{3,120})["'`]/g;

  for (const file of walk(frontendSrc)) {
    if (/\.test\./.test(file)) continue;
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((lineText, index) => {
      if (excludedHardcoded.some((pattern) => pattern.test(lineText))) return;
      let match: RegExpExecArray | null;
      while ((match = stringPattern.exec(lineText))) {
      const text = match[1].trim();
      if (!text || text.length < 4) continue;
        if (/^[A-Z][a-z]+(?:[A-Z][a-z]+)+$/.test(text)) continue;
        matches.push({ file: relative(root, file), line: index + 1, text });
      }
    });
  }

  return matches;
}

const missingKeys = auditMissingKeys();
const duplicateEnglishKeys = auditDuplicateEnglishKeys();
const hardcoded = auditLikelyHardcodedStrings();
const reviewWarnings = hardcoded.filter((match) => hardcodedReviewOnly.some((pattern) => pattern.test(match.file) || pattern.test(match.text)));
const highConfidenceHardcodedUserStrings = hardcoded.filter((match) => !reviewWarnings.includes(match));

console.log(JSON.stringify({
  missingKeys,
  duplicateEnglishKeys,
  highConfidenceHardcodedUserStrings: highConfidenceHardcodedUserStrings.slice(0, 250),
  highConfidenceHardcodedCount: highConfidenceHardcodedUserStrings.length,
  reviewWarnings: reviewWarnings.slice(0, 250),
  reviewWarningCount: reviewWarnings.length
}, null, 2));

if (
  Object.values(missingKeys).some((missing) => missing.length > 0)
  || duplicateEnglishKeys.length > 0
  || highConfidenceHardcodedUserStrings.length > 0
) {
  process.exitCode = 1;
}

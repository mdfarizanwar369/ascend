import type {
  WorkoutCaptureExercise,
  WorkoutCaptureLoadStep,
  WorkoutCaptureSetDetail,
  WorkoutLoadBasis,
  WorkoutLoadRole,
  WorkoutSetType,
  WorkoutTrainingMethod
} from "@ascend/shared";

type ExerciseBlock = {
  name: string;
  nameLine: string;
  detailLines: string[];
  section: string | null;
  groupMethod: WorkoutTrainingMethod | null;
  groupId: string | null;
  groupRounds: number | null;
};

const SECTION_PATTERN = /^(warm[ -]?up|chest|back|legs?|shoulders?|arms?(?:\s+finisher)?|conditioning|cool\s?down|finisher)(?:\s+today)?\s*:?[\s]*$/i;
const DETAIL_PREFIX = /^(?:started|increased|worked|then|completed|additional|used|multiple|one recorded|around|about|short|first|tried|felt|reduced|finished|supersetted|alternated|all one|warm[ -]?up|ramp[ -]?up|actually|maybe|good session|gym was|after that|rest\b)/i;
const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100
};

const EXERCISE_ALIASES: Array<{ pattern: RegExp; display: string }> = [
  { pattern: /incline smith machine press/i, display: "Incline Smith Machine Press" },
  { pattern: /incline smith press/i, display: "Incline Smith Press" },
  { pattern: /incline dumbbell press/i, display: "Incline Dumbbell Press" },
  { pattern: /incline db\b/i, display: "Incline Dumbbell Press" },
  { pattern: /db shoulder press/i, display: "Dumbbell Shoulder Press" },
  { pattern: /dumbbell shoulder press/i, display: "Dumbbell Shoulder Press" },
  { pattern: /db bench/i, display: "Dumbbell Bench Press" },
  { pattern: /bench press/i, display: "Bench Press" },
  { pattern: /\bbench\b/i, display: "Bench Press" },
  { pattern: /incline dumbbell\b/i, display: "Incline Dumbbell Press" },
  { pattern: /incline press/i, display: "Incline Press" },
  { pattern: /pec deck/i, display: "Pec Deck" },
  { pattern: /cable fly(?:es)?/i, display: "Cable Flyes" },
  { pattern: /\bfly(?:es)?\b/i, display: "Flyes" },
  { pattern: /seated cable row/i, display: "Seated Cable Row" },
  { pattern: /wide[ -]?grip lat pulldown/i, display: "Wide-Grip Lat Pulldown" },
  { pattern: /straight[ -]?arm pulldown/i, display: "Straight-Arm Pulldown" },
  { pattern: /lat pulldown/i, display: "Lat Pulldown" },
  { pattern: /face pulls?/i, display: "Face Pulls" },
  { pattern: /tricep (?:pull|push)down/i, display: "Tricep Pulldown" },
  { pattern: /rope pushdown/i, display: "Rope Pushdown" },
  { pattern: /cable bicep curl/i, display: "Cable Bicep Curl" },
  { pattern: /cable curls?/i, display: "Cable Curl" },
  { pattern: /assisted pull[ -]?ups?/i, display: "Assisted Pull-Up" },
  { pattern: /pull[ -]?ups?/i, display: "Pull-Ups" },
  { pattern: /\bdips?\b/i, display: "Dips" },
  { pattern: /smith squats?/i, display: "Smith Squat" },
  { pattern: /bodyweight squats?/i, display: "Bodyweight Squats" },
  { pattern: /air squats?/i, display: "Air Squats" },
  { pattern: /\bsquats?\b/i, display: "Squat" },
  { pattern: /leg press/i, display: "Leg Press" },
  { pattern: /leg extensions?/i, display: "Leg Extension" },
  { pattern: /walking lunges?/i, display: "Walking Lunges" },
  { pattern: /lateral raises?/i, display: "Lateral Raise" },
  { pattern: /treadmill incline walk/i, display: "Treadmill Incline Walk" },
  { pattern: /incline walk/i, display: "Incline Walk" },
  { pattern: /sled pushes?/i, display: "Sled Push" },
  { pattern: /kettlebell swings?/i, display: "Kettlebell Swing" },
  { pattern: /box jumps?/i, display: "Box Jump" },
  { pattern: /calorie row/i, display: "Calorie Row" },
  { pattern: /walking|\bwalk\b/i, display: "Walking" },
  { pattern: /\bbike\b|cycling/i, display: "Bike" },
  { pattern: /push[ -]?ups?/i, display: "Push-Ups" },
  { pattern: /band pull[ -]?aparts?/i, display: "Band Pull-Aparts" },
  { pattern: /external rotations?/i, display: "External Rotations" },
  { pattern: /\brows?\b/i, display: "Row" },
  { pattern: /cable curls?/i, display: "Cable Curl" }
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function parseNumber(value: string | undefined) {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (NUMBER_WORDS[normalized] !== undefined) return NUMBER_WORDS[normalized];
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function replaceNumberWords(value: string) {
  return value.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)\b/gi, (word) => String(NUMBER_WORDS[word.toLowerCase()]));
}

function cleanLine(value: string) {
  return value.replace(/^\s*(?:[*•-]\s*|\d+[.)]\s+)/, "").trim();
}

function normalizedSection(value: string) {
  const section = value.replace(/:$/, "").trim();
  if (/warm/i.test(section)) return "Warm-up";
  if (/cool/i.test(section)) return "Cooldown";
  if (/arms?\s+finisher/i.test(section)) return "Arms Finisher";
  return section.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function exerciseMatch(value: string) {
  let best: { index: number; length: number; display: string; source: string } | null = null;
  for (const alias of EXERCISE_ALIASES) {
    const match = alias.pattern.exec(value);
    if (!match) continue;
    if (!best || match.index < best.index || (match.index === best.index && match[0].length > best.length)) {
      best = { index: match.index, length: match[0].length, display: alias.display, source: match[0] };
    }
  }
  return best;
}

function allExerciseMatches(value: string) {
  const found: Array<{ index: number; length: number; display: string; source: string }> = [];
  for (const alias of EXERCISE_ALIASES) {
    const flags = alias.pattern.flags.includes("g") ? alias.pattern.flags : `${alias.pattern.flags}g`;
    const matcher = new RegExp(alias.pattern.source, flags);
    for (const match of value.matchAll(matcher)) {
      const index = match.index ?? -1;
      if (index < 0) continue;
      found.push({ index, length: match[0].length, display: alias.display, source: match[0] });
    }
  }
  return found
    .sort((left, right) => left.index - right.index || right.length - left.length)
    .filter((candidate, index, sorted) => !sorted.slice(0, index).some((kept) => candidate.index >= kept.index && candidate.index < kept.index + kept.length));
}

function looksLikeGlobalProse(value: string) {
  return /^(?:worked out at\b|gym was\b|good session\b|did .+ today\.?$)/i.test(value.trim());
}

function looksLikeDetail(value: string) {
  const line = cleanLine(value);
  if (DETAIL_PREFIX.test(line)) return true;
  if (/^(?:bodyweight|resistance band|machine setting\b)/i.test(line)) return true;
  if (/^\d+(?:\.\d+)?s?\s*(?:kg|kgs|kilos?|lb|lbs)?\s*[x×]\s*\d+/i.test(line)) return true;
  if (/^\d+(?:\.\d+)?\s*(?:kg|kgs|kilos?|lb|lbs|sets?|reps?|rounds?|mins?|minutes?|seconds?|secs?)\b/i.test(line)) return true;
  return false;
}

function createBlock(line: string, section: string | null, groupMethod: WorkoutTrainingMethod | null, groupId: string | null, groupRounds: number | null): ExerciseBlock | null {
  const cleaned = cleanLine(line);
  const matched = exerciseMatch(cleaned);
  if (!matched) return null;
  return {
    name: matched.display,
    nameLine: cleaned,
    detailLines: [],
    section,
    groupMethod,
    groupId,
    groupRounds
  };
}

function splitSpokenInput(value: string) {
  const matches = allExerciseMatches(value);
  if (matches.length < 2) return [];
  return matches.map((match, index) => value.slice(match.index, matches[index + 1]?.index ?? value.length).trim());
}

function buildBlocks(input: string) {
  const rawLines = input.replace(/\r/g, "").split("\n").map((line) => line.trim()).filter(Boolean);
  const lines = rawLines.length <= 3 ? (splitSpokenInput(input).length ? splitSpokenInput(input) : rawLines) : rawLines;
  const blocks: ExerciseBlock[] = [];
  let section: string | null = null;
  let current: ExerciseBlock | null = null;
  let activeGroupMethod: WorkoutTrainingMethod | null = null;
  let activeGroupId: string | null = null;
  let activeGroupRounds: number | null = null;
  let pendingSupersetSlots = 0;
  let groupCounter = 0;

  for (const rawLine of lines) {
    const line = cleanLine(rawLine);
    if (!line) continue;
    const sectionMatch = line.match(SECTION_PATTERN);
    if (sectionMatch) {
      section = normalizedSection(sectionMatch[1]);
      current = null;
      continue;
    }
    if (/^superset\s*:?[\s]*$/i.test(line)) {
      groupCounter += 1;
      activeGroupMethod = "superset";
      activeGroupId = `superset-${groupCounter}`;
      activeGroupRounds = null;
      pendingSupersetSlots = 2;
      current = null;
      continue;
    }
    const amrapMatch = line.match(/^(\d+)\s*(?:min|minute)s?\s+amrap\b/i);
    if (amrapMatch) {
      groupCounter += 1;
      activeGroupMethod = "amrap";
      activeGroupId = `amrap-${groupCounter}`;
      activeGroupRounds = null;
      current = null;
      continue;
    }
    const roundsMatch = line.match(/^(\d+)\s+rounds?\s*:?\s*$/i);
    if (roundsMatch && !current) {
      groupCounter += 1;
      activeGroupMethod = "circuit";
      activeGroupId = `circuit-${groupCounter}`;
      activeGroupRounds = Number(roundsMatch[1]);
      current = null;
      continue;
    }
    if (roundsMatch && current) {
      current.detailLines.push(line);
      continue;
    }
    if (looksLikeGlobalProse(line) && !exerciseMatch(line)) continue;

    const detailCandidate = createBlock(line, section, activeGroupMethod, activeGroupId, activeGroupRounds);
    if (current && looksLikeDetail(line) && !(detailCandidate && /^(?:after that i did|finished with)\b/i.test(line))) {
      current.detailLines.push(line);
      continue;
    }

    const multiple = allExerciseMatches(line);
    if (multiple.length > 1 && rawLines.length <= 3) {
      const spokenSegments = splitSpokenInput(line);
      for (const segment of spokenSegments) {
        const block = createBlock(segment, section, activeGroupMethod, activeGroupId, activeGroupRounds);
        if (!block) continue;
        blocks.push(block);
        current = block;
      }
      continue;
    }

    const candidate = createBlock(line, section, activeGroupMethod, activeGroupId, activeGroupRounds);
    if (candidate) {
      blocks.push(candidate);
      current = candidate;
      if (pendingSupersetSlots > 0) {
        pendingSupersetSlots -= 1;
        if (pendingSupersetSlots === 0) {
          activeGroupMethod = null;
          activeGroupId = null;
        }
      }
      continue;
    }
    if (current) current.detailLines.push(line);
  }

  const roundRest = input.match(/(\d+)\s*(?:sec|secs|seconds?)\s+rest(?:\s+between\s+rounds)?\s*$/i)?.[1];
  if (roundRest) {
    for (const block of blocks) {
      if (block.groupId) block.detailLines.push(`${roundRest} sec rest between rounds`);
    }
  }
  return blocks.slice(0, 30);
}

function loadBasisFor(text: string, exerciseName: string): WorkoutLoadBasis {
  const lower = `${text} ${exerciseName}`.toLowerCase();
  if (/assistance|assisted/.test(lower)) return "assistance";
  if (/bodyweight\s*\+/.test(lower)) return "bodyweight_plus";
  if (/bodyweight/.test(lower)) return "bodyweight";
  if (/per side|each side/.test(lower)) return "per_side";
  if (/each hand|dumbbells?|\bdb\b|\d+(?:\.\d+)?s\s*[x×]/.test(lower)) return "per_hand";
  if (/machine setting/.test(lower)) return "machine_setting";
  if (/resistance band|banded/.test(lower)) return "band";
  return /\b(?:kg|kgs|kilos?|lb|lbs)\b/.test(lower) ? "total" : "unknown";
}

function unitFor(value: string | undefined) {
  if (!value) return null;
  return /^k/i.test(value) ? "kg" as const : "lb" as const;
}

function roleFor(text: string, index: number, matchIndex: number, totalMatches: number): WorkoutLoadRole {
  const lower = text.toLowerCase();
  if (/drop set/.test(lower)) return index === 0 ? "top" : "drop";
  if (/back[ -]?off/.test(lower)) return "backoff";
  if (/reduced|dropped/.test(lower)) return /too heavy/.test(lower) ? "correction" : "backoff";
  if (/actually/.test(lower) && matchIndex > lower.indexOf("actually")) return "correction";
  if (/started|first set|tried/.test(lower) && (totalMatches === 1 || index === 0)) return "starting";
  if (/worked up|top set|top load/.test(lower)) return "top";
  if (/working sets?|finished .* there|increased/.test(lower)) return "working";
  return "unknown";
}

function parseLoadSteps(lines: string[], exerciseName: string) {
  const steps: WorkoutCaptureLoadStep[] = [];
  for (const line of lines) {
    const matcher = /(\d+(?:\.\d+)?)\s*(kg|kgs|kilos?|lb|lbs)\b/gi;
    const matches = [...line.matchAll(matcher)];
    matches.forEach((match, index) => {
      const value = Number(match[1]);
      const localText = line.slice(Math.max(0, (match.index ?? 0) - 30), (match.index ?? 0) + match[0].length + 50);
      const followingText = line.slice((match.index ?? 0) + match[0].length);
      const repsMatch = followingText.match(/^\s*(?:(?:for|[x×])\s*)?(\d+(?:\s*[-–]\s*\d+)?)\s*reps?\b/i)
        ?? followingText.match(/^\s*(?:for|[x×])\s*(\d+(?:\s*[-–]\s*\d+)?)\b/i)
        ?? line.match(/(?:completed|got|one recorded set:)\s*(\d+)\s*reps?/i);
      steps.push({
        value,
        unit: unitFor(match[2]),
        basis: loadBasisFor(localText, exerciseName),
        role: roleFor(line, index, match.index ?? 0, matches.length),
        reps: repsMatch?.[1]?.replace(/\s+/g, "") ?? null,
        approximate: /\b(?:around|about|maybe|i think|~)\b/i.test(localText),
        note: line.slice(0, 240),
        confidence: /\b(?:maybe|i think)\b/i.test(localText) ? 0.65 : 0.95
      });
    });

    const shorthand = [...line.matchAll(/(?<![\d.])(\d+(?:\.\d+)?)s?\s*[x×]\s*(\d+(?:\s*[-–]\s*\d+)?)\b/gi)];
    for (const match of shorthand) {
      if (matches.length || Number(match[1]) <= 10 && !/\d+(?:\.\d+)?s\s*[x×]/i.test(match[0])) continue;
      steps.push({
        value: Number(match[1]),
        unit: null,
        basis: loadBasisFor(line, exerciseName),
        role: roleFor(line, steps.length, match.index ?? 0, shorthand.length),
        reps: match[2].replace(/\s+/g, ""),
        approximate: false,
        note: line.slice(0, 240),
        confidence: 0.82
      });
    }
  }
  return steps.slice(0, 30);
}

function parseSpokenLoadSteps(text: string, exerciseName: string) {
  const steps: WorkoutCaptureLoadStep[] = [];
  const normalizedText = replaceNumberWords(text);
  const matcher = /(\d+(?:\.\d+)?)\s*(kilos?|kg|pounds?|lbs?)[ \t]+(?:for[ \t]+)?(\d+)\b(?:[ \t]+reps?)?/gi;
  for (const match of normalizedText.matchAll(matcher)) {
    const reps = parseNumber(match[3]);
    steps.push({
      value: Number(match[1]),
      unit: /^k/i.test(match[2]) ? "kg" : "lb",
      basis: loadBasisFor(match[0], exerciseName),
      role: steps.length === 0 ? "starting" : "working",
      reps: reps === null ? null : String(reps),
      approximate: false,
      note: match[0],
      confidence: 0.93
    });
  }
  const unitOnlyMatcher = /(\d+(?:\.\d+)?)\s*(kilos?|kg|pounds?|lbs?)\b/gi;
  for (const match of normalizedText.matchAll(unitOnlyMatcher)) {
    const value = Number(match[1]);
    if (steps.some((step) => step.value === value && step.unit === (/^k/i.test(match[2]) ? "kg" : "lb"))) continue;
    steps.push({
      value,
      unit: /^k/i.test(match[2]) ? "kg" : "lb",
      basis: loadBasisFor(match[0], exerciseName),
      role: steps.length === 0 ? "starting" : "working",
      reps: null,
      approximate: /\b(?:maybe|i think|around|about)\b/i.test(normalizedText),
      note: match[0],
      confidence: /\b(?:maybe|i think)\b/i.test(normalizedText) ? 0.65 : 0.86
    });
  }
  const inheritedUnit = steps.at(-1)?.unit ?? null;
  const inheritedBasis = steps.at(-1)?.basis ?? loadBasisFor(normalizedText, exerciseName);
  const continuation = /(?:then|and)\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|\d+(?:\.\d+)?)\s+(?:for|got)\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+)\s*(?:reps?)?/gi;
  for (const match of normalizedText.matchAll(continuation)) {
    const value = parseNumber(match[1]);
    const reps = parseNumber(match[2]);
    if (value === null) continue;
    steps.push({
      value,
      unit: inheritedUnit,
      basis: inheritedBasis,
      role: "working",
      reps: reps === null ? null : String(reps),
      approximate: false,
      note: match[0],
      confidence: 0.82
    });
  }
  return steps;
}

function trainingMethods(text: string, groupMethod: WorkoutTrainingMethod | null) {
  const lower = text.toLowerCase();
  const methods: WorkoutTrainingMethod[] = [];
  if (/fst[ -]?7/.test(lower)) methods.push("fst_7");
  if (/drop set/.test(lower)) methods.push("drop_set");
  if (/back[ -]?off/.test(lower)) methods.push("back_off");
  if (/ramp[ -]?up/.test(lower)) methods.push("ramp_up");
  if (/rest[ -]?pause/.test(lower)) methods.push("rest_pause");
  if (/\bamrap\b/.test(lower)) methods.push("amrap");
  if (/superset/.test(lower)) methods.push("superset");
  if (/alternat/.test(lower)) methods.push("alternating_set");
  if (/giant set/.test(lower)) methods.push("giant_set");
  if (/\bcircuit\b|\d+\s+rounds/.test(lower)) methods.push("circuit");
  if (/short[ -]?rest/.test(lower)) methods.push("short_rest");
  if (groupMethod) methods.push(groupMethod);
  return [...new Set(methods)];
}

function repRange(text: string) {
  const match = text.match(/(?:around|about|~)?\s*(\d+)\s*[-–]\s*(\d+)\s*(?:reps?)?/i);
  return match ? { min: Number(match[1]), max: Number(match[2]) } : { min: null, max: null };
}

function listReps(text: string) {
  const labelled = text.match(/\b(\d+(?:\s*,\s*\d+){1,10})\s*reps?\b/i);
  const standalone = text.match(/(?:^|\n)\s*(\d+(?:\s*,\s*\d+){1,10})\s*(?:\n|$)/i);
  return (labelled?.[1] ?? standalone?.[1])?.replace(/\s*,\s*/g, ", ") ?? null;
}

function summarySets(text: string, setDetails: WorkoutCaptureSetDetail[]) {
  if (/\b\d+\s+or\s+\d+\s+sets?\b/i.test(text)) return null;
  const explicit = text.match(/\b(\d+)\s*(?:ramp[ -]?up\s+)?sets?\b/i)
    ?? text.match(/\b(\d+)\s+rounds?\b/i)
    ?? text.match(/\b([1-9]|10)\s*[x×]\s*\d+(?:\s*[-–]\s*\d+)?\b/i);
  if (explicit) return clamp(Number(explicit[1]), 1, 100);
  return setDetails.length > 1 && setDetails.every((detail) => detail.reps !== null || detail.durationValue !== null)
    ? setDetails.length
    : null;
}

function summaryReps(text: string, setDetails: WorkoutCaptureSetDetail[]) {
  const listed = listReps(text);
  if (listed) return listed;
  const range = repRange(text);
  if (range.min !== null && range.max !== null) return `${range.min}-${range.max}`;
  const setRep = text.match(/\b\d+\s*[x×]\s*(\d+(?:\s*[-–]\s*\d+)?)\b/i);
  if (setRep) return setRep[1].replace(/\s+/g, "");
  const setsOf = text.match(/\b\d+\s+sets?\s+of\s+(\d+(?:\s*[-–]\s*\d+)?)\b/i);
  if (setsOf) return setsOf[1].replace(/\s+/g, "");
  const recorded = text.match(/(?:one recorded set:|completed|got|around|about|maybe)?\s*(\d+)\s*reps?\b/i);
  if (recorded) return recorded[1];
  const approximateCount = text.match(/\b(?:around|about|maybe)\s*(\d+)\b(?!\s*sets?)(?:\s*(?:reps?|each))?/i);
  if (approximateCount) return approximateCount[1];
  const calorieRow = text.match(/\b(\d+)\s+calorie\s+row\b/i);
  if (calorieRow) return `${calorieRow[1]} calories`;
  const leading = text.match(/^\s*(\d+)\s+[A-Za-z]/);
  if (leading && !/^\s*\d+\s+(?:minute|minutes|min|round|rounds)\b/i.test(text)) return leading[1];
  const unique = [...new Set(setDetails.map((detail) => detail.reps).filter((value): value is string => Boolean(value)))];
  return unique.length ? unique.join(", ") : null;
}

function setDetailsFrom(loadSteps: WorkoutCaptureLoadStep[], text: string, setType: WorkoutSetType) {
  const details: WorkoutCaptureSetDetail[] = loadSteps.map((step, index) => {
    const range = repRange(step.reps ?? "");
    return {
      order: index + 1,
      reps: step.reps,
      repRangeMin: range.min,
      repRangeMax: range.max,
      load: step.value,
      loadUnit: step.unit,
      loadBasis: step.basis,
      durationValue: null,
      durationUnit: null,
      setType: step.role === "top" ? "top" : step.role === "backoff" || step.role === "correction" ? "backoff" : step.role === "drop" ? "drop" : setType,
      rpe: null,
      rir: null,
      approximate: step.approximate,
      note: step.note
    };
  });
  const repList = listReps(text)?.split(", ").map(Number) ?? [];
  if (!details.length && repList.length) {
    return repList.map((reps, index) => ({
      order: index + 1,
      reps: String(reps),
      repRangeMin: null,
      repRangeMax: null,
      load: null,
      loadUnit: null,
      loadBasis: loadBasisFor(text, ""),
      durationValue: null,
      durationUnit: null,
      setType,
      rpe: null,
      rir: null,
      approximate: false,
      note: null
    }));
  }
  return details;
}

function representativeLoad(steps: WorkoutCaptureLoadStep[]) {
  return [...steps].reverse().find((step) => step.role === "working" || step.role === "correction")
    ?? steps.find((step) => step.role === "top")
    ?? steps.at(-1)
    ?? null;
}

function movementPatternFor(name: string) {
  const lower = name.toLowerCase();
  if (/(squat|leg press|lunge|box jump)/.test(lower)) return "squat" as const;
  if (/(deadlift|hinge|hip thrust|glute bridge)/.test(lower)) return "hinge" as const;
  if (/(bench|press|push.?up|dip|tricep)/.test(lower)) return "push" as const;
  if (/(row|pull.?up|pulldown|curl|face pull)/.test(lower)) return "pull" as const;
  if (/(walk|bike|sled|calorie row)/.test(lower)) return "cardio" as const;
  if (/(rotation|mobility|stretch)/.test(lower)) return "mobility" as const;
  return "other" as const;
}

function parseBlock(block: ExerciseBlock, index: number): WorkoutCaptureExercise {
  const lines = [block.nameLine, ...block.detailLines];
  const source = lines.join("\n").slice(0, 1_000);
  const metricSource = replaceNumberWords(source);
  const lower = metricSource.toLowerCase();
  const methods = trainingMethods(source, block.groupMethod);
  const warmup = block.section === "Warm-up" || /ramp[ -]?up sets?/.test(lower);
  const finisher = /finisher|to finish|finishing work/.test(lower) || /finisher/i.test(block.section ?? "");
  const dropSet = methods.includes("drop_set");
  const backoffSet = methods.includes("back_off") || /reduced|back[ -]?off/.test(lower);
  const setType: WorkoutSetType = warmup ? "warmup" : dropSet ? "drop" : backoffSet ? "backoff" : finisher ? "finisher" : "regular";
  let loadSteps = [...parseLoadSteps(lines.map(replaceNumberWords), block.name), ...parseSpokenLoadSteps(source, block.name)];
  loadSteps = loadSteps.reduce<WorkoutCaptureLoadStep[]>((merged, step) => {
    const duplicateIndex = merged.findIndex((candidate) => candidate.value === step.value && candidate.unit === step.unit
      && (candidate.reps === step.reps || candidate.reps === null || step.reps === null));
    if (duplicateIndex < 0) return [...merged, step];
    const existing = merged[duplicateIndex];
    merged[duplicateIndex] = {
      ...existing,
      reps: step.reps ?? existing.reps,
      role: existing.role !== "unknown" ? existing.role : step.role,
      basis: existing.basis !== "unknown" ? existing.basis : step.basis,
      confidence: Math.max(existing.confidence, step.confidence)
    };
    return merged;
  }, []);
  if (dropSet && loadSteps.length) {
    loadSteps = loadSteps.map((step, stepIndex) => ({ ...step, role: stepIndex === 0 ? "top" : "drop" }));
  }
  const reducedSetReps = metricSource.match(/(?:completed|got)\s*(\d+)\s*reps?\s*(?:on|at)?\s*(?:the\s*)?(?:reduced|back[ -]?off)/i)?.[1];
  if (reducedSetReps) {
    const backoff = [...loadSteps].reverse().find((step) => step.role === "backoff" || step.role === "correction");
    if (backoff && !backoff.reps) backoff.reps = reducedSetReps;
  }
  const range = repRange(metricSource);
  const provisionalDetails = setDetailsFrom(loadSteps, metricSource, setType);
  const sets = summarySets(metricSource, provisionalDetails);
  const reps = summaryReps(metricSource, provisionalDetails);
  const rpe = parseNumber(metricSource.match(/\brpe\s*(\d+(?:\.\d+)?)/i)?.[1]);
  const rir = parseNumber(metricSource.match(/\b(\d+(?:\.\d+)?)\s*rir\b/i)?.[1]);
  const duration = metricSource.match(/\b(\d+(?:\.\d+)?)\s*[- ]?(min|mins|minutes?|sec|secs|seconds?)\b/i);
  const durationIsRest = duration
    ? new RegExp(`${duration[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*(?:rest|between rounds)`, "i").test(metricSource)
    : false;
  const durationValue = durationIsRest ? null : parseNumber(duration?.[1]);
  const durationUnit = durationValue === null ? null : duration?.[2]?.toLowerCase().startsWith("s") ? "seconds" as const : duration ? "minutes" as const : null;
  const rest = metricSource.match(/\b(\d+)\s*(?:sec|secs|seconds?)\s*(?:rest|between rounds)?\b/i);
  const restSeconds = rest && !/minute amrap/i.test(rest[0]) ? Number(rest[1]) : null;
  const ambiguousSets = /\b\d+\s+or\s+\d+\s+sets?\b/i.test(source);
  const approximate = /\b(?:around|about|maybe|i think)\b|~/.test(lower);
  const uncertainFields: string[] = [];
  if (ambiguousSets) uncertainFields.push("sets");
  if (/\bmaybe\s+\d+\s+sets?/.test(lower) && !uncertainFields.includes("sets")) uncertainFields.push("sets");
  if (/\bmaybe\s+\d+\s+reps?/.test(lower)) uncertainFields.push("reps");
  if (/\b(?:i think|maybe)\b/.test(lower) && loadSteps.length) uncertainFields.push("load");
  const representative = representativeLoad(loadSteps);
  const loadBasis = /bodyweight\s*\+/.test(lower) ? "bodyweight_plus" : /\bbodyweight\b/.test(lower) ? "bodyweight" : representative?.basis ?? loadBasisFor(source, block.name);
  const machineSetting = source.match(/machine setting\s*(\d+(?:\.\d+)?)/i);
  const bodyweightPlus = source.match(/bodyweight\s*\+\s*(\d+(?:\.\d+)?)\s*(kg|lb)/i);
  const explicitBodyweight = /\bbodyweight\b/i.test(source);
  const primaryLoad = machineSetting ? Number(machineSetting[1]) : bodyweightPlus ? Number(bodyweightPlus[1]) : representative?.value ?? null;
  const primaryUnit = machineSetting ? null : bodyweightPlus ? unitFor(bodyweightPlus[2]) : representative?.unit ?? null;
  const confidence = uncertainFields.length ? 0.68 : (sets !== null || reps !== null || primaryLoad !== null || durationValue !== null) ? 0.92 : 0.82;
  const descriptiveNotes = block.detailLines
    .filter((line) => /[A-Za-z]/.test(line) && !/^\d+(?:\.\d+)?\s*(?:kg|lb|sets?|reps?|mins?|minutes?)?\s*[x×]?\s*\d*$/i.test(line))
    .join(". ")
    .slice(0, 500) || null;

  return {
    name: block.name,
    originalText: source,
    sets,
    reps,
    load: explicitBodyweight && !bodyweightPlus && !machineSetting ? null : primaryLoad,
    loadUnit: explicitBodyweight && !bodyweightPlus ? null : primaryUnit,
    durationMinutes: durationUnit === "minutes" ? Math.round(durationValue ?? 0) || null : null,
    restSeconds,
    note: descriptiveNotes,
    movementPattern: movementPatternFor(block.name),
    confidence,
    needsConfirmation: uncertainFields.length > 0,
    section: block.section,
    exerciseOrder: index + 1,
    completedSets: sets,
    repRangeMin: range.min,
    repRangeMax: range.max,
    approximateReps: approximate && reps !== null,
    durationValue,
    durationUnit,
    loadBasis,
    loadText: explicitBodyweight && !bodyweightPlus ? "Bodyweight" : machineSetting ? `Machine setting ${machineSetting[1]}` : representative ? representative.note : null,
    startingLoad: loadSteps.find((step) => step.role === "starting")?.value ?? null,
    workingLoad: [...loadSteps].reverse().find((step) => step.role === "working" || step.role === "correction")?.value
      ?? (/finished the working sets there/i.test(source) ? representative?.value ?? null : null),
    topLoad: loadSteps.find((step) => step.role === "top")?.value ?? null,
    backoffLoad: [...loadSteps].reverse().find((step) => step.role === "backoff")?.value ?? null,
    rpe: rpe === null ? null : clamp(rpe, 1, 10),
    rir: rir === null ? null : clamp(rir, 0, 10),
    restStyle: /short[ -]?rest/i.test(source) ? "short rest" : /between rounds/i.test(source) ? "between rounds" : restSeconds !== null ? "timed" : null,
    setType,
    trainingMethods: methods,
    supersetGroup: block.groupId ?? (/superset|alternat/i.test(source) ? "superset-1" : null),
    groupRounds: block.groupRounds,
    warmup,
    workingSet: !warmup,
    backoffSet,
    dropSet,
    loadSteps,
    setDetails: provisionalDetails.map((detail) => ({ ...detail, rpe: rpe ?? detail.rpe, rir: rir ?? detail.rir })),
    uncertainFields
  };
}

function linkMentionedSupersets(exercises: WorkoutCaptureExercise[]) {
  let groupCounter = 0;
  for (let index = 0; index < exercises.length; index += 1) {
    const exercise = exercises[index];
    if (!/superset|alternat/i.test(exercise.originalText ?? "")) continue;
    const previous = exercises[index - 1];
    if (!previous) continue;
    groupCounter += 1;
    const group = exercise.supersetGroup ?? previous.supersetGroup ?? `superset-mentioned-${groupCounter}`;
    exercise.supersetGroup = group;
    previous.supersetGroup = group;
    exercise.trainingMethods = [...new Set([...(exercise.trainingMethods ?? []), "superset"])] as WorkoutTrainingMethod[];
    previous.trainingMethods = [...new Set([...(previous.trainingMethods ?? []), "superset"])] as WorkoutTrainingMethod[];
  }
}

export function parseWorkoutCaptureExercises(input: string) {
  const exercises = buildBlocks(input).map(parseBlock);
  linkMentionedSupersets(exercises);
  return exercises;
}

export function ProgressRing({ score }: { score: number }) {
  const offset = 100 - score;

  return (
    <div className="relative h-32 w-32">
      <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
        <path d="M18 2a16 16 0 1 1 0 32a16 16 0 0 1 0-32" fill="none" stroke="#2b3138" strokeWidth="3" />
        <path
          d="M18 2a16 16 0 1 1 0 32a16 16 0 0 1 0-32"
          fill="none"
          stroke="#35f2d0"
          strokeDasharray="100"
          strokeDashoffset={offset}
          strokeLinecap="round"
          strokeWidth="3"
          pathLength="100"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="text-3xl font-semibold">{score}</p>
          <p className="text-xs text-zinc-400">score</p>
        </div>
      </div>
    </div>
  );
}

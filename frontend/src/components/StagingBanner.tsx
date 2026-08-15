export function StagingBanner() {
  if (process.env.NEXT_PUBLIC_APP_ENV !== "staging") return null;
  return (
    <div className="sticky top-0 z-[100] bg-amber px-3 py-1 text-center text-xs font-bold text-ink" role="status">
      ASCEND STAGING - TEST DATA ONLY
    </div>
  );
}

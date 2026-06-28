import { ReactNode } from "react";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function SkeletonBlock({
  className
}: {
  className?: string;
}) {
  return <div className={cn("ascend-skeleton rounded-xl", className)} aria-hidden="true" />;
}

export function SkeletonText({
  lines = 3,
  className
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)} aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <SkeletonBlock
          key={index}
          className={cn(
            "h-3",
            index === 0 ? "w-4/5" : index === lines - 1 ? "w-2/3" : "w-full"
          )}
        />
      ))}
    </div>
  );
}

export function SkeletonStatGrid({
  count = 4
}: {
  count?: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-3" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
          <SkeletonBlock className="h-3 w-20" />
          <SkeletonBlock className="mt-4 h-8 w-14" />
          <SkeletonBlock className="mt-3 h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonCardList({
  count = 3,
  compact = false
}: {
  count?: number;
  compact?: boolean;
}) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
          <div className="flex items-start gap-3">
            <SkeletonBlock className="h-10 w-10 rounded-full" />
            <div className="min-w-0 flex-1">
              <SkeletonBlock className="h-4 w-32" />
              <SkeletonBlock className="mt-2 h-3 w-24" />
              <SkeletonText lines={compact ? 2 : 3} className="mt-3" />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <SkeletonBlock className="h-10" />
            <SkeletonBlock className="h-10" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DashboardHeroSkeleton({
  titleWidth = "w-3/4",
  bodyLines = 2,
  showVisual = true,
  footer
}: {
  titleWidth?: string;
  bodyLines?: number;
  showVisual?: boolean;
  footer?: ReactNode;
}) {
  return (
    <section className="mt-3 rounded-[28px] border border-line bg-surface p-5 shadow-soft" aria-hidden="true">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <SkeletonBlock className="h-3 w-28" />
          <SkeletonBlock className={cn("mt-4 h-11", titleWidth)} />
          <SkeletonText lines={bodyLines} className="mt-4" />
          {footer ? <div className="mt-4">{footer}</div> : null}
        </div>
        {showVisual ? <SkeletonBlock className="h-28 w-28 rounded-full" /> : null}
      </div>
    </section>
  );
}

export function AccountBarSkeleton() {
  return (
    <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-line bg-surface/95 p-3" aria-hidden="true">
      <div className="flex min-w-0 items-center gap-3">
        <SkeletonBlock className="h-10 w-10 rounded-full" />
        <div className="min-w-0">
          <SkeletonBlock className="h-4 w-28" />
          <SkeletonBlock className="mt-2 h-3 w-20" />
        </div>
      </div>
      <SkeletonBlock className="h-10 w-10 rounded-lg" />
    </div>
  );
}

export function SectionShell({
  title,
  children
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-4 rounded-2xl border border-line bg-surface p-4 shadow-soft">
      <div className="flex items-center gap-2">
        <SkeletonBlock className="h-5 w-5 rounded-md" />
        <h2 className="text-lg font-semibold text-white">{title}</h2>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

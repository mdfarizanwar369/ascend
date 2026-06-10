import { ArrowRight, BadgeCheck, Dumbbell } from "lucide-react";
import { ActionButton } from "@/components/ActionButton";
import { Field, inputClass } from "@/components/Field";

export default function OnboardingPage() {
  return (
    <main className="min-h-screen bg-ink px-4 py-5 text-white">
      <div className="mx-auto max-w-md">
        <header className="flex items-center gap-3 py-3">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-lime text-ink">
            <Dumbbell size={21} />
          </span>
          <div>
            <p className="text-lg font-semibold">Ascend setup</p>
            <p className="text-xs text-zinc-400">Goal, referral, and accountability profile</p>
          </div>
        </header>

        <section className="mt-4 rounded-lg border border-line bg-surface p-4">
          <div className="flex items-start gap-3">
            <BadgeCheck className="mt-0.5 text-lime" size={20} />
            <p className="text-sm leading-6 text-zinc-300">
              Referral codes connect every subscription to the right gym and trainer revenue dashboard.
            </p>
          </div>
        </section>

        <form className="mt-4 space-y-4 rounded-lg border border-line bg-surface p-4">
          <Field label="Full name">
            <input className={inputClass} defaultValue="Ahmad Rahman" />
          </Field>
          <Field label="Referral code" hint="Examples: AF-AUSTIN, AF-KULAI, TRAINER-JASON">
            <input className={inputClass} defaultValue="TRAINER-JASON" />
          </Field>
          <Field label="Goal">
            <select className={inputClass} defaultValue="fat_loss">
              <option value="fat_loss">Fat loss</option>
              <option value="muscle_gain">Muscle gain</option>
              <option value="maintenance">Maintenance</option>
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Current weight">
              <input className={inputClass} defaultValue="81.2" inputMode="decimal" />
            </Field>
            <Field label="Target weight">
              <input className={inputClass} defaultValue="75.0" inputMode="decimal" />
            </Field>
          </div>
          <ActionButton>
            Continue
            <ArrowRight className="ml-2" size={19} />
          </ActionButton>
        </form>
      </div>
    </main>
  );
}


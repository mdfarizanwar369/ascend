import { Check, CreditCard } from "lucide-react";
import { PLANS } from "@ascend/shared";

const features = {
  free: ["Weight tracking", "Water tracking", "Basic logging"],
  premium: ["AI food photo estimates", "Progress photos", "AI nutrition coach", "Weekly reports"],
  trainer_pro: ["Trainer dashboard", "Risk alerts", "AI weekly check-ins", "Client messaging"]
};

export default function SubscriptionPage() {
  return (
    <main className="min-h-screen bg-ink px-4 py-5 text-white">
      <div className="mx-auto max-w-md">
        <header className="py-3">
          <p className="text-sm text-zinc-400">ToyyibPay checkout</p>
          <h1 className="mt-1 text-2xl font-semibold">Choose your plan</h1>
        </header>

        <section className="mt-4 space-y-3">
          {(Object.keys(PLANS) as Array<keyof typeof PLANS>).map((plan) => (
            <article key={plan} className="rounded-lg border border-line bg-surface p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">{PLANS[plan].label}</h2>
                  <p className="mt-1 text-sm text-zinc-400">{PLANS[plan].audience}</p>
                </div>
                <p className="text-right text-xl font-semibold text-lime">RM{PLANS[plan].priceRm}</p>
              </div>
              <div className="mt-4 space-y-2">
                {features[plan].map((feature) => (
                  <div key={feature} className="flex items-center gap-2 text-sm text-zinc-300">
                    <Check size={16} className="text-lime" />
                    {feature}
                  </div>
                ))}
              </div>
              <button className="mt-4 flex h-11 w-full items-center justify-center rounded-lg bg-lime font-semibold text-ink">
                <CreditCard className="mr-2" size={18} />
                {plan === "free" ? "Start free" : "Checkout"}
              </button>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}


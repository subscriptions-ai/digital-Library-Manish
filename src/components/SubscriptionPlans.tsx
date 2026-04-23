import { useState } from "react";
import { Check, ShoppingCart, Phone } from "lucide-react";
import { SUBSCRIPTION_PLANS } from "../constants";
import { useCart } from "../contexts/CartContext";
import { toast } from "react-hot-toast";
import { useNavigate } from "react-router-dom";

// ─── Types ────────────────────────────────────────────────────────────────────
type Duration = "Monthly" | "Quarterly" | "Half-Yearly" | "Yearly";

interface SubscriptionPlansProps {
  showTitle?: boolean;
  isFullPage?: boolean;
}

// ─── FAQ data (from reference image) ─────────────────────────────────────────
const FAQS = [
  {
    q: "Can I cancel my subscription anytime?",
    a: "Yes, you can cancel your individual subscription at any time. Your access will continue until the end of the current billing period.",
  },
  {
    q: "How does institutional access work?",
    a: "Institutional access is typically based on IP ranges. Once configured, anyone within your network can access the library without individual logins.",
  },
  {
    q: "Do you offer student discounts?",
    a: "Yes, we offer specialized pricing for verified students. Please contact our support team with your student ID for more information.",
  },
  {
    q: "Can I download articles for offline reading?",
    a: "Most of our subscription plans include PDF download capabilities for offline use and personal archiving.",
  },
];

// ─── Helper ────────────────────────────────────────────────────────────────────
function getPricingTier(plan: typeof SUBSCRIPTION_PLANS[0], duration: Duration) {
  return plan.pricing.find((p) => p.duration === duration);
}

// ─── Component ────────────────────────────────────────────────────────────────
export function SubscriptionPlans({
  showTitle = false,
  isFullPage = false,
}: SubscriptionPlansProps) {
  const [duration, setDuration] = useState<Duration>("Yearly");
  const { addToCart } = useCart();
  const navigate = useNavigate();

  const handleAddToCart = (plan: typeof SUBSCRIPTION_PLANS[0]) => {
    const tier = getPricingTier(plan, duration);
    if (!tier) return;
    addToCart({
      domainId: plan.id,
      domainName: plan.name,
      planId: plan.id,
      planName: plan.name,
      price: tier.price,
      duration,
      category: plan.userType,
    });
    toast.success(`${plan.name} added to cart!`);
  };

  // ── Plan cards section ────────────────────────────────────────────────────
  const plansSection = (
    <div className="w-full">
      {/* Page heading */}
      {showTitle && (
        <div className="text-center mb-10">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900">
            Subscription Plans
          </h1>
          <p className="mt-3 text-slate-500 max-w-xl mx-auto">
            Choose the plan that best fits your academic or institutional needs.
            All prices are in Indian Rupees (₹).
          </p>
        </div>
      )}

      {/* Duration toggle */}
      <div className="flex justify-center mb-10">
        <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1 gap-1">
          {(["Monthly", "Quarterly", "Half-Yearly", "Yearly"] as Duration[]).map((d) => (
            <button
              key={d}
              onClick={() => setDuration(d)}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition-all ${
                duration === d
                  ? "bg-white text-slate-900 shadow-sm border border-slate-200"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* Plan cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {SUBSCRIPTION_PLANS.map((plan, i) => {
          const tier = getPricingTier(plan, duration);
          if (!tier) return null;
          const { price, features, badge, saveText } = tier;
          
          const isBestValue = badge && badge.includes("BEST VALUE");

          return (
            <div
              key={plan.id}
              className={`relative flex flex-col rounded-3xl border bg-white p-6 transition-all ${
                isBestValue ? "border-blue-500 shadow-md ring-1 ring-blue-500" : "border-slate-200 shadow-sm hover:shadow-lg"
              }`}
            >
              {/* Floating badge for BEST VALUE */}
              {isBestValue && (
                <div className="absolute -top-5 left-1/2 -translate-x-1/2 w-[160px] text-center">
                  <span className="inline-block w-full rounded-full bg-blue-600 px-4 py-1.5 text-[10px] font-bold text-white shadow-sm leading-[1.2]">
                    {badge.split(" - ")[0]}<br/>
                    {badge.split(" - ")[1] ? `- ${badge.split(" - ")[1]}` : ""}
                  </span>
                </div>
              )}

              {/* INDIVIDUAL badge */}
              {plan.name === "Student Scholar" && (
                <div className="absolute top-6 right-6">
                  <span className="inline-block rounded-full bg-blue-50 text-blue-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest whitespace-nowrap">
                    INDIVIDUAL
                  </span>
                </div>
              )}

              <div className={`${isBestValue ? "mt-4" : "mt-2"}`}>
                <h3 className="text-lg font-bold text-slate-900 pr-16">{plan.name}</h3>
                <p className="mt-2 text-[11px] text-slate-500 leading-relaxed pr-2">{plan.description}</p>
              </div>

              {/* Price */}
              <div className="mt-5">
                <div className="flex items-baseline gap-0.5">
                  <span className="text-sm text-slate-700 font-medium">₹</span>
                  <span className="text-3xl font-extrabold text-slate-900">
                    {price.toLocaleString("en-IN")}
                  </span>
                  <span className="ml-1 text-[11px] text-slate-400">/{duration.toLowerCase()}</span>
                </div>
                {saveText ? (
                  <p className="mt-1 text-[10px] font-bold text-green-600 uppercase tracking-wide">
                    {saveText}
                  </p>
                ) : (
                  <div className="h-4"></div>
                )}
              </div>

              {/* Features */}
              <ul className="mt-6 space-y-3 flex-1">
                {features.map((f, fi) => (
                  <li key={fi} className="flex items-start gap-2 text-[12px] text-slate-600">
                    <div className="mt-0.5 rounded-full bg-blue-50 p-0.5">
                      <Check size={12} className="text-blue-500 shrink-0" strokeWidth={3} />
                    </div>
                    <span className="leading-tight">{f}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <button
                onClick={() => handleAddToCart(plan)}
                className={`mt-8 w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition-all ${
                  isBestValue
                    ? "bg-blue-600 hover:bg-blue-700 text-white shadow-md"
                    : "bg-slate-900 hover:bg-slate-800 text-white"
                }`}
              >
                <ShoppingCart size={15} />
                Get Started
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── Full-page layout ──────────────────────────────────────────────────────
  if (isFullPage) {
    return (
      <div className="min-h-screen bg-white">
        {/* Plans section */}
        <section className="py-16 bg-white border-b border-slate-100">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            {plansSection}
          </div>
        </section>

        {/* Custom quote dark banner */}
        <section className="py-14 bg-white">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
            <div className="rounded-2xl bg-slate-900 px-8 py-14 text-center">
              <h2 className="text-2xl font-bold text-white sm:text-3xl">
                Need a custom plan for your organization?
              </h2>
              <p className="mt-3 text-slate-400 max-w-xl mx-auto text-sm">
                We offer tailored solutions for government agencies, corporate R&D centers, and specialized
                research institutes.
              </p>
              <button
                onClick={() => navigate("/contact")}
                className="mt-8 inline-flex items-center gap-2 rounded-full bg-indigo-600 hover:bg-indigo-700 px-8 py-4 text-sm font-bold text-white transition-all"
              >
                <Phone size={15} />
                Contact Sales for Custom Quote
              </button>
            </div>
          </div>
        </section>

        {/* FAQ section */}
        <section className="py-16 bg-white">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-extrabold text-slate-900 text-center mb-12">
              Frequently Asked Questions
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-14 gap-y-10">
              {FAQS.map((faq, i) => (
                <div key={i}>
                  <h3 className="text-base font-bold text-slate-900">{faq.q}</h3>
                  <p className="mt-2 text-sm text-indigo-600 leading-relaxed">{faq.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    );
  }

  // ── Embedded (not full page) ──────────────────────────────────────────────
  return plansSection;
}

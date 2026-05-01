import { useState } from "react";
import { Check, ShoppingCart, Phone, Info, AlertCircle } from "lucide-react";
import { SUBSCRIPTION_PLANS } from "../constants";
import { useCart } from "../contexts/CartContext";
import { toast } from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type Duration = "Monthly" | "Quarterly" | "Half-Yearly" | "Yearly";

interface SubscriptionPlansProps {
  showTitle?: boolean;
  isFullPage?: boolean;
  onPlanClick?: (plan: typeof SUBSCRIPTION_PLANS[0], duration: Duration) => void;
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
  onPlanClick,
}: SubscriptionPlansProps) {
  const [duration, setDuration] = useState<Duration>("Yearly");
  const { addToCart } = useCart();
  const navigate = useNavigate();

  const handleAddToCart = (plan: typeof SUBSCRIPTION_PLANS[0]) => {
    const tier = getPricingTier(plan, duration);
    if (!tier) return;
    
    if (onPlanClick) {
      onPlanClick(plan, duration);
      return;
    }

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
                  
                  {/* GST Badge from Screenshot */}
                  <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-[9px] font-bold text-orange-600">
                    <div className="flex h-3 w-3 items-center justify-center rounded-full border border-orange-300 text-[8px]">
                      i
                    </div>
                    +18% GST APPLICABLE
                  </div>

                  {saveText ? (
                    <p className="mt-3 text-[10px] font-bold text-green-600 uppercase tracking-wide">
                      {saveText}
                    </p>
                  ) : (
                    <div className="h-4"></div>
                  )}
                </div>

              {/* Features */}
                <ul className="mt-6 space-y-3 flex-1">
                  {features.map((f, fi) => {
                    const isInfoFeature = f.includes("Price applicable");
                    return (
                      <li key={fi} className="flex items-start gap-2 text-[12px] text-slate-600">
                        <div className={`mt-0.5 rounded-full p-0.5 ${isInfoFeature ? "bg-blue-50 text-blue-500" : "bg-blue-50 text-blue-500"}`}>
                          {isInfoFeature ? (
                            <Info size={12} strokeWidth={3} />
                          ) : (
                            <Check size={12} strokeWidth={3} />
                          )}
                        </div>
                        <span className={`leading-tight ${isInfoFeature ? "text-slate-500 italic" : ""}`}>{f}</span>
                      </li>
                    );
                  })}
                </ul>

              {/* CTA */}
                <button
                  onClick={() => handleAddToCart(plan)}
                  className="mt-8 w-full flex items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-sm font-bold text-white transition-all hover:bg-slate-800 shadow-md"
                >
                  <ShoppingCart size={15} />
                  Get Started
                </button>
            </div>
          );
        })}
      </div>

      {/* Notices Section from Screenshot */}
      <div className="mt-16 space-y-8 max-w-5xl mx-auto">
          {/* Main Notice */}
          <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-6 flex items-start gap-4">
            <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
              <Info className="text-blue-600" size={20} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900">Important Subscription Notice</h4>
              <p className="mt-1 text-[13px] text-slate-600 leading-relaxed">
                Price applicable for <span className="font-bold text-blue-600">one department only</span>. 18% GST extra as applicable. Access is limited to content categories available under the selected department.
              </p>
            </div>
          </div>

          {/* Two Column Notices */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-2 w-2 rounded-full bg-blue-500" />
                <h4 className="text-sm font-bold text-slate-900">Department Scope Notice</h4>
              </div>
              <ul className="space-y-3">
                <li className="flex items-start gap-2 text-[12px] text-slate-500">
                  <ArrowRight size={12} className="mt-0.5 shrink-0 text-blue-400" />
                  <span>Each subscription plan is valid for one department only.</span>
                </li>
                <li className="flex items-start gap-2 text-[12px] text-slate-500">
                  <ArrowRight size={12} className="mt-0.5 shrink-0 text-blue-400" />
                  <span>Access will be limited to content categories available under the selected department.</span>
                </li>
              </ul>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-2 w-2 rounded-full bg-blue-500" />
                <h4 className="text-sm font-bold text-slate-900">Category Limitation Note</h4>
              </div>
              <ul className="space-y-3">
                <li className="flex items-start gap-2 text-[12px] text-slate-500">
                  <ArrowRight size={12} className="mt-0.5 shrink-0 text-blue-400" />
                  <span>Users will get access only to the categories included in the selected department.</span>
                </li>
                <li className="flex items-start gap-2 text-[12px] text-slate-500">
                  <ArrowRight size={12} className="mt-0.5 shrink-0 text-blue-400" />
                  <span>Cross-department access is not included.</span>
                </li>
              </ul>
            </div>
          </div>
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

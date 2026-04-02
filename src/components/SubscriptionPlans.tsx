import { SUBSCRIPTION_PLANS } from "../constants";
import { Check, ShoppingCart } from "lucide-react";
import { useState } from "react";
import { cn } from "../lib/utils";
import { useCart } from "../contexts/CartContext";
import { toast } from "react-hot-toast";

interface SubscriptionPlansProps {
  showTitle?: boolean;
  isFullPage?: boolean;
  domainId?: string;
  domainName?: string;
}

export function SubscriptionPlans({ 
  showTitle = false, 
  isFullPage = false,
  domainId,
  domainName
}: SubscriptionPlansProps) {
  const [selectedDuration, setSelectedDuration] = useState<"Monthly" | "Quarterly" | "Half-Yearly" | "Yearly">("Yearly");
  const { addToCart } = useCart();

  const handleAddToCart = (plan: any, pricingOption: any) => {
    if (!domainId || !domainName) {
      toast.error("Please select a department first from the Digital Library.");
      return;
    }

    addToCart({
      domainId,
      domainName,
      planId: plan.id,
      planName: plan.name,
      price: pricingOption.price,
      duration: selectedDuration,
      category: plan.userType
    });
    toast.success(`Added ${domainName} (${plan.name}) to cart!`);
  };

  const content = (
    <div className="w-full">
      {showTitle && (
        <div className="text-center mb-16">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-6xl">Simple, Transparent <span className="text-blue-600">Pricing</span></h1>
          <p className="mt-6 text-xl text-slate-600 max-w-2xl mx-auto">
            Choose the plan that fits your research needs. From individual students to large universities across India, we have you covered.
          </p>
        </div>
      )}

      {/* Duration Toggle */}
      <div className="mb-12 flex items-center justify-center gap-2">
        <div className="inline-flex rounded-full bg-slate-100 p-1">
          {(["Monthly", "Quarterly", "Half-Yearly", "Yearly"] as const).map((duration) => (
            <button
              key={duration}
              onClick={() => setSelectedDuration(duration)}
              className={cn(
                "rounded-full px-6 py-2 text-sm font-bold transition-all",
                selectedDuration === duration ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-900"
              )}
            >
              {duration}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
        {SUBSCRIPTION_PLANS.map((plan) => {
          const pricingOption = plan.pricing.find(p => p.duration === selectedDuration) || plan.pricing[0];
          
          return (
            <div key={plan.id} className={cn(
              "relative flex flex-col rounded-3xl border p-8 transition-all hover:shadow-xl",
              plan.userType === "Student" ? "border-blue-200 bg-white" : "border-slate-200 bg-white"
            )}>
              {plan.userType === "Student" && (
                <span className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-blue-600 px-4 py-1 text-[10px] font-bold uppercase tracking-widest text-white">
                  Best for Individuals
                </span>
              )}
              <div className="mb-8">
                <h3 className="text-lg font-bold text-slate-900">{plan.name}</h3>
                <p className="mt-2 text-xs text-slate-500 leading-relaxed">
                  {plan.description}
                </p>
                <div className="mt-6 flex items-baseline gap-1">
                  <span className="text-sm font-bold text-slate-900">₹</span>
                  <span className="text-4xl font-bold tracking-tight text-slate-900">
                    {pricingOption.price.toLocaleString('en-IN')}
                  </span>
                  <span className="text-sm font-medium text-slate-500">/{selectedDuration.toLowerCase()}</span>
                </div>
              </div>
              <ul className="mb-10 space-y-4 flex-1">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-slate-600">
                    <div className="mt-0.5 rounded-full bg-blue-100 p-0.5 text-blue-600">
                      <Check size={12} />
                    </div>
                    {feature}
                  </li>
                ))}
              </ul>
              <button 
                onClick={() => handleAddToCart(plan, pricingOption)}
                className={cn(
                  "w-full flex items-center justify-center gap-2 rounded-2xl py-4 text-sm font-bold transition-all shadow-lg",
                  plan.userType === "Student" ? "bg-blue-600 text-white hover:bg-blue-700 shadow-blue-500/20" : "bg-slate-900 text-white hover:bg-slate-800 shadow-slate-900/10"
                )}
              >
                <ShoppingCart size={18} />
                Add to Cart
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );

  if (isFullPage) {
    return (
      <div className="min-h-screen bg-slate-50">
        <section className="bg-white border-b border-slate-200 py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            {content}
          </div>
        </section>
        
        <section className="py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mt-24 rounded-3xl bg-slate-900 p-8 md:p-16 text-white text-center">
              <h2 className="text-2xl font-bold md:text-3xl">Need a custom plan for your organization?</h2>
              <p className="mt-4 text-slate-400 max-w-2xl mx-auto">
                We offer tailored solutions for government agencies, corporate R&D centers, and specialized research institutes.
              </p>
              <div className="mt-10">
                <button className="rounded-full bg-blue-600 px-8 py-4 text-sm font-bold text-white hover:bg-blue-700 transition-all">
                  Contact Sales for Custom Quote
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold text-slate-900">Frequently Asked Questions</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 max-w-4xl mx-auto">
              {[
                { q: "Can I cancel my subscription anytime?", a: "Yes, you can cancel your individual subscription at any time. Your access will continue until the end of the current billing period." },
                { q: "How does institutional access work?", a: "Institutional access is typically based on IP ranges. Once configured, anyone within your network can access the library without individual logins." },
                { q: "Do you offer student discounts?", a: "Yes, we offer specialized pricing for verified students. Please contact our support team with your student ID for more information." },
                { q: "Can I download articles for offline reading?", a: "Most of our subscription plans include PDF download capabilities for offline use and personal archiving." }
              ].map((faq, i) => (
                <div key={i}>
                  <h4 className="font-bold text-slate-900">{faq.q}</h4>
                  <p className="mt-3 text-sm text-slate-500 leading-relaxed">{faq.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    );
  }

  return content;
}

import { useState, useEffect } from "react";
import { Check, ShoppingCart, Loader2 } from "lucide-react";
import { cn } from "../lib/utils";
import { useCart } from "../contexts/CartContext";
import { toast } from "react-hot-toast";

interface SubscriptionPlansProps {
  showTitle?: boolean;
  isFullPage?: boolean;
}

export function SubscriptionPlans({ 
  showTitle = false, 
  isFullPage = false
}: SubscriptionPlansProps) {
  const [selectedDuration, setSelectedDuration] = useState<"Monthly" | "Quarterly" | "Yearly">("Yearly");
  const { addToCart } = useCart();
  
  const [modules, setModules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/content-modules');
        const data = await res.json();
        setModules(data);
      } catch (err) {
        console.error("Failed to load modules", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleAddToCart = (mod: any) => {
    let price = mod.monthlyPrice;
    if (selectedDuration === "Quarterly") price = mod.quarterlyPrice;
    if (selectedDuration === "Yearly") price = mod.yearlyPrice;

    // Notice we use the `domain` string as the domainId inside the cart
    addToCart({
      domainId: mod.domain,
      domainName: mod.domain,
      planId: mod.id,
      planName: `${mod.domain} - ${mod.contentType}`,
      price,
      duration: selectedDuration,
      category: "Individual"
    });
    toast.success(`Added ${mod.contentType} (${mod.domain}) to cart!`);
  };

  // Group modules by domain
  const domains = Array.from(new Set(modules.map(m => m.domain)));

  const content = (
    <div className="w-full">
      {showTitle && (
        <div className="text-center mb-16">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-6xl">Configure Your <span className="text-blue-600">Access</span></h1>
          <p className="mt-6 text-xl text-slate-600 max-w-2xl mx-auto">
            Build your tailored subscription by selecting the exact domains and content types you need.
          </p>
        </div>
      )}

      {/* Duration Toggle */}
      <div className="mb-12 flex items-center justify-center gap-2">
        <div className="inline-flex rounded-full bg-slate-100 p-1">
          {(["Monthly", "Quarterly", "Yearly"] as const).map((duration) => (
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

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="flex items-center gap-2 text-slate-500">
            <Loader2 className="animate-spin" size={20} /> Loading pricing modules...
          </div>
        </div>
      ) : domains.length === 0 ? (
        <div className="text-center py-12 text-slate-500 border border-slate-200 border-dashed rounded-3xl">
          No pricing modules available at the moment. Please check back later.
        </div>
      ) : (
        <div className="space-y-16">
          {domains.map((domain) => (
            <div key={domain}>
              <h2 className="text-2xl font-bold text-slate-900 mb-6 px-2 border-b border-slate-200 pb-2">{domain} Packages</h2>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {modules.filter(m => m.domain === domain).map((mod) => {
                  let price = mod.monthlyPrice;
                  if (selectedDuration === "Quarterly") price = mod.quarterlyPrice;
                  if (selectedDuration === "Yearly") price = mod.yearlyPrice;
                  
                  return (
                    <div key={mod.id} className="flex flex-col rounded-3xl border border-slate-200 bg-white p-6 transition-all hover:shadow-xl hover:border-blue-200">
                      <div className="mb-6">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 tracking-wider uppercase mb-3">
                          {mod.contentType}
                        </span>
                        <div className="mt-4 flex flex-col">
                          <span className="text-3xl font-bold tracking-tight text-slate-900">
                            ₹{price.toLocaleString('en-IN')}
                          </span>
                          <span className="text-xs font-medium text-slate-500 mt-1">/{selectedDuration.toLowerCase()}</span>
                        </div>
                      </div>
                      <ul className="mb-8 space-y-3 flex-1">
                        <li className="flex items-start gap-2 text-sm text-slate-600">
                          <Check size={16} className="text-emerald-500 shrink-0" />
                          <span>Unlimited access to all {mod.contentType} in {domain}</span>
                        </li>
                        <li className="flex items-start gap-2 text-sm text-slate-600">
                          <Check size={16} className="text-emerald-500 shrink-0" />
                          <span>Over {mod.totalCount.toLocaleString('en-IN')}+ items available</span>
                        </li>
                        <li className="flex items-start gap-2 text-sm text-slate-600">
                          <Check size={16} className="text-emerald-500 shrink-0" />
                          <span>PDF Downloads</span>
                        </li>
                      </ul>
                      <button 
                        onClick={() => handleAddToCart(mod)}
                        className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white transition-all hover:bg-blue-700 shadow-lg shadow-blue-500/20"
                      >
                        <ShoppingCart size={16} />
                        Add to Cart
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
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
        
        <section className="py-20">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
            <div className="rounded-3xl bg-slate-900 p-8 md:p-12 text-white text-center">
              <h2 className="text-2xl font-bold md:text-3xl">Need a custom plan for your organization?</h2>
              <p className="mt-4 text-slate-400 max-w-2xl mx-auto">
                We offer tailored solutions for government agencies, corporate R&D centers, and specialized research institutes. Get massive volume discounts for institution-wide access.
              </p>
              <div className="mt-8">
                <button className="rounded-full bg-blue-600 px-8 py-4 text-sm font-bold text-white hover:bg-blue-500 transition-all">
                  Contact Sales for Custom Quote
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return content;
}

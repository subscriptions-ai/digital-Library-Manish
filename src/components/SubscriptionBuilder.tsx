import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, ArrowRight, Loader2, ShieldCheck, Zap, Tag, Clock } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';

interface ContentModule {
  id: string;
  domain: string;
  contentType: string;
  totalCount: number;
  monthlyPrice: number;
  quarterlyPrice: number;
  yearlyPrice: number;
  yearlyDiscountPct: number;
  isActive: boolean;
}

interface PriceResult {
  breakdown: Array<{ id: string; domain: string; contentType: string; price: number; totalCount: number }>;
  subtotal: number;
  gstAmount: number;
  total: number;
  planType: string;
  gstType: string;
}

const PLAN_OPTIONS = [
  { value: 'Monthly', label: 'Monthly', multiplier: 1 },
  { value: 'Quarterly', label: 'Quarterly', suffix: '· Best for Trials' },
  { value: 'Yearly', label: 'Yearly', suffix: '· Best Value ✨' },
];

const CONTENT_TYPE_ICONS: Record<string, string> = {
  'Books': '📚', 'Periodicals': '📰', 'Magazines': '🗞️', 'Case Reports': '📋',
  'Theses': '🎓', 'Conference Proceedings': '🧑‍🤝‍🧑', 'Educational Videos': '🎬', 'Newsletters': '📩'
};

interface SubscriptionBuilderProps {
  domain?: string;
  themeColor?: string;
}

export function SubscriptionBuilder({ domain, themeColor = 'blue' }: SubscriptionBuilderProps) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [modules, setModules] = useState<ContentModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [planType, setPlanType] = useState<'Monthly' | 'Quarterly' | 'Yearly'>('Yearly');
  const [priceResult, setPriceResult] = useState<PriceResult | null>(null);
  const [calculating, setCalculating] = useState(false);

  const colorMap: Record<string, string> = {
    blue: 'bg-blue-600 border-blue-600 text-blue-700 bg-blue-50',
    indigo: 'bg-indigo-600 border-indigo-600 text-indigo-700 bg-indigo-50',
    red: 'bg-red-600 border-red-600 text-red-700 bg-red-50',
    emerald: 'bg-emerald-600 border-emerald-600 text-emerald-700 bg-emerald-50',
    purple: 'bg-purple-600 border-purple-600 text-purple-700 bg-purple-50',
    orange: 'bg-orange-600 border-orange-600 text-orange-700 bg-orange-50',
  };
  const colors = (colorMap[themeColor] || colorMap.blue).split(' ');
  const [activeBg, activeBorder, accentText, lightBg] = colors;

  useEffect(() => {
    (async () => {
      try {
        const url = domain ? `/api/content-modules?domain=${encodeURIComponent(domain)}` : '/api/content-modules';
        const res = await fetch(url);
        const data = await res.json();
        setModules(data);
      } catch { toast.error('Failed to load content modules'); }
      finally { setLoading(false); }
    })();
  }, [domain]);

  const calculatePrice = useCallback(async (ids: string[], plan: string) => {
    if (ids.length === 0) { setPriceResult(null); return; }
    setCalculating(true);
    try {
      const res = await fetch('/api/content-modules/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduleIds: ids, planType: plan, userState: profile?.state || '' })
      });
      setPriceResult(await res.json());
    } catch { toast.error('Pricing calculation failed'); }
    finally { setCalculating(false); }
  }, [profile?.state]);

  const toggle = (id: string) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
    calculatePrice([...next], planType);
  };

  const selectAll = () => {
    const all = modules.map(m => m.id);
    setSelectedIds(new Set(all));
    calculatePrice(all, planType);
  };

  const clearAll = () => { setSelectedIds(new Set()); setPriceResult(null); };

  const changePlan = (plan: 'Monthly' | 'Quarterly' | 'Yearly') => {
    setPlanType(plan);
    if (selectedIds.size > 0) calculatePrice([...selectedIds], plan);
  };

  const formatPrice = (n: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

  const getPriceForModule = (m: ContentModule) => {
    if (planType === 'Monthly') return m.monthlyPrice;
    if (planType === 'Quarterly') return m.quarterlyPrice;
    return m.yearlyPrice;
  };

  const handleGetAccess = () => {
    if (selectedIds.size === 0) { toast.error('Select at least one module'); return; }
    if (!profile) {
      toast.error('Please login to request access');
      navigate('/login');
      return;
    }
    navigate('/create-quotation', {
      state: {
        preselectedModules: [...selectedIds],
        priceResult,
        planType,
        domain
      }
    });
  };

  if (loading) return (
    <div className="flex items-center justify-center py-16 gap-2 text-slate-400">
      <Loader2 size={20} className="animate-spin" /> Loading packages...
    </div>
  );

  if (modules.length === 0) return (
    <div className="text-center py-12 bg-slate-50 rounded-2xl border border-slate-200">
      <p className="text-slate-500 text-sm">No content packages available for this domain yet.</p>
    </div>
  );

  return (
    <div className="space-y-8">
      {/* Plan Selector */}
      <div>
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-widest mb-3">Choose Your Plan Duration</h3>
        <div className="flex flex-wrap gap-3">
          {PLAN_OPTIONS.map(p => (
            <button
              key={p.value}
              onClick={() => changePlan(p.value as any)}
              className={cn(
                "relative flex flex-col items-start px-5 py-3 rounded-2xl border-2 text-sm font-bold transition-all",
                planType === p.value
                  ? `${activeBg} ${activeBorder} text-white shadow-lg`
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
              )}
            >
              <span className="flex items-center gap-2"><Clock size={14} /> {p.label}</span>
              {p.suffix && <span className={cn("text-[11px] mt-0.5 opacity-80")}>{p.suffix}</span>}
              {planType === p.value && (
                <span className="absolute -top-1.5 -right-1.5 bg-emerald-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">SELECTED</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="grid xl:grid-cols-3 gap-8 items-start">
        {/* Module Selector */}
        <div className="xl:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-widest">
              Available Modules <span className={cn("ml-2 text-xs px-2 py-0.5 rounded-full", lightBg, accentText)}>{modules.length} types</span>
            </h3>
            <div className="flex gap-2 text-xs font-bold">
              <button onClick={selectAll} className={cn("px-3 py-1.5 rounded-lg", lightBg, accentText, "hover:opacity-80 transition-opacity")}>Select All</button>
              <button onClick={clearAll} className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors">Clear</button>
            </div>
          </div>

          <div className="space-y-2">
            {modules.map(m => {
              const isSelected = selectedIds.has(m.id);
              const price = getPriceForModule(m);
              return (
                <motion.button
                  key={m.id}
                  onClick={() => toggle(m.id)}
                  whileTap={{ scale: 0.99 }}
                  className={cn(
                    "w-full flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all",
                    isSelected
                      ? `${activeBorder} ${lightBg} shadow-md`
                      : "border-slate-100 bg-white hover:border-slate-200 hover:shadow-sm"
                  )}
                >
                  {/* Checkbox */}
                  <div className={cn(
                    "w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all",
                    isSelected ? `${activeBg} ${activeBorder}` : "border-slate-300 bg-white"
                  )}>
                    {isSelected && <CheckCircle2 size={14} className="text-white" />}
                  </div>

                  {/* Icon + Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-lg">{CONTENT_TYPE_ICONS[m.contentType] || '📄'}</span>
                      <span className={cn("font-bold", isSelected ? accentText : "text-slate-900")}>{m.contentType}</span>
                      <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                        {m.totalCount.toLocaleString()} items
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{m.domain} • Full access included</p>
                  </div>

                  {/* Price */}
                  <div className="text-right shrink-0">
                    {price > 0 ? (
                      <>
                        <div className={cn("font-extrabold text-lg", isSelected ? accentText : "text-slate-800")}>
                          {formatPrice(price)}
                        </div>
                        <div className="text-[11px] text-slate-400">per {planType.toLowerCase()}</div>
                      </>
                    ) : (
                      <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">Free</span>
                    )}
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Sticky Price Breakdown Panel */}
        <div className="xl:sticky xl:top-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
            <div className={cn("p-5", activeBg)}>
              <div className="flex items-center gap-2 text-white font-bold text-sm">
                <Tag size={16} /> Your Package Summary
              </div>
              <div className="text-white/80 text-xs mt-1">
                {selectedIds.size} module{selectedIds.size !== 1 ? 's' : ''} selected · {planType}
              </div>
            </div>

            <div className="p-5 space-y-4">
              {selectedIds.size === 0 ? (
                <div className="text-center py-6 text-slate-400">
                  <div className="text-3xl mb-2">☑️</div>
                  <p className="text-sm">Select modules to see pricing</p>
                </div>
              ) : (
                <AnimatePresence>
                  {calculating ? (
                    <motion.div key="calc" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="flex items-center justify-center py-6 gap-2 text-slate-400">
                      <Loader2 size={18} className="animate-spin" /> Calculating...
                    </motion.div>
                  ) : priceResult ? (
                    <motion.div key="result" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                      {priceResult.breakdown.map(b => (
                        <div key={b.id} className="flex justify-between items-center text-sm">
                          <div className="flex items-center gap-1.5 text-slate-700">
                            <span>{CONTENT_TYPE_ICONS[b.contentType] || '📄'}</span>
                            <span className="font-medium truncate max-w-[120px]">{b.contentType}</span>
                          </div>
                          <span className="font-bold text-slate-900 shrink-0">{formatPrice(b.price)}</span>
                        </div>
                      ))}
                      <div className="pt-3 border-t border-slate-100 space-y-1.5">
                        <div className="flex justify-between text-sm text-slate-500">
                          <span>Subtotal</span><span>{formatPrice(priceResult.subtotal)}</span>
                        </div>
                        <div className="flex justify-between text-sm text-slate-500">
                          <span>{priceResult.gstType || 'GST'} (18%)</span>
                          <span>{formatPrice(priceResult.gstAmount)}</span>
                        </div>
                        <div className="flex justify-between font-extrabold text-slate-900 text-lg pt-2 border-t border-slate-200">
                          <span>Total</span>
                          <span className={accentText}>{formatPrice(priceResult.total)}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 text-right">
                          per {planType.toLowerCase()} · incl. GST
                        </div>
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              )}

              {/* CTA */}
              <button
                onClick={handleGetAccess}
                disabled={selectedIds.size === 0 || calculating}
                className={cn(
                  "w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg disabled:opacity-40 disabled:cursor-not-allowed",
                  activeBg, "text-white hover:opacity-90"
                )}
              >
                <Zap size={16} /> Request Access / Get Quotation
                <ArrowRight size={15} />
              </button>

              <div className="flex items-center gap-2 text-xs text-slate-400 justify-center">
                <ShieldCheck size={13} /> Secure · No auto-renewals · Cancel anytime
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

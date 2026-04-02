import React, { useState } from 'react';
import { useCart } from '../contexts/CartContext';
import { calculateGST, INDIAN_STATES, COMPANY_STATE } from '../lib/gstUtils';
import { Trash2, FileText, CreditCard, ChevronRight, ShoppingCart } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';

export function Cart() {
  const { items, removeFromCart, totalBasePrice, clearCart } = useCart();
  const [selectedState, setSelectedState] = useState(COMPANY_STATE);
  const [userCategory, setUserCategory] = useState('Academic');
  const navigate = useNavigate();

  const USER_CATEGORIES = [
    'Student',
    'College',
    'University',
    'Corporate'
  ];

  const isInterState = selectedState !== COMPANY_STATE;
  const gstBreakdown = calculateGST(totalBasePrice, isInterState);

  if (items.length === 0) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-8">
        <div className="bg-slate-100 p-6 rounded-full mb-6">
          <ShoppingCart size={48} className="text-slate-400" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Your cart is empty</h2>
        <p className="mt-2 text-slate-500">Add some departments to your cart to get started.</p>
        <Link 
          to="/digital-library" 
          className="mt-8 rounded-full bg-blue-600 px-8 py-3 text-sm font-bold text-white hover:bg-blue-700 transition-all"
        >
          Browse Library
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-slate-900 mb-8">Shopping Cart</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Cart Items */}
          <div className="lg:col-span-2 space-y-4">
            {items.map((item) => (
              <div key={item.domainId} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
                    <FileText size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900">{item.domainName}</h3>
                    <p className="text-sm text-slate-500">
                      {item.category} • {item.planName} ({item.duration})
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <div className="font-bold text-slate-900">₹{item.price.toLocaleString()}</div>
                    <div className="text-xs text-slate-400">+ GST</div>
                  </div>
                  <button 
                    onClick={() => removeFromCart(item.domainId)}
                    className="text-slate-300 hover:text-red-500 transition-colors p-2"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              </div>
            ))}

            <div className="bg-blue-50 rounded-2xl p-6 border border-blue-100">
              <p className="text-sm text-blue-800 font-medium">
                “18% GST will be applicable as per Government of India rules”
              </p>
            </div>
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-3xl p-8 shadow-xl border border-slate-100 sticky top-24">
              <h2 className="text-xl font-bold text-slate-900 mb-6">Order Summary</h2>
              
              <div className="mb-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">User Category</label>
                  <select 
                    value={userCategory}
                    onChange={(e) => setUserCategory(e.target.value)}
                    className="w-full rounded-xl border-slate-200 bg-slate-50 py-3 px-4 text-sm focus:border-blue-500 focus:ring-blue-500"
                  >
                    {USER_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Billing State (for GST)</label>
                  <select 
                    value={selectedState}
                    onChange={(e) => setSelectedState(e.target.value)}
                    className="w-full rounded-xl border-slate-200 bg-slate-50 py-3 px-4 text-sm focus:border-blue-500 focus:ring-blue-500"
                  >
                    {INDIAN_STATES.map(state => (
                      <option key={state} value={state}>{state}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-4 mb-8">
                <div className="flex justify-between text-slate-600">
                  <span>Base Price</span>
                  <span>₹{gstBreakdown.basePrice.toLocaleString()}</span>
                </div>
                
                {isInterState ? (
                  <div className="flex justify-between text-slate-600 text-sm">
                    <div className="flex flex-col">
                      <span>IGST (18%)</span>
                      <span className="text-[10px] text-slate-400 italic">Inter-state supply</span>
                    </div>
                    <span>₹{gstBreakdown.igst.toLocaleString()}</span>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between text-slate-600 text-sm">
                      <div className="flex flex-col">
                        <span>CGST (9%)</span>
                        <span className="text-[10px] text-slate-400 italic">Intra-state supply</span>
                      </div>
                      <span>₹{gstBreakdown.cgst.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-slate-600 text-sm">
                      <div className="flex flex-col">
                        <span>SGST (9%)</span>
                        <span className="text-[10px] text-slate-400 italic">Intra-state supply</span>
                      </div>
                      <span>₹{gstBreakdown.sgst.toLocaleString()}</span>
                    </div>
                  </>
                )}
                
                <div className="h-px bg-slate-100 my-4" />
                
                <div className="flex justify-between text-xl font-bold text-slate-900">
                  <span>Total Amount</span>
                  <span>₹{gstBreakdown.totalAmount.toLocaleString()}</span>
                </div>
              </div>

              <div className="space-y-3">
                <button 
                  onClick={() => {
                    if (gstBreakdown.totalAmount <= 0) {
                      toast.error("Invalid amount. Please add items to cart.");
                      return;
                    }
                    navigate('/checkout', { state: { type: 'payment', selectedState, userCategory } });
                  }}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-4 text-sm font-bold text-white hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
                >
                  <CreditCard size={18} />
                  Pay Now
                </button>
                
                <button 
                  onClick={() => {
                    if (gstBreakdown.totalAmount <= 0) {
                      toast.error("Invalid amount. Please add items to cart.");
                      return;
                    }
                    navigate('/checkout', { state: { type: 'quotation', selectedState, userCategory } });
                  }}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-4 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-all"
                >
                  <FileText size={18} />
                  Generate Quotation
                </button>
              </div>

              <p className="mt-6 text-center text-xs text-slate-400">
                Secure payment powered by Razorpay
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

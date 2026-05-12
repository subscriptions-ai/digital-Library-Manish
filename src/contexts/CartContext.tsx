import React, { createContext, useContext, useState, useEffect } from 'react';
import { DOMAINS, SUBSCRIPTION_PLANS } from '../constants';

export interface CartItem {
  domainId: string;
  domainName: string;
  planId: string;
  planName: string;
  price: number;
  duration: string;
  category: string;
}

export interface AppliedCoupon {
  id: string;
  code: string;
  discount: number;
}

interface CartContextType {
  items: CartItem[];
  addToCart: (item: CartItem) => void;
  removeFromCart: (domainId: string) => void;
  clearCart: () => void;
  totalBasePrice: number;
  appliedCoupon: AppliedCoupon | null;
  applyCoupon: (coupon: AppliedCoupon) => void;
  removeCoupon: () => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    const saved = localStorage.getItem('cart');
    return saved ? JSON.parse(saved) : [];
  });

  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(() => {
    const saved = localStorage.getItem('appliedCoupon');
    return saved ? JSON.parse(saved) : null;
  });

  useEffect(() => {
    localStorage.setItem('cart', JSON.stringify(items));
  }, [items]);

  useEffect(() => {
    if (appliedCoupon) {
      localStorage.setItem('appliedCoupon', JSON.stringify(appliedCoupon));
    } else {
      localStorage.removeItem('appliedCoupon');
    }
  }, [appliedCoupon]);

  const addToCart = (newItem: CartItem) => {
    setItems(prev => {
      const exists = prev.find(item => item.domainId === newItem.domainId);
      if (exists) {
        return prev.map(item => item.domainId === newItem.domainId ? newItem : item);
      }
      return [...prev, newItem];
    });
  };

  const removeFromCart = (domainId: string) => {
    setItems(prev => prev.filter(item => item.domainId !== domainId));
  };

  const clearCart = () => {
    setItems([]);
    setAppliedCoupon(null);
  };

  const applyCoupon = (coupon: AppliedCoupon) => setAppliedCoupon(coupon);
  const removeCoupon = () => setAppliedCoupon(null);

  const totalBasePrice = items.reduce((sum, item) => sum + item.price, 0);

  return (
    <CartContext.Provider value={{ 
      items, 
      addToCart, 
      removeFromCart, 
      clearCart, 
      totalBasePrice,
      appliedCoupon,
      applyCoupon,
      removeCoupon
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}

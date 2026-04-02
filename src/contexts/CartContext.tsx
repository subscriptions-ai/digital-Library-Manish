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

interface CartContextType {
  items: CartItem[];
  addToCart: (item: CartItem) => void;
  removeFromCart: (domainId: string) => void;
  clearCart: () => void;
  totalBasePrice: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    const saved = localStorage.getItem('cart');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('cart', JSON.stringify(items));
  }, [items]);

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
  };

  const totalBasePrice = items.reduce((sum, item) => sum + item.price, 0);

  return (
    <CartContext.Provider value={{ items, addToCart, removeFromCart, clearCart, totalBasePrice }}>
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

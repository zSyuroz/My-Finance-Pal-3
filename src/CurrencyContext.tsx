import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { getSetting, setSetting } from './db';
import {
  applyCurrency,
  DEFAULT_CURRENCY,
  isCurrencyCode,
  type CurrencyCode,
} from './currency';

type CurrencyContextValue = {
  code: CurrencyCode;
  setCurrency: (code: CurrencyCode) => void;
};

const CurrencyContext = createContext<CurrencyContextValue | undefined>(undefined);

const SETTING_KEY = 'currency';

/**
 * Holds the chosen currency as React state so a change re-renders the tree,
 * and mirrors it into the `currency` module so `fmtMoney` — a plain function
 * called from dozens of list rows — prints the new symbol on that same pass.
 * Keeping both in step is the whole job of this provider.
 */
export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [code, setCode] = useState<CurrencyCode>(DEFAULT_CURRENCY);

  useEffect(() => {
    getSetting(SETTING_KEY).then((v) => {
      if (v && isCurrencyCode(v)) {
        applyCurrency(v);
        setCode(v);
      }
    });
  }, []);

  const setCurrency = useCallback((next: CurrencyCode) => {
    // Applied before the state update so the render triggered by setCode
    // already formats with the new symbol.
    applyCurrency(next);
    setCode(next);
    setSetting(SETTING_KEY, next);
  }, []);

  const value = useMemo(() => ({ code, setCurrency }), [code, setCurrency]);
  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency(): CurrencyContextValue {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error('useCurrency must be used inside CurrencyProvider');
  return ctx;
}

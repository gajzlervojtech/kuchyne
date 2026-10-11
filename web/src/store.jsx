import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api } from './api';

const Ctx = createContext(null);

export function AppProvider({ children }) {
  const [shopping, setShopping] = useState({ groups: [], done: [], open_count: 0, done_count: 0 });
  const [meta, setMeta] = useState({ categories: [], units: [] });
  const [toast, setToast] = useState(null);
  const toastTimer = useRef();

  const refreshShopping = useCallback(async () => {
    try { setShopping(await api.get('/shopping')); } catch { /* offline */ }
  }, []);

  const notify = useCallback((text, kind = 'ok') => {
    setToast({ text, kind });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  useEffect(() => {
    api.get('/meta').then(setMeta).catch(() => {});
    refreshShopping();
    // druhý telefon mohl něco přidat → občas obnovit
    const t = setInterval(() => { if (document.visibilityState === 'visible') refreshShopping(); }, 15000);
    const onVis = () => { if (document.visibilityState === 'visible') refreshShopping(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [refreshShopping]);

  return (
    <Ctx.Provider value={{ shopping, setShopping, refreshShopping, meta, notify }}>
      {children}
      {toast && <div className={`toast toast-${toast.kind}`} role="status">{toast.text}</div>}
    </Ctx.Provider>
  );
}

export const useApp = () => useContext(Ctx);

export function useIsDesktop() {
  const q = '(min-width: 1024px)';
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return m;
}

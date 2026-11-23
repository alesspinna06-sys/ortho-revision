import { createContext, useCallback, useContext, useState } from 'react';
import Icon from './Icon.jsx';

const Ctx = createContext(() => {});

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((t) => {
    const id = Math.random().toString(36).slice(2);
    const item = typeof t === 'string' ? { id, type: 'info', text: t } : { id, type: 'info', ...t };
    setItems((l) => [...l.slice(-3), item]);
    setTimeout(() => setItems((l) => l.filter((x) => x.id !== id)), item.type === 'error' ? 7000 : 4000);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="toasts">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.type}`} onClick={() => setItems((l) => l.filter((x) => x.id !== t.id))}>
            <Icon name={t.type === 'error' ? 'alert' : t.type === 'success' ? 'check' : 'sparkles'} />
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);

import * as React from "react";
import { Toast } from "@/components/ui/toast";

export type ToastKind = "success" | "error" | "warning" | "info";

interface ToastItem {
  id: number;
  message: string;
  type: ToastKind;
}

interface ToastContextValue {
  show: (message: string, type?: ToastKind) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) {
    return {
      show: () => {
        // no-op when used outside provider
      },
    };
  }
  return ctx;
}

export function ToastHost({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);
  const counter = React.useRef(0);

  const show = React.useCallback((message: string, type: ToastKind = "info") => {
    counter.current += 1;
    const id = counter.current;
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  const remove = React.useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const value = React.useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4 sm:right-4 sm:left-auto sm:items-end">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <Toast
              message={t.message}
              type={t.type}
              onClose={() => remove(t.id)}
            />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
  action?: ToastAction;
}

interface ToastState {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'> & { id?: string }) => string;
  removeToast: (id: string) => void;
  clearAll: () => void;
}

const DEFAULT_DURATION = 4000;
const MAX_TOASTS = 5;
const toastTimers = new Map<string, ReturnType<typeof setTimeout>>();

const clearToastTimer = (id: string) => {
  const timer = toastTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    toastTimers.delete(id);
  }
};

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],

  addToast: (toastInput) => {
    const id = toastInput.id ?? `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const duration = toastInput.duration ?? DEFAULT_DURATION;
    let overflowToastId: string | undefined;

    set((state) => {
      const nextToast: Toast = { ...toastInput, id, duration };
      const nextToasts = [...state.toasts, nextToast];

      if (nextToasts.length > MAX_TOASTS) {
        overflowToastId = nextToasts[0]?.id;
      }

      return {
        toasts: nextToasts.slice(-MAX_TOASTS),
      };
    });

    if (overflowToastId) {
      clearToastTimer(overflowToastId);
    }

    if (Number.isFinite(duration) && duration > 0) {
      clearToastTimer(id);
      const timer = setTimeout(() => {
        useToastStore.getState().removeToast(id);
      }, duration);
      toastTimers.set(id, timer);
    }

    return id;
  },

  removeToast: (id) => {
    clearToastTimer(id);
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    }));
  },

  clearAll: () => {
    toastTimers.forEach((timer) => clearTimeout(timer));
    toastTimers.clear();
    set({ toasts: [] });
  },
}));

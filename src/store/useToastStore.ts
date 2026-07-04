import { create } from 'zustand'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface ToastItem {
  duration: number
  id: string
  message: string
  type: ToastType
}

interface ToastState {
  addToast: (message: string, type?: ToastType, duration?: number) => void
  removeToast: (id: string) => void
  toasts: ToastItem[]
}

let toastCounter = 0

const DEFAULT_DURATION: Record<ToastType, number> = {
  error: 5000,
  info: 3000,
  success: 3000,
  warning: 4000,
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  addToast: (message, type = 'info', duration?) => {
    const id = `toast_${++toastCounter}_${Date.now()}`
    const resolvedDuration = duration ?? DEFAULT_DURATION[type]

    set((state) => ({
      toasts: [...state.toasts, { id, message, type, duration: resolvedDuration }],
    }))

    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }))
    }, resolvedDuration)
  },

  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}))

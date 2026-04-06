'use client'
import { useState, useCallback, useEffect, useRef } from 'react'

export type ToastType = 'info' | 'success' | 'warning' | 'error'

export interface Toast {
    id: string
    message: string
    type?: ToastType
    title?: string
    duration?: number
    exiting?: boolean
}

const toastStyles: Record<ToastType, { dot: string }> = {
    info: { dot: 'bg-[#2B8DB8]' },
    success: { dot: 'bg-emerald-500' },
    warning: { dot: 'bg-amber-500' },
    error: { dot: 'bg-red-500' },
}

export function useToast() {
    const [toasts, setToasts] = useState<Toast[]>([])
    const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

    const dismiss = useCallback((id: string) => {
        setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t))
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 350)
        const timer = timers.current.get(id)
        if (timer) { clearTimeout(timer); timers.current.delete(id) }
    }, [])

    const push = useCallback((toast: Omit<Toast, 'id' | 'exiting'>) => {
        const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
        const duration = toast.duration ?? 3000
        setToasts(prev => [...prev, { ...toast, id, exiting: false }])
        const timer = setTimeout(() => dismiss(id), duration)
        timers.current.set(id, timer)
        return id
    }, [dismiss])

    useEffect(() => {
        const map = timers.current
        return () => { map.forEach(t => clearTimeout(t)); map.clear() }
    }, [])

    return { toasts, push, dismiss }
}

export function ToastContainer({
    toasts,
    onDismiss,
}: {
    toasts: Toast[]
    onDismiss: (id: string) => void
}) {
    return (
        <>
            <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(-16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes toastOut {
          from { opacity: 1; transform: translateY(0); max-height: 80px; margin-bottom: 0; }
          to   { opacity: 0; transform: translateY(-16px); max-height: 0; margin-bottom: -8px; }
        }
      `}</style>

            {/* Fixed top-center, below header (~64px) */}
            <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 items-center pointer-events-none w-full max-w-sm px-4">
                {toasts.map(t => {
                    const type = t.type ?? 'info'
                    const s = toastStyles[type]
                    const now = new Date()
                    const time = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })

                    return (
                        <div
                            key={t.id}
                            className="pointer-events-auto w-full"
                            style={{
                                animation: t.exiting
                                    ? 'toastOut 350ms cubic-bezier(0.4,0,1,1) forwards'
                                    : 'toastIn 350ms cubic-bezier(0,0,0.2,1) forwards',
                            }}
                        >
                            <div className="flex items-start gap-3 bg-white rounded-2xl shadow-lg border border-gray-100 px-4 py-3">
                                {/* Colored dot */}
                                <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />

                                {/* Text */}
                                <div className="flex-1 min-w-0">
                                    {t.title && (
                                        <p className="text-sm font-semibold text-gray-800 leading-tight">{t.title}</p>
                                    )}
                                    <p className="text-xs text-gray-500 leading-snug mt-0.5">{t.message}</p>
                                    <p className="text-xs text-gray-400 mt-1">{time}</p>
                                </div>

                                {/* Close */}
                                <button
                                    onClick={() => onDismiss(t.id)}
                                    className="flex-shrink-0 text-gray-300 hover:text-gray-500 transition-colors mt-0.5"
                                >
                                    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                                        <path d="M4.293 4.293a1 1 0 011.414 0L8 6.586l2.293-2.293a1 1 0 111.414 1.414L9.414 8l2.293 2.293a1 1 0 01-1.414 1.414L8 9.414l-2.293 2.293a1 1 0 01-1.414-1.414L6.586 8 4.293 5.707a1 1 0 010-1.414z" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    )
                })}
            </div>
        </>
    )
}
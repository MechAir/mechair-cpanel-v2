'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { getUser, logout, AuthUser } from '@/utils/auth'
import { useIoT } from '@/utils/useIoT'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://cpanel.backend.mechair.co.in/api'

interface HeaderProps {
    onToggleSidebar: () => void
    sidebarOpen: boolean
    showToggle?: boolean
}

const ROLE_COLORS: Record<string, string> = {
    'owner': 'bg-amber-600 text-white',
    'admin': 'bg-[#2B8DB8] text-white',
    'sub-admin': 'bg-purple-600 text-white',
    'supervisor': 'bg-amber-500 text-white',
}

const ROLE_LABELS: Record<string, string> = {
    'owner': 'Owner',
    'admin': 'Admin',
    'sub-admin': 'Sub-Admin',
    'supervisor': 'Supervisor',
}

export default function Header({ onToggleSidebar, sidebarOpen, showToggle = true }: HeaderProps) {
    const [user, setUser] = useState<AuthUser | null>(null)
    const params = useParams()
    const deviceId = params?.deviceId as string

    // Notifications State
    const [notifications, setNotifications] = useState<any[]>([])
    const [showNotifications, setShowNotifications] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)

    // Track which notifications user has seen (timestamp of last open)
    const [lastSeenTs, setLastSeenTs] = useState<number>(() => {
        if (typeof window !== 'undefined') {
            return parseInt(localStorage.getItem(`notif_seen_${deviceId}`) || '0', 10)
        }
        return 0
    })

    // Load recent events from Events API
    useEffect(() => {
        if (!deviceId) return
        const fetchEvents = async () => {
            try {
                const now = Date.now()
                const since = now - 24 * 60 * 60 * 1000 // last 24 hours
                const res = await fetch(`${API_BASE}/devices/${deviceId}/events/range?from=${new Date(since).toISOString()}&to=${new Date(now).toISOString()}`)
                const data = await res.json()
                const events = data.data?.events || data.data || []
                const mapped = events.map((evt: any) => ({
                    _id: String(evt.timestamp || Date.now()) + Math.random(),
                    type: evt.eventType || 'event',
                    message: `[${evt.source || 'system'}] ${evt.note || evt.eventType || ''}`,
                    createdAt: typeof evt.timestamp === 'number' ? new Date(evt.timestamp).toISOString() : evt.timestamp,
                    ts: typeof evt.timestamp === 'number' ? evt.timestamp : new Date(evt.timestamp).getTime(),
                    isRead: (typeof evt.timestamp === 'number' ? evt.timestamp : new Date(evt.timestamp).getTime()) <= lastSeenTs,
                }))
                mapped.sort((a: any, b: any) => b.ts - a.ts)
                setNotifications(mapped.slice(0, 50)) // cap at 50 latest
            } catch (err) {
                console.error('Failed to fetch events:', err)
            }
        }
       fetchEvents()
        const interval = setInterval(fetchEvents, 15000) // refresh every 15s
        return () => clearInterval(interval)
    }, [deviceId, lastSeenTs])

    // Live updates via MQTT — relay changes + mode switches appear instantly
    useIoT(
        deviceId ? [`devices/${deviceId}/state`, `devices/${deviceId}/events`] : [],
        useCallback(({ topic, payload }: any) => {
            if (!payload) return

            // State topic — detect relay changes and mode switches
            if (topic?.endsWith('/state')) {
                const rooms = payload.rooms || []
                const mode = payload.mode
                const now = Date.now()
                const newNotifs: any[] = []

                // Detect mode change
                if (mode) {
                    setNotifications(prev => {
                        // Check if latest notification already shows this mode
                        const lastModeNotif = prev.find(n => n.type === 'mode_change')
                        const lastMode = lastModeNotif?.message?.includes('auto') ? 'auto' : lastModeNotif?.message?.includes('manual') ? 'manual' : ''
                        if (lastMode !== mode) {
                            const modeNotif = {
                                _id: `mode-${now}-${Math.random()}`,
                                type: 'mode_change',
                                message: `[device] Mode changed: ${lastMode || '?'} → ${mode}`,
                                createdAt: new Date(now).toISOString(),
                                ts: now,
                                isRead: false,
                            }
                            return [modeNotif, ...prev].slice(0, 50)
                        }
                        return prev
                    })
                }

                // Check relay changes per room
                for (const r of rooms) {
                    const roomName = r.name || `Room ${r.id || '?'}`
                    const relays = [
                        { key: 'sov', alt: 'sovOn', label: 'SOV' },
                        { key: 'exh', alt: 'exhOn', label: 'Exhaust' },
                        { key: 'pump', alt: 'pumpOn', label: 'Pump' },
                    ]
                    for (const relay of relays) {
                        const val = r[relay.key] ?? r[relay.alt]
                        if (val !== undefined) {
                            const msg = `${roomName} ${relay.label} ${val ? 'ON' : 'OFF'}`
                            newNotifs.push({
                                _id: `${now}-${relay.key}-${Math.random()}`,
                                type: 'relay_change',
                                message: `[device] ${msg}`,
                                createdAt: new Date(now).toISOString(),
                                ts: now,
                                isRead: false,
                            })
                        }
                    }
                }

                if (newNotifs.length > 0) {
                    // Deduplicate — only add if the message differs from the latest notification
                    setNotifications(prev => {
                        const lastMsg = prev[0]?.message || ''
                        const unique = newNotifs.filter(n => n.message !== lastMsg)
                        return unique.length > 0 ? [...unique, ...prev].slice(0, 50) : prev
                    })
                }
                return
            }

            // Events topic — direct event from Lambda
            if (topic?.endsWith('/events')) {
                const newNotif = {
                    _id: String(payload.timestamp || Date.now()) + Math.random(),
                    type: payload.eventType || 'event',
                    message: `[${payload.source || 'system'}] ${payload.note || payload.eventType || ''}`,
                    createdAt: typeof payload.timestamp === 'number' ? new Date(payload.timestamp).toISOString() : payload.timestamp,
                    ts: typeof payload.timestamp === 'number' ? payload.timestamp : Date.now(),
                    isRead: false,
                }
                setNotifications(prev => [newNotif, ...prev].slice(0, 50))
            }
        }, [])
    )

    // Click outside to close notification dropdown
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowNotifications(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const unreadCount = notifications.filter(n => !n.isRead).length

    const handleOpenNotifications = () => {
        const opening = !showNotifications
        setShowNotifications(opening)
        // Re-fetch events when opening
        if (opening && deviceId) {
            const now = Date.now()
            const since = now - 24 * 60 * 60 * 1000
            fetch(`${API_BASE}/devices/${deviceId}/events/range?from=${new Date(since).toISOString()}&to=${new Date(now).toISOString()}`)
                .then(r => r.json())
                .then(data => {
                    const events = data.data?.events || data.data || []
                    const mapped = events.map((evt: any) => ({
                        _id: String(evt.timestamp || Date.now()) + Math.random(),
                        type: evt.eventType || 'event',
                        message: `[${evt.source || 'system'}] ${evt.note || evt.eventType || ''}`,
                        createdAt: typeof evt.timestamp === 'number' ? new Date(evt.timestamp).toISOString() : evt.timestamp,
                        ts: typeof evt.timestamp === 'number' ? evt.timestamp : new Date(evt.timestamp).getTime(),
                        isRead: (typeof evt.timestamp === 'number' ? evt.timestamp : new Date(evt.timestamp).getTime()) <= lastSeenTs,
                    }))
                    mapped.sort((a: any, b: any) => b.ts - a.ts)
                    setNotifications(mapped.slice(0, 50))
                })
                .catch(() => {})
        }
        // Mark all as read when opening
        if (!showNotifications && unreadCount > 0) {
            const now = Date.now()
            setLastSeenTs(now)
            if (typeof window !== 'undefined') {
                localStorage.setItem(`notif_seen_${deviceId}`, String(now))
            }
            setNotifications(prev => prev.map(n => ({ ...n, isRead: true })))
        }
    }

    useEffect(() => {
        setUser(getUser())
    }, [])

    const initials = user?.username
        ? user.username.slice(0, 2).toUpperCase()
        : '??'

    return (
        <header className="bg-white shadow-sm border-b border-gray-200 h-14 sm:h-20 flex items-center justify-between px-3 sm:px-8">
            {/* Burger toggle — hidden on dashboard */}
            {showToggle ? (
                <button
                    onClick={onToggleSidebar}
                    className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-500
                       hover:bg-gray-100 hover:text-gray-800 transition-colors"
                >
                    {sidebarOpen ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                    )}
                </button>
            ) : <div />}

            {/* Right side */}
            <div className="flex items-center gap-2 sm:gap-4">
                {/* Notification bell */}
                {deviceId && (
                    <div className="relative" ref={dropdownRef}>
                        <button
                            onClick={handleOpenNotifications}
                            className={`p-2 transition-colors rounded-xl flex items-center justify-center
                                ${showNotifications ? 'bg-[#2B8DB8]/10 text-[#2B8DB8]' : 'text-gray-500 hover:text-[#2B8DB8] hover:bg-gray-50'}`}
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                            </svg>
                            {unreadCount > 0 && (
                                <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-red-500 border-2 border-white rounded-full"></span>
                            )}
                        </button>

                        {/* Dropdown panel */}
                        {showNotifications && (
                            <div className="fixed sm:absolute top-14 left-2 right-2 sm:left-auto sm:right-0 sm:w-80 md:w-96 bg-white border border-gray-100 shadow-xl rounded-2xl z-50 overflow-hidden">
                                <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                                    <h3 className="font-semibold text-gray-800">Notifications</h3>
                                    <span className="text-xs font-medium text-gray-500 bg-gray-200/70 px-2 py-1 rounded-md">{notifications.length} recent</span>
                                </div>
                                <div className="max-h-[28rem] overflow-y-auto">
                                    {notifications.length === 0 ? (
                                        <div className="p-8 text-center text-sm text-gray-500 flex flex-col items-center">
                                            <svg className="w-8 h-8 text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>
                                            No recent notifications
                                        </div>
                                    ) : (
                                        <div className="divide-y divide-gray-50">
                                            {notifications.map((notif: any) => (
                                                <div key={notif._id} className={`p-4 transition-colors hover:bg-gray-50 ${!notif.isRead ? 'bg-blue-50/30' : ''}`}>
                                                    <p className="text-sm border-s-2 border-[#2B8DB8] ps-3 text-gray-700 leading-snug">
                                                        {notif.message}
                                                    </p>
                                                    <p className="text-xs text-gray-400 mt-2 ms-3.5 flex items-center gap-1.5">
                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                        </svg>
                                                        {new Date(notif.createdAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' })}{' '}
                                                        {new Date(notif.createdAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false })}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* User info */}
                {user && (
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-[#2B8DB8] to-[#7DBFDD] rounded-full flex items-center justify-center text-white font-semibold text-sm">
                            {initials}
                        </div>
                        <div className="hidden sm:block">
                            <p className="text-sm font-semibold text-gray-800">{user.username}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ROLE_COLORS[user.role] || 'bg-gray-200 text-gray-700'}`}>
                                    {ROLE_LABELS[user.role] || user.role}
                                </span>
                                {user.linkedDeviceId && (
                                    <span className="text-[10px] text-gray-400 ">{user.linkedDeviceId}</span>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Logout */}
                <button
                    onClick={logout}
                    className="ml-1 sm:ml-2 p-2 sm:px-4 sm:py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-colors duration-200 flex items-center gap-2"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    <span className="hidden sm:inline">Logout</span>
                </button>
            </div>
        </header>
    )
}

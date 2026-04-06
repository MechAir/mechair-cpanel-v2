'use client'

import { useEffect, useState } from 'react'
import { authHeaders } from '@/utils/auth'   // ← add this


const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://cpanel.backend.mechair.co.in/api'

interface HierarchyUser {
    _id: string
    username: string
    role: 'admin' | 'sub-admin' | 'supervisor'
    linkedDeviceId: string | null
    createdBy: string | null
    createdAt: string
}

interface DeviceNode {
    deviceId: string
    subAdmins: SubAdminNode[]
}

interface SubAdminNode {
    user: HierarchyUser
    supervisors: HierarchyUser[]
}

// ─── Role Badge ───────────────────────────────────────────────────────────────
function RoleBadge({ role }: { role: string }) {
    const styles: Record<string, string> = {
        'admin': 'bg-amber-50 text-amber-600 border border-amber-200',
        'sub-admin': 'bg-[#EBF5FB] text-[#2B8DB8] border border-[#2B8DB8]/20',
        'supervisor': 'bg-purple-50 text-purple-600 border border-purple-200',
    }
    const labels: Record<string, string> = {
        'admin': 'Admin',
        'sub-admin': 'Sub-Admin',
        'supervisor': 'Supervisor',
    }
    return (
        <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${styles[role] ?? 'bg-gray-100 text-gray-500'}`}>
            {labels[role] ?? role}
        </span>
    )
}

// ─── User Row ─────────────────────────────────────────────────────────────────
function UserRow({
    user,
    indent = 0,
}: {
    user: HierarchyUser
    indent?: number
    isLast?: boolean
}) {
    const joinedDate = new Date(user.createdAt).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
    })

    return (
        <div className={`py-3 px-4 rounded-xl border border-gray-100 bg-white hover:border-[#2B8DB8]/30 hover:shadow-sm transition-all ${indent > 0 ? 'ml-8' : ''}`}>
            {indent > 0 && (
                <div className="absolute -left-4 top-1/2 w-4 h-px bg-gray-200" />
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
                {/* Left: avatar + role */}
                <div className="flex items-center gap-3">
                    {indent > 0 && (
                        <div className="w-4 h-5 border-l-2 border-b-2 border-gray-200 rounded-bl-md shrink-0 -ml-2" />
                    )}
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 font-semibold text-sm
                ${user.role === 'sub-admin' ? 'bg-[#EBF5FB] text-[#2B8DB8]' : 'bg-purple-50 text-purple-600'}`}>
                        {user.username.charAt(0).toUpperCase()}
                    </div>
                    <RoleBadge role={user.role} />
                </div>
                {/* Right: created info */}
                <p className="text-xs text-gray-400">
                    Created by <span className="text-gray-600 font-medium">{user.createdBy ?? 'system'}</span>
                    <span className="mx-1.5 text-gray-300">·</span>
                    {joinedDate}
                </p>
            </div>

            {/* Credentials block */}
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-xl px-4 py-2.5">
                    <p className="text-xs text-gray-400 mb-0.5">Username</p>
                    <p className="text-sm font-semibold text-gray-800 font-mono">{user.username}</p>
                </div>
                <div className="bg-gray-50 rounded-xl px-4 py-2.5">
                    <p className="text-xs text-gray-400 mb-0.5">Password</p>
                    <p className="text-sm font-semibold text-gray-500 font-mono tracking-widest">••••••••</p>
                </div>
            </div>
        </div>
    )
}

// ─── Device Node Card ─────────────────────────────────────────────────────────
function DeviceNodeCard({ node }: { node: DeviceNode }) {
    const [expanded, setExpanded] = useState(true)
    const totalUsers = node.subAdmins.reduce((acc, sa) => acc + 1 + sa.supervisors.length, 0)

    return (
        <div className="border border-gray-200 rounded-2xl overflow-hidden">
            <button
                onClick={() => setExpanded(e => !e)}
                className="w-full flex items-center gap-3 p-4 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
            >
                <div className="w-9 h-9 rounded-xl bg-[#EBF5FB] flex items-center justify-center shrink-0">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: 18, height: 18 }} className="text-[#2B8DB8]">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                    </svg>
                </div>
                <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-800">{node.deviceId}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                        {node.subAdmins.length} sub-admin{node.subAdmins.length !== 1 ? 's' : ''}
                        {totalUsers > node.subAdmins.length && (
                            <span className="ml-1">
                                · {totalUsers - node.subAdmins.length} supervisor{totalUsers - node.subAdmins.length !== 1 ? 's' : ''}
                            </span>
                        )}
                    </p>
                </div>
                <svg
                    className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {expanded && (
                <div className="p-3 space-y-1">
                    {node.subAdmins.length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-4">No sub-admins assigned to this device</p>
                    ) : (
                        node.subAdmins.map((sa) => (
                            <div key={sa.user._id}>
                                <UserRow user={sa.user} indent={0} />
                                {sa.supervisors.map((sv) => (
                                    <UserRow key={sv._id} user={sv} indent={1} />
                                ))}
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    )
}

// ─── Main Section ─────────────────────────────────────────────────────────────
export default function UserHierarchySection() {
    const [users, setUsers] = useState<HierarchyUser[]>([])
    const [devices, setDevices] = useState<string[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [search, setSearch] = useState('')

    const fetchData = async () => {
        try {
            setError('')
            const [usersRes, devicesRes] = await Promise.all([
                fetch(`${API_BASE}/auth/users`, { headers: authHeaders() }),
                fetch(`${API_BASE}/devices`),
            ])

            const usersData = await usersRes.json()
            const devicesData = await devicesRes.json()

            if (usersData.success) setUsers(usersData.data)
            else setError(usersData.message || 'Failed to load users')

            if (devicesData.success) setDevices(devicesData.data.map((d: any) => d.deviceId))
        } catch {
            setError('Failed to load user data')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { fetchData() }, [])

    const buildHierarchy = (): DeviceNode[] => {
        const filteredUsers = search.trim()
            ? users.filter(u => u.username.toLowerCase().includes(search.toLowerCase()))
            : users

        return devices.map(deviceId => {
            const subAdmins = filteredUsers
                .filter(u => u.role === 'sub-admin' && u.linkedDeviceId === deviceId)
                .map(sa => ({
                    user: sa,
                    supervisors: filteredUsers.filter(
                        u => u.role === 'supervisor' && u.linkedDeviceId === deviceId && u.createdBy === sa.username
                    )
                }))
            return { deviceId, subAdmins }
        }).filter(node => !search.trim() || node.subAdmins.length > 0)
    }

    const hierarchy = buildHierarchy()
    const totalSubAdmins = users.filter(u => u.role === 'sub-admin').length
    const totalSupervisors = users.filter(u => u.role === 'supervisor').length

    return (
        <div className="mt-12">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
                <div>
                    <h3 className="text-xl font-bold text-gray-800">User Hierarchy</h3>
                    <p className="text-sm text-gray-500 mt-0.5">Devices → Sub-admins → Supervisors</p>
                </div>
                <div className="flex items-center gap-3 sm:gap-4">
                    <div className="flex items-center gap-3 text-xs text-gray-500">

                        <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-[#2B8DB8]" />
                            <span>{totalSubAdmins} Sub-admin{totalSubAdmins !== 1 ? 's' : ''}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-purple-400" />
                            <span>{totalSupervisors} Supervisor{totalSupervisors !== 1 ? 's' : ''}</span>
                        </div>
                    </div>
                    <button
                        onClick={fetchData}
                        className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    </button>
                </div>
            </div>

            <div className="relative mb-5">
                <svg className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search by username…"
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#2B8DB8] focus:border-transparent"
                />
            </div>

            {loading ? (
                <div className="space-y-3">
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />
                    ))}
                </div>
            ) : error ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center mb-3">
                        <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <p className="text-gray-600 text-sm font-medium">{error}</p>
                    <button onClick={fetchData} className="text-xs text-[#2B8DB8] hover:underline mt-2">Try again</button>
                </div>
            ) : hierarchy.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center mb-3">
                        <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    </div>
                    <p className="text-gray-500 text-sm">No users found</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {hierarchy.map(node => (
                        <DeviceNodeCard key={node.deviceId} node={node} />
                    ))}
                </div>
            )}
        </div>
    )
}
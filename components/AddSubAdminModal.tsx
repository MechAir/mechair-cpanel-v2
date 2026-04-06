'use client'

import { useState } from 'react'
import { createUser } from '@/utils/auth'

interface AddSubAdminModalProps {
    deviceId: string
    onClose: () => void
}

export default function AddSubAdminModal({ deviceId, onClose }: AddSubAdminModalProps) {
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [canEditRoom, setCanEditRoom] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState(false)

    const handleSubmit = async () => {
        if (!username.trim() || !password) {
            setError('Username and password are required')
            return
        }
        setLoading(true)
        setError('')
        const result = await createUser({
            username: username.trim(),
            password,
            role: 'sub-admin',
            linkedDeviceId: deviceId,
            canEditRoom
        })
        setLoading(false)
        if (result.success) {
            setSuccess(true)
            setTimeout(onClose, 1200)
        } else {
            setError(result.message || 'Failed to create sub-admin')
        }
    }

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-gray-100">
                    <div>
                        <h2 className="text-base font-semibold text-gray-800">Add Sub-Admin</h2>
                        <p className="text-xs text-gray-400  mt-0.5">{deviceId}</p>
                    </div>
                    <button onClick={onClose}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Body */}
                <div className="p-5 space-y-4">
                    <p className="text-xs text-gray-500">
                        This sub-admin will only be able to access <span className=" font-semibold text-[#2B8DB8]">{deviceId}</span>.
                    </p>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Username</label>
                        <input
                            type="text"
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            placeholder="e.g. subadmin_warehouse"
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm
                         focus:outline-none focus:ring-2 focus:ring-[#2B8DB8] focus:border-transparent"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
                        <div className="relative">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                placeholder="Set a password"
                                className="w-full px-4 py-2.5 pr-10 border border-gray-200 rounded-xl text-sm
                           focus:outline-none focus:ring-2 focus:ring-[#2B8DB8] focus:border-transparent"
                            />
                            <button
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                        d={showPassword
                                            ? "M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                                            : "M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"} />
                                </svg>
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={canEditRoom}
                                onChange={(e) => setCanEditRoom(e.target.checked)}
                                className="w-4 h-4 text-[#2B8DB8] border-gray-300 rounded focus:ring-[#2B8DB8]"
                            />
                            <span className="text-sm font-medium text-gray-700">Can this sub-admin edit room settings?</span>
                        </label>
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl">
                            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {error}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex gap-3 p-5 pt-0">
                    <button onClick={onClose}
                        className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={loading || success}
                        className="flex-1 px-4 py-2.5 bg-[#2B8DB8] text-white rounded-xl text-sm font-medium
                       hover:bg-[#2478a0] transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                        {success ? (
                            <>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                Created!
                            </>
                        ) : loading ? (
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : 'Create Sub-Admin'}
                    </button>
                </div>
            </div>
        </div>
    )
}

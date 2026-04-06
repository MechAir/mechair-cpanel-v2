'use client'

import { useState, useEffect } from 'react'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://cpanel.backend.mechair.co.in/api'

interface PinSettingsModalProps {
    deviceId: string
    onClose: () => void
}

export default function PinSettingsModal({
    deviceId,
    onClose
}: PinSettingsModalProps) {
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)

    const [pins, setPins] = useState({
        settingsPin: '',
        datetimePin: '',
        networkPin: '',
        resetPin: '',
        manualDosePin: ''
    })

    // Prefill via GET
    useEffect(() => {
        const fetchPins = async () => {
            try {
                const res = await fetch(`${API_BASE}/devices/${deviceId}/settings/pins`)
                const data = await res.json()
                if (data.success && data.data) {
                    setPins({
                        settingsPin: data.data.settingsPin || '',
                        datetimePin: data.data.datetimePin || '',
                        networkPin: data.data.networkPin || '',
                        resetPin: data.data.resetPin || '',
                        manualDosePin: data.data.manualDosePin || ''
                    })
                }
            } catch (err) {
                console.error('Failed to fetch PINs:', err)
            } finally {
                setLoading(false)
            }
        }
        fetchPins()
    }, [deviceId])

    const handleSave = async () => {
        setSaving(true)
        try {
            const res = await fetch(`${API_BASE}/devices/${deviceId}/settings/pins`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(pins)
            })
            const data = await res.json()
            if (data.success) {
                setSaved(true)
                setTimeout(() => {
                    setSaved(false)
                    onClose()
                }, 1200)
            } else {
                alert(`Failed to save PINs: ${data.message}`)
            }
        } catch (err) {
            console.error('Failed to save PINs:', err)
            alert('Error updating PINs.')
        } finally {
            setSaving(false)
        }
    }

    const handleChange = (key: keyof typeof pins) => (e: React.ChangeEvent<HTMLInputElement>) => {
        // Only allow numbers, max 4 digits (assuming standard PINs, or any string as spec didn't limit)
        const val = e.target.value.replace(/\D/g, '')
        setPins(prev => ({ ...prev, [key]: val }))
    }

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">

                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-gray-100">
                    <div>
                        <h2 className="text-base font-semibold text-gray-800">PIN Passwords</h2>
                        <p className="text-xs text-gray-400 mt-0.5">{deviceId}</p>
                    </div>
                    <button onClick={onClose}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Body */}
                <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
                    {loading ? (
                        <div className="flex justify-center p-4">
                            <div className="w-6 h-6 border-2 border-[#2B8DB8] border-t-transparent rounded-full animate-spin"></div>
                        </div>
                    ) : (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Settings PIN</label>
                                <input type="text" value={pins.settingsPin} onChange={handleChange('settingsPin')} placeholder="1234" maxLength={6}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#2B8DB8] focus:border-transparent" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Date & Time PIN</label>
                                <input type="text" value={pins.datetimePin} onChange={handleChange('datetimePin')} placeholder="7890" maxLength={6}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#2B8DB8] focus:border-transparent" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Network Settings PIN</label>
                                <input type="text" value={pins.networkPin} onChange={handleChange('networkPin')} placeholder="5678" maxLength={6}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#2B8DB8] focus:border-transparent" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Reset Settings PIN</label>
                                <input type="text" value={pins.resetPin} onChange={handleChange('resetPin')} placeholder="1111" maxLength={6}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#2B8DB8] focus:border-transparent" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Manual Dose PIN</label>
                                <input type="text" value={pins.manualDosePin} onChange={handleChange('manualDosePin')} placeholder="2222" maxLength={6}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#2B8DB8] focus:border-transparent" />
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="flex gap-3 p-5 pt-0 border-t border-gray-100 mt-4">
                    <button onClick={onClose} className="flex-1 mt-4 px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">Cancel</button>
                    <button onClick={handleSave} disabled={saving || loading}
                        className="flex-1 mt-4 px-4 py-2.5 bg-[#2B8DB8] text-white rounded-xl text-sm font-medium hover:bg-[#2478a0] transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                        {saved ? (
                            <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Saved</>
                        ) : saving ? (
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : 'Update PINs'}
                    </button>
                </div>

            </div>
        </div>
    )
}

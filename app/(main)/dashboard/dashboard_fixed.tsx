'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { getUser, isAdmin, isSubAdmin, logout } from '@/utils/auth'
import AddSubAdminModal from '@/components/AddSubAdminModal'
import AddSupervisorModal from '@/components/AddSupervisorModal'
import UserHierarchySection from '@/components/UserHierarchySection'
import PinSettingsModal from '@/components/PinSettingsModal'
import { DEVICE_TYPES, getDeviceType, DeviceTypeConfig } from '@/utils/deviceTypes'


const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://cpanel.backend.mechair.co.in/api'

interface Device {
  deviceId: string
  name: string
  location: string
  status: 'active' | 'inactive' | 'maintenance'
  mode: 'auto' | 'manual'
  isPoweredOn?: boolean
  lastSeen: string
  rooms: Array<{ id: string; name: string; isOn: boolean }>
}

// ─── Gear Dropdown Menu ────────────────────────────────────────────────────────
function GearMenu({
  device,
  onWifi,
  onUpdatePins,
  onAddSubAdmin,
  onAddSupervisor,
  onDeleteDevice,
  onPowerOffDevice,
  onPowerOnDevice
}: {
  device: Device
  onWifi: () => void
  onUpdatePins: () => void
  onAddSubAdmin: () => void
  onAddSupervisor: () => void
  onDeleteDevice: () => void
  onPowerOffDevice: () => void
  onPowerOnDevice: () => void
}) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const admin = isAdmin()

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  if (!admin) return null  // sub-admin/supervisor: no gear on dashboard

  const isPoweredOn = device.isPoweredOn !== false

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400
                   hover:bg-gray-100 hover:text-gray-600 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-44 sm:w-48 bg-white border border-gray-100 rounded-xl shadow-lg z-30 overflow-hidden">

          <div className="border-t border-gray-100" />
          <button
            onClick={e => { e.stopPropagation(); setOpen(false); onUpdatePins() }}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-[#2B8DB8] hover:bg-[#EBF5FB] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Update PINs
          </button>
          <div className="border-t border-gray-100" />
          <button
            onClick={e => { e.stopPropagation(); setOpen(false); onAddSubAdmin() }}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-[#2B8DB8] hover:bg-[#EBF5FB] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            Add Sub-Admin
          </button>
          <div className="border-t border-gray-100" />
          <button
            onClick={e => { e.stopPropagation(); setOpen(false); onAddSupervisor() }}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-[#2B8DB8] hover:bg-[#EBF5FB] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            Add Supervisor
          </button>
          <div className="border-t border-gray-100" />
          <button
            onClick={e => { e.stopPropagation(); setOpen(false); onDeleteDevice() }}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete Device
          </button>
          <div className="border-t border-gray-100" />
          {isPoweredOn ? (
            <button
              onClick={e => { e.stopPropagation(); setOpen(false); onPowerOffDevice() }}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Power Off Device
            </button>
          ) : (
            <button
              onClick={e => { e.stopPropagation(); setOpen(false); onPowerOnDevice() }}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-green-600 hover:bg-green-50 transition-colors"
            >
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Power On Device
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── WiFi Settings Modal ──────────────────────────────────────────────────────
function WiFiSettingsModal({
  device,
  onClose
}: {
  device: Device
  onClose: () => void
}) {
  const [ssid, setSsid] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showHierarchy, setShowHierarchy] = useState(false)

  const handleSave = async () => {
    if (!ssid.trim()) return
    setLoading(true)
    await new Promise(r => setTimeout(r, 800))
    setLoading(false)
    setSaved(true)
    setTimeout(() => { setSaved(false); onClose() }, 1200)
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-800">WiFi Credentials</h2>
            <p className="text-xs text-gray-400 mt-0.5">{device.deviceId}</p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">SSID</label>
            <input type="text" value={ssid} onChange={e => setSsid(e.target.value)} placeholder="Network name"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#2B8DB8] focus:border-transparent" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
            <div className="relative">
              <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="WiFi password"
                className="w-full px-4 py-2.5 pr-10 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#2B8DB8] focus:border-transparent" />
              <button onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d={showPassword
                      ? "M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                      : "M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"} />
                </svg>
              </button>
            </div>
          </div>
        </div>
        <div className="flex gap-3 p-5 pt-0">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={loading || !ssid.trim()}
            className="flex-1 px-4 py-2.5 bg-[#2B8DB8] text-white rounded-xl text-sm font-medium hover:bg-[#2478a0] transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {saved ? (
              <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Saved</>
            ) : loading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Device Card ──────────────────────────────────────────────────────────────
function DeviceCard({
  device,
  onClick,
  onWifi,
  onUpdatePins,
  onAddSubAdmin,
  onAddSupervisor,
  onDeleteDevice,
  onPowerOffDevice,
  onPowerOnDevice
}: {
  device: Device
  onClick: () => void
  onWifi: () => void
  onUpdatePins: () => void
  onAddSubAdmin: () => void
  onAddSupervisor: () => void
  onDeleteDevice: () => void
  onPowerOffDevice: () => void
  onPowerOnDevice: () => void
}) {
  const activeRooms = device.rooms.filter(r => r.isOn).length
  const lastSeen = new Date(device.lastSeen)
  const minutesAgo = Math.floor((Date.now() - lastSeen.getTime()) / 60000)
  const lastSeenLabel =
    minutesAgo < 1 ? 'Just now' :
      minutesAgo < 60 ? `${minutesAgo}m ago` :
        minutesAgo < 1440 ? `${Math.floor(minutesAgo / 60)}h ago` :
          `${Math.floor(minutesAgo / 1440)}d ago`

  const isPoweredOn = device.isPoweredOn !== false

  return (
    <div
      onClick={isPoweredOn ? onClick : undefined}
      className={`group bg-white border border-gray-200 rounded-2xl p-3 sm:p-5 ${isPoweredOn
        ? 'cursor-pointer hover:border-[#2B8DB8] hover:shadow-lg'
        : 'opacity-75 relative'
        } transition-all duration-200`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center
            ${device.status === 'active' && isPoweredOn ? 'bg-[#EBF5FB]' : 'bg-gray-100'}`}>
            <svg className={`w-4 h-4 sm:w-5 sm:h-5 ${device.status === 'active'
              && isPoweredOn ? 'text-[#2B8DB8]' : 'text-gray-400'}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
            </svg>
          </div>
          <div>
            <p className="text-xs sm:text-sm font-semibold text-gray-800 truncate max-w-[120px] sm:max-w-none">
              {device.deviceId} {(!isPoweredOn) && <span className="ml-2 text-xs font-medium bg-red-100 text-red-600 px-2 py-0.5 rounded-full">OFF</span>}
            </p>
            {(() => { const dt = getDeviceType(device.deviceId); return (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-white mt-0.5 inline-block" style={{ backgroundColor: dt.color }}>
                {dt.shortLabel} · {dt.rooms} rooms
              </span>
            )})()}
          </div>
        </div>

        {/* Gear dropdown (admin only) */}
        <GearMenu device={device} onWifi={onWifi} onUpdatePins={onUpdatePins} onAddSubAdmin={onAddSubAdmin} onAddSupervisor={onAddSupervisor} onDeleteDevice={onDeleteDevice} onPowerOffDevice={onPowerOffDevice} onPowerOnDevice={onPowerOnDevice} />
      </div>

      {/* Room indicators */}
      <div className="flex gap-1.5 mb-4">
        {device.rooms.map(room => (
          <div key={room.id} title={room.name}
            className={`flex-1 h-1.5 rounded-full transition-colors
              ${room.isOn ? 'bg-[#2B8DB8]' : 'bg-gray-200'}`} />
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-gray-500 gap-2">
        <span className="whitespace-nowrap">{activeRooms}/{device.rooms.length} rooms active</span>
        <div className="flex items-center gap-1 whitespace-nowrap">
          <span className={`w-1.5 h-1.5 rounded-full ${minutesAgo < 5 ? 'bg-emerald-400' : minutesAgo < 60 ? 'bg-amber-400' : 'bg-gray-300'}`} />
          <span>{lastSeenLabel}</span>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
        <span className="text-xs text-gray-400 truncate">
          {device.location !== 'Not specified' ? device.location : 'No location set'}
        </span>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-md
          ${device.mode === 'auto' ? 'bg-[#EBF5FB] text-[#2B8DB8]' : 'bg-purple-50 text-purple-600'}`}>
          {device.mode === 'auto' ? 'Auto' : 'Manual'}
        </span>
      </div>
    </div>
  )
}

// ─── Delete Device Modal ──────────────────────────────────────────────────────
function DeleteDeviceModal({
  device,
  onClose,
  onDeleted
}: {
  device: Device
  onClose: () => void
  onDeleted: (deviceId: string) => void
}) {
  const [confirmId, setConfirmId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleDelete = async () => {
    if (confirmId !== device.deviceId) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE}/devices/${device.deviceId}`, {
        method: 'DELETE'
      })
      if (!res.ok) {
        throw new Error('Failed to delete device')
      }
      onDeleted(device.deviceId)
      onClose()
    } catch {
      setError('Failed to delete device. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-red-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-800">Delete Device</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-600">
            Are you sure you want to delete <span className="font-semibold text-gray-900">{device.deviceId}</span>?
            This action cannot be undone and will permanently delete all associated data including settings, readings, and recipes.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Please type <span className="font-mono bg-gray-100 px-1 py-0.5 rounded text-gray-800">{device.deviceId}</span> to confirm.
            </label>
            <input type="text" value={confirmId} onChange={e => setConfirmId(e.target.value)} placeholder={device.deviceId}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent font-mono placeholder-gray-300" />
          </div>
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              {error}
            </div>
          )}
        </div>
        <div className="flex gap-3 p-6 pt-0">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">Cancel</button>
          <button onClick={handleDelete} disabled={loading || confirmId !== device.deviceId}
            className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Deleting...</> : 'Delete Device'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Add Device Modal ─────────────────────────────────────────────────────────
function AddDeviceModal({
  onClose,
  onAdded
}: {
  onClose: () => void
  onAdded: (device: Device) => void
}) {
  const [deviceId, setDeviceId] = useState('')
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Detect device type from prefix
  const detectedType: DeviceTypeConfig | null = deviceId.length >= 3 ? getDeviceType(deviceId) : null

  const handleSubmit = async () => {
    if (!deviceId.trim()) { setError('Device ID is required'); return }
    if (!detectedType) { setError('Unknown device type. Must start with: ' + Object.keys(DEVICE_TYPES).map(k=>k.toUpperCase()).join(', ')); return }
    setLoading(true)
    setError('')
    try {
      const checkRes = await fetch(`${API_BASE}/devices`)
      const checkData = await checkRes.json()
      const exists = checkData.data?.some((d: Device) => d.deviceId === deviceId.trim())
      if (exists) { setError('A device with this ID already exists'); setLoading(false); return }

      // Try dedicated register endpoint first
      const registerRes = await fetch(`${API_BASE}/devices/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: deviceId.trim(), deviceType: detectedType.prefix, name: name.trim() || deviceId.trim(), location: location.trim() || 'Not specified', rooms: detectedType.rooms })
      })

      if (!registerRes.ok) {
        // Fallback: use readings endpoint to auto-create device
        if (detectedType.prefix === 'ems') {
          await fetch(`${API_BASE}/devices/${deviceId.trim()}/readings`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ R1_temp: 0, R1_CO2: 0, R1_O2: 0, R1_c2h4: 0, R2_temp: 0, R2_CO2: 0, R2_O2: 0, R2_c2h4: 0, R3_temp: 0, R3_CO2: 0, R3_O2: 0, R3_c2h4: 0, R4_temp: 0, R4_CO2: 0, R4_O2: 0, R4_c2h4: 0 })
          })
        } else {
          const rooms: Record<string, object> = {}
          for (let i = 1; i <= detectedType.rooms; i++) rooms[`room${i}`] = { temp: 0, humidity: 0, compressor: false, sov: false }
          rooms['sensor7'] = { temp: 0, humidity: 0 }
          await fetch(`${API_BASE}/devices/${deviceId.trim()}/readings`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rooms)
          })
        }
      }

      const devicesRes = await fetch(`${API_BASE}/devices`)
      const devicesData = await devicesRes.json()
      const newDevice = devicesData.data?.find((d: Device) => d.deviceId === deviceId.trim())
      if (newDevice) onAdded(newDevice)
      onClose()
    } catch { setError('Network error. Please try again.') }
    finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800">Register New Device</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Device ID <span className="text-red-500">*</span></label>
            <input type="text" value={deviceId} onChange={e => setDeviceId(e.target.value.toUpperCase())} placeholder="e.g. EMS001, MLH250..."
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#2B8DB8] focus:border-transparent placeholder-gray-300 font-mono" />
            <p className="text-xs text-gray-400 mt-1">First 3 letters determine device type</p>
            {deviceId.length >= 3 && (
              <div className={`mt-2 flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${detectedType ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                {detectedType ? (
                  <><span className="text-green-500">✓</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded text-white" style={{ backgroundColor: detectedType.color }}>{detectedType.shortLabel}</span>
                  <span>{detectedType.label} · {detectedType.rooms} rooms</span></>
                ) : (
                  <><span>✗</span><span>Unknown type. Supported: {Object.keys(DEVICE_TYPES).map(k=>k.toUpperCase()).join(', ')}</span></>
                )}
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Display Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Warehouse Unit A"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#2B8DB8] focus:border-transparent" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Location</label>
            <input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Building 2, Floor 1"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#2B8DB8] focus:border-transparent" />
          </div>
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              {error}
            </div>
          )}
        </div>
        <div className="flex gap-3 p-6 pt-0">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={loading || !detectedType}
            className="flex-1 px-4 py-2.5 bg-[#2B8DB8] text-white rounded-xl text-sm font-medium hover:bg-[#2478a0] transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Registering...</> : 'Register Device'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [wifiDevice, setWifiDevice] = useState<Device | null>(null)
  const [pinDevice, setPinDevice] = useState<Device | null>(null)
  const [subAdminDevice, setSubAdminDevice] = useState<Device | null>(null)
  const [supervisorDevice, setSupervisorDevice] = useState<Device | null>(null)
  const [showHierarchy, setShowHierarchy] = useState(false)
  const [deleteDevice, setDeleteDevice] = useState<Device | null>(null)
  const [powerOffDevice, setPowerOffDevice] = useState<Device | null>(null)
  const [powerOnDevice, setPowerOnDevice] = useState<Device | null>(null)

  // ── Modals logic ──
  const [deletingIdInput, setDeletingIdInput] = useState('')

  const confirmDelete = async () => {
    if (!deleteDevice || deletingIdInput !== deleteDevice.deviceId) return
    try {
      const res = await fetch(`${API_BASE}/devices/${deleteDevice.deviceId}`, {
        method: 'DELETE'
      })
      if (!res.ok) {
        throw new Error('Failed to delete device')
      }
      setDevices(prev => prev.filter(d => d.deviceId !== deleteDevice.deviceId))
      setDeleteDevice(null)
      setDeletingIdInput('')
    } catch (err) {
      console.error('Delete error', err)
      alert('Failed to delete device')
    }
  }

  const confirmPowerOff = async () => {
    if (!powerOffDevice) return
    try {
      const targetId = powerOffDevice.deviceId

      // Optimistic Update: Mark the entire device as powered off.
      setDevices(prev => prev.map(d =>
        d.deviceId === targetId
          ? { ...d, isPoweredOn: false, rooms: d.rooms.map(r => ({ ...r, isOn: false })) }
          : d
      ))
      setPowerOffDevice(null)

      const res = await fetch(`${API_BASE}/devices/${targetId}/poweroff`, {
        method: 'POST',
      })
      if (!res.ok) {
        alert('Failed to send power off command')
        fetchDevices() // Re-fetch to revert the optimistic update
      }
    } catch (err) {
      console.error('Power off error', err)
      alert('Network error attempting to send power off command')
      fetchDevices() // Re-fetch to revert the optimistic update
    }
  }

  const confirmPowerOn = async () => {
    if (!powerOnDevice) return
    try {
      const targetId = powerOnDevice.deviceId
      setPowerOnDevice(null)

      // Optimistic update: mark the device powered on without forcibly spinning up its rooms
      setDevices(prev => prev.map(d =>
        d.deviceId === targetId
          ? { ...d, isPoweredOn: true }
          : d
      ))

      const res = await fetch(`${API_BASE}/devices/${targetId}/poweron`, {
        method: 'POST',
      })
      if (!res.ok) {
        alert('Failed to send power on command')
        fetchDevices() // Re-fetch to revert the optimistic update
      }
    } catch (err) {
      console.error('Power on error', err)
      alert('Network error attempting to send power on command')
      fetchDevices() // Re-fetch to revert the optimistic update
    }
  }

  useEffect(() => {
    const authStatus = localStorage.getItem('isAuthenticated')
    if (authStatus !== 'true') {
      router.push('/')
      return
    }

    // Sub-admins and supervisors should go directly to their device
    const user = getUser()
    if (user && (user.role === 'sub-admin' || user.role === 'supervisor') && user.linkedDeviceId) {
      router.replace(`/device/${user.linkedDeviceId}/rooms`)
      return
    }

    setIsAuthenticated(true)
  }, [router])

  const fetchDevices = async () => {
    try {
      setError('')
      const res = await fetch(`${API_BASE}/devices`)
      const data = await res.json()
      if (data.success) setDevices(data.data)
      else setError('Failed to load devices')
    } catch { setError('Cannot connect to server') }
    finally { setLoading(false) }
  }

  useEffect(() => {
    if (!isAuthenticated) return
    fetchDevices()
    const interval = setInterval(fetchDevices, 30000)
    return () => clearInterval(interval)
  }, [isAuthenticated])

  const handleDeviceClick = (deviceId: string) => router.push(`/device/${deviceId}/rooms`)
  const handleDeviceAdded = (device: Device) => setDevices(prev => [device, ...prev])
  const handleDeviceDeleted = (deviceId: string) => setDevices(prev => prev.filter(d => d.deviceId !== deviceId))
  const admin = isAdmin()

  if (!isAuthenticated) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-[#2B8DB8]" />
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 sm:mb-8">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-1">Device Management</h2>
          <p className="text-gray-500 text-sm">Monitor and control your IoT devices</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          {admin && (
            <button
              onClick={() => setShowHierarchy(true)}
              className="flex items-center gap-2 px-3 sm:px-5 py-2 sm:py-2.5 border border-[#2B8DB8] text-[#2B8DB8] rounded-xl text-xs sm:text-sm font-medium hover:bg-[#EBF5FB] transition-colors whitespace-nowrap"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              View Sub-Admins
            </button>
          )}
          {admin && (
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-3 sm:px-5 py-2 sm:py-2.5 bg-[#2B8DB8] text-white rounded-xl text-xs sm:text-sm font-medium hover:bg-[#2478a0] transition-colors shadow-sm whitespace-nowrap"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Device
            </button>
          )}
        </div>


      </div>

      {/* Device Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-gray-100 rounded-2xl h-44 animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-gray-600 font-medium mb-1">{error}</p>
          <button onClick={fetchDevices} className="text-sm text-[#2B8DB8] hover:underline mt-2">Try again</button>
        </div>
      ) : devices.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 bg-[#EBF5FB] rounded-2xl flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-[#2B8DB8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
            </svg>
          </div>
          <p className="text-gray-600 font-medium mb-1">No devices registered yet</p>
          <p className="text-gray-400 text-sm mb-4">Add your first IoT device to get started</p>
          {admin && (
            <button onClick={() => setShowAddModal(true)}
              className="px-5 py-2.5 bg-[#2B8DB8] text-white rounded-xl text-sm font-medium hover:bg-[#2478a0] transition-colors">
              Register Device
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5">
          {devices.map(device => (
            <DeviceCard
              key={device.deviceId}
              device={device}
              onClick={() => handleDeviceClick(device.deviceId)}
              onWifi={() => setWifiDevice(device)}
              onUpdatePins={() => setPinDevice(device)}
              onAddSubAdmin={() => setSubAdminDevice(device)}
              onAddSupervisor={() => setSupervisorDevice(device)}
              onDeleteDevice={() => setDeleteDevice(device)}
              onPowerOffDevice={() => setPowerOffDevice(device)}
              onPowerOnDevice={() => setPowerOnDevice(device)}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {showAddModal && (
        <AddDeviceModal onClose={() => setShowAddModal(false)} onAdded={handleDeviceAdded} />
      )}
      {wifiDevice && (
        <WiFiSettingsModal device={wifiDevice} onClose={() => setWifiDevice(null)} />
      )}

      {pinDevice && (
        <PinSettingsModal deviceId={pinDevice.deviceId} onClose={() => setPinDevice(null)} />
      )}

      {subAdminDevice && (
        <AddSubAdminModal deviceId={subAdminDevice.deviceId} onClose={() => setSubAdminDevice(null)} />
      )}
      {supervisorDevice && (
        <AddSupervisorModal deviceId={supervisorDevice.deviceId} onClose={() => setSupervisorDevice(null)} />
      )}
      {showHierarchy && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-100 shrink-0">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">User Hierarchy</h2>
                <p className="text-sm text-gray-400 mt-0.5">Devices → Sub-admins → Supervisors</p>
              </div>
              <button
                onClick={() => setShowHierarchy(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto p-6">
              <UserHierarchySection />
            </div>
          </div>
        </div>
      )}
      {deleteDevice && (
        <DeleteDeviceModal device={deleteDevice} onClose={() => setDeleteDevice(null)} onDeleted={handleDeviceDeleted} />
      )}

      {/* power off modal */}
      {powerOffDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 text-center">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="text-xl font-bold text-gray-900 mb-2 mt-4">Power Off Device?</h3>
            <p className="text-sm text-gray-500 mb-6">
              This will send an immediate command shutting off all rooms, SOVs, and exhaust fans for <span className="font-bold text-gray-800">{powerOffDevice.deviceId}</span>. Are you sure you wish to proceed?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setPowerOffDevice(null)}
                className="flex-1 px-4 py-2.5 rounded-xl border-2 border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={confirmPowerOff}
                className="flex-1 px-4 py-2.5 rounded-xl font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors text-sm"
              >
                Power Off
              </button>
            </div>
          </div>
        </div>
      )}

      {/* power on modal */}
      {powerOnDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 text-center">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="text-xl font-bold text-gray-900 mb-2 mt-4">Power On Device?</h3>
            <p className="text-sm text-gray-500 mb-6">
              This will wake up the device <span className="font-bold text-gray-800">{powerOnDevice.deviceId}</span>. You can then individually configured the rooms.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setPowerOnDevice(null)}
                className="flex-1 px-4 py-2.5 rounded-xl border-2 border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={confirmPowerOn}
                className="flex-1 px-4 py-2.5 rounded-xl font-semibold text-white bg-green-500 hover:bg-green-600 transition-colors text-sm"
              >
                Power On
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="border-t border-gray-200 mt-12 py-6">
        <p className="text-center text-gray-400 text-sm">© 2026 Mech Air. All rights reserved.</p>
      </div>
    </div>
  )
}
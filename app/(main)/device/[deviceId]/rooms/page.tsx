'use client'
import { getUser } from '@/utils/auth'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useToast, ToastContainer } from '@/components/useToast'
import { getDeviceType } from '@/utils/deviceTypes'
import { useIoT } from '@/utils/useIoT'

// ── Interfaces ────────────────────────────────────────────────────────────────
interface RoomData {
  id: string
  name: string
  isOn: boolean
  temp: number
  humid: number
  co2: number
  c2h4: number
  sovOn: boolean
  exhOn: boolean
  pumpOn?: boolean
  hxOn?: boolean
  pfOn?: boolean
  // MLH extras
  compOn?: boolean
  // Recipe runtime status (sent from ESP32)
  recipeName?: string | null
  recipeStep?: number
  recipeTotalSteps?: number
  recipeStepElapsedSec?: number
  recipeStepDurationSec?: number
  c2h4TriggerLow?: number
  c2h4TriggerHigh?: number
  co2TriggerLow?: number
  co2TriggerHigh?: number
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://cpanel.backend.mechair.co.in/api'

// ── Confirm modal ─────────────────────────────────────────────────────────────
function ConfirmModal({ title, message, confirmLabel, confirmClassName, onConfirm, onCancel }: {
  title: string; message: string; confirmLabel: string; confirmClassName?: string
  onConfirm: () => void; onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl p-7 max-w-sm w-full mx-4 border border-gray-100">
        <h2 className="text-base font-bold text-gray-900 mb-2">{title}</h2>
        <p className="text-sm text-gray-500 mb-6">{message}</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 px-4 py-2.5 rounded-xl border-2 border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 text-sm">Cancel</button>
          <button onClick={onConfirm} className={`flex-1 px-4 py-2.5 rounded-xl font-semibold text-white text-sm ${confirmClassName ?? 'bg-[#5A7C8C] hover:bg-[#4a6b7a]'}`}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

// ── Recipe Status Block (used inside EMS room cards) ──────────────────────────
function RecipeStatusBlock({ room }: { room: RoomData }) {
  const hasRecipe = !!room.recipeName && room.recipeName.toLowerCase() !== 'none'
  const totalSteps = room.recipeTotalSteps ?? 0
  const currentStep = room.recipeStep ?? 0
  const elapsed = room.recipeStepElapsedSec ?? 0
  const duration = room.recipeStepDurationSec ?? 0
  const progressPct = duration > 0 ? Math.min(100, Math.max(0, (elapsed / duration) * 100)) : 0

  // Format seconds → "HH:MM:SS"
  const fmt = (sec: number) => {
    if (!Number.isFinite(sec) || sec < 0) sec = 0
    const h = Math.floor(sec / 3600).toString().padStart(2, '0')
    const m = Math.floor((sec % 3600) / 60).toString().padStart(2, '0')
    const s = Math.floor(sec % 60).toString().padStart(2, '0')
    return `${h}:${m}:${s}`
  }

  return (
    <div className="bg-gradient-to-br from-white/15 to-white/5 backdrop-blur-sm rounded-xl p-3 mb-3 border border-white/10 shadow-inner">
      {/* Header row: recipe name + step badge */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${hasRecipe ? 'bg-emerald-400 animate-pulse' : 'bg-white/30'}`} />
          <div className="min-w-0">
            <p className="text-[9px] uppercase tracking-wider text-white/50 font-semibold leading-tight">Recipe</p>
            <p className={`text-sm font-bold truncate leading-tight ${hasRecipe ? 'text-white' : 'text-white/40 italic'}`}>
              {hasRecipe ? room.recipeName : 'None'}
            </p>
          </div>
        </div>
        {hasRecipe && totalSteps > 0 && (
          <div className="bg-white/15 px-2 py-0.5 rounded-full flex-shrink-0">
            <span className="text-[10px] font-bold text-white whitespace-nowrap">Step {currentStep}/{totalSteps}</span>
          </div>
        )}
      </div>

      {/* Progress bar (only if a recipe is running) */}
      {hasRecipe && duration > 0 && (
        <>
          <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden mb-1.5">
            <div
              className="h-full bg-gradient-to-r from-emerald-400 to-cyan-400 rounded-full transition-all duration-500 shadow-[0_0_8px_rgba(52,211,153,0.5)]"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] font-mono text-white/70">
            <span>{fmt(elapsed)}</span>
            <span className="text-white/40">/</span>
            <span>{fmt(duration)}</span>
          </div>
        </>
      )}

      {/* Trigger limits — lower & upper for C₂H₄ and CO₂ */}
      {(room.c2h4TriggerLow !== undefined || room.c2h4TriggerHigh !== undefined ||
        room.co2TriggerLow !== undefined || room.co2TriggerHigh !== undefined) && (
        <div className="mt-2.5 pt-2.5 border-t border-white/10 space-y-1.5">
          {/* C₂H₄ row */}
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] uppercase tracking-wider text-amber-300/80 font-bold w-10 flex-shrink-0">C₂H₄</span>
            <div className="flex-1 grid grid-cols-2 gap-1.5">
              <div className="flex items-center justify-between bg-white/5 rounded-md px-2 py-1">
                <span className="text-[9px] uppercase tracking-wider text-white/40 font-semibold">Low</span>
                <span className="text-[11px] font-bold text-amber-200">{room.c2h4TriggerLow?.toFixed(2) ?? '--'}</span>
              </div>
              <div className="flex items-center justify-between bg-white/5 rounded-md px-2 py-1">
                <span className="text-[9px] uppercase tracking-wider text-white/40 font-semibold">High</span>
                <span className="text-[11px] font-bold text-amber-200">{room.c2h4TriggerHigh?.toFixed(2) ?? '--'}</span>
              </div>
            </div>
          </div>
          {/* CO₂ row */}
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] uppercase tracking-wider text-orange-300/80 font-bold w-10 flex-shrink-0">CO₂</span>
            <div className="flex-1 grid grid-cols-2 gap-1.5">
              <div className="flex items-center justify-between bg-white/5 rounded-md px-2 py-1">
                <span className="text-[9px] uppercase tracking-wider text-white/40 font-semibold">Low</span>
                <span className="text-[11px] font-bold text-orange-200">{room.co2TriggerLow?.toFixed(0) ?? '--'}</span>
              </div>
              <div className="flex items-center justify-between bg-white/5 rounded-md px-2 py-1">
                <span className="text-[9px] uppercase tracking-wider text-white/40 font-semibold">High</span>
                <span className="text-[11px] font-bold text-orange-200">{room.co2TriggerHigh?.toFixed(0) ?? '--'}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── EMS Room Card ─────────────────────────────────────────────────────────────
function EmsRoomCard({ room, isManual, hasPendingSov, hasPendingExh, hasPendingChange, onToggleSov, onToggleExh }: {
  room: RoomData; isManual: boolean
  hasPendingSov?: boolean; hasPendingExh?: boolean; hasPendingChange?: boolean
  onToggleSov: (e: React.MouseEvent) => void; onToggleExh: (e: React.MouseEvent) => void
}) {
  const bg = isManual ? 'bg-[#2B5F75] opacity-90' : room.isOn ? 'bg-[#4185B8]' : 'bg-[#2B5F75]'
  return (
    <div className={`${bg} rounded-xl shadow-lg p-5 w-full text-white transition-all duration-300 hover:scale-[1.02] relative`}>
      {hasPendingChange && <span className="absolute top-3 right-3 h-2 w-2 rounded-full bg-amber-400 shadow" />}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-white text-xl font-medium">{room.name}</h3>
          <p className="text-white/80 text-sm mt-1">
            {isManual ? <span className="text-amber-300 text-xs font-medium">Manual mode</span> : room.isOn ? 'On' : 'Off'}
          </p>
        </div>
        <div className={`w-3 h-3 rounded-full ${isManual ? 'bg-white/30' : room.isOn ? 'bg-green-400' : 'bg-red-400'}`} />
      </div>
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="bg-white/10 rounded-lg p-2.5"><p className="text-white/60 text-xs">Temp</p><p className="text-white font-semibold text-sm">{room.temp?.toFixed(1) ?? '--'}°C</p></div>
        <div className="bg-white/10 rounded-lg p-2.5"><p className="text-white/60 text-xs">Humid</p><p className="text-white font-semibold text-sm">{room.humid?.toFixed(1) ?? '--'}%</p></div>
        <div className="bg-white/10 rounded-lg p-2.5"><p className="text-white/60 text-xs">C₂H₄</p><p className="text-white font-semibold text-sm">{room.c2h4?.toFixed(2) ?? '--'} ppm</p></div>
        <div className="bg-white/10 rounded-lg p-2.5"><p className="text-white/60 text-xs">CO₂</p><p className="text-white font-semibold text-sm">{room.co2 !== undefined ? `${Math.round(room.co2)} ppm` : '--'}</p></div>
      </div>

      {/* ── Recipe Status Card ─────────────────────────────────────── */}
      <RecipeStatusBlock room={room} />
      {isManual && (
        <div className="flex gap-2">
          <button onClick={onToggleSov}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${room.sovOn ? 'bg-green-500 text-white' : 'bg-white/20 text-white/70 hover:bg-white/30'}`}>
            SOV {room.sovOn ? 'ON' : 'OFF'}
          </button>
          <button onClick={onToggleExh}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${room.exhOn ? 'bg-orange-500 text-white' : 'bg-white/20 text-white/70 hover:bg-white/30'}`}>
            Exhaust {room.exhOn ? 'ON' : 'OFF'}
          </button>
        </div>
      )}
      <div className="flex gap-2 mt-2">
        <span className={`flex-1 py-1.5 rounded-lg text-xs font-semibold text-center ${room.sovOn ? 'bg-green-500/40 text-green-200' : 'bg-white/10 text-white/40'}`}>SOV {room.sovOn ? 'ON' : 'OFF'}</span>
        <span className={`flex-1 py-1.5 rounded-lg text-xs font-semibold text-center ${room.exhOn ? 'bg-orange-500/40 text-orange-200' : 'bg-white/10 text-white/40'}`}>Exhaust {room.exhOn ? 'ON' : 'OFF'}</span>
        <span className={`flex-1 py-1.5 rounded-lg text-xs font-semibold text-center ${room.pumpOn ? 'bg-cyan-500/40 text-cyan-200' : 'bg-white/10 text-white/40'}`}>Pump {room.pumpOn ? 'ON' : 'OFF'}</span>
      </div>
      <div className="flex gap-2 mt-2">
        <span className={`flex-1 py-1.5 rounded-lg text-xs font-semibold text-center ${room.hxOn ? 'bg-purple-500/40 text-purple-200' : 'bg-white/10 text-white/40'}`}>Heat Exchanger {room.hxOn ? 'ON' : 'OFF'}</span>
        <span className={`flex-1 py-1.5 rounded-lg text-xs font-semibold text-center ${room.pfOn ? 'bg-yellow-500/40 text-yellow-200' : 'bg-white/10 text-white/40'}`}>Pressure Fan {room.pfOn ? 'ON' : 'OFF'}</span>
      </div>
    </div>
  )
}

// ── MLH Room Card ─────────────────────────────────────────────────────────────
function MlhRoomCard({ room, isManual, hasPendingComp, hasPendingSov, hasPendingChange, onToggleComp, onToggleSov }: {
  room: RoomData; isManual: boolean
  hasPendingComp?: boolean; hasPendingSov?: boolean; hasPendingChange?: boolean
  onToggleComp: (e: React.MouseEvent) => void; onToggleSov: (e: React.MouseEvent) => void
}) {
  const bg = isManual ? 'bg-[#1E5038] opacity-90' : room.isOn ? 'bg-[#2D7D46]' : 'bg-[#1E5038]'
  return (
    <div className={`${bg} rounded-xl shadow-lg p-5 w-full text-white transition-all duration-300 hover:scale-[1.02] relative`}>
      {hasPendingChange && <span className="absolute top-3 right-3 h-2 w-2 rounded-full bg-amber-400 shadow" />}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-white text-xl font-medium">{room.name}</h3>
          <p className="text-white/80 text-sm mt-1">
            {isManual ? <span className="text-amber-300 text-xs font-medium">Manual mode</span> : room.isOn ? 'On' : 'Off'}
          </p>
        </div>
        <div className={`w-3 h-3 rounded-full ${isManual ? 'bg-white/30' : room.isOn ? 'bg-green-400' : 'bg-red-400'}`} />
      </div>
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="bg-white/10 rounded-lg p-2.5"><p className="text-white/60 text-xs">Temperature</p><p className="text-white font-semibold text-sm">{room.temp?.toFixed(1) ?? '--'}°C</p></div>
        <div className="bg-white/10 rounded-lg p-2.5"><p className="text-white/60 text-xs">Humidity</p><p className="text-white font-semibold text-sm">{room.humid?.toFixed(1) ?? '--'}%</p></div>
      </div>
      {isManual && (
        <div className="flex gap-2">
          <button onClick={onToggleComp}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${room.compOn ? 'bg-blue-500 text-white' : 'bg-white/20 text-white/70 hover:bg-white/30'}`}>
            Comp {room.compOn ? 'ON' : 'OFF'}
          </button>
          <button onClick={onToggleSov}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${room.sovOn ? 'bg-cyan-500 text-white' : 'bg-white/20 text-white/70 hover:bg-white/30'}`}>
            Cool SOV {room.sovOn ? 'ON' : 'OFF'}
          </button>
        </div>
      )}
      {!isManual && (
        <div className="flex gap-2">
          <span className={`flex-1 py-1.5 rounded-lg text-xs font-semibold text-center ${room.compOn ? 'bg-blue-500/40 text-blue-200' : 'bg-white/10 text-white/40'}`}>Comp {room.compOn ? 'ON' : 'OFF'}</span>
          <span className={`flex-1 py-1.5 rounded-lg text-xs font-semibold text-center ${room.sovOn ? 'bg-cyan-500/40 text-cyan-200' : 'bg-white/10 text-white/40'}`}>Cool SOV {room.sovOn ? 'ON' : 'OFF'}</span>
        </div>
      )}
    </div>
  )
}

// ── Manual Dosing Modal ───────────────────────────────────────────────────────
function ManualDosingModal({ rooms, pendingRelay1, pendingRelay2, relay1Label, relay2Label, onConfirm, onCancel }: {
  rooms: RoomData[]
  pendingRelay1: Record<string, boolean>
  pendingRelay2: Record<string, boolean>
  relay1Label: string
  relay2Label: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const changedRooms = rooms.filter(r => r.id in pendingRelay1 || r.id in pendingRelay2)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl p-7 max-w-sm w-full mx-4 border border-gray-100">
        <h2 className="text-base font-bold text-gray-900 mb-4">Manual Dosing</h2>
        {changedRooms.length === 0 ? (
          <p className="text-sm text-gray-500 mb-6">No changes staged. Toggle relays on a room first.</p>
        ) : (
          <div className="space-y-3 mb-6">
            {changedRooms.map(room => (
              <div key={room.id} className="bg-gray-50 rounded-lg px-4 py-3 text-sm">
                <span className="font-medium text-gray-700 block mb-2">{room.name}</span>
                {room.id in pendingRelay1 && (
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                    <span className="uppercase font-semibold">{relay1Label}</span>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full font-semibold ${room.sovOn ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>{room.sovOn ? 'ON' : 'OFF'}</span>
                      <span>→</span>
                      <span className={`px-2 py-0.5 rounded-full font-semibold ${pendingRelay1[room.id] ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>{pendingRelay1[room.id] ? 'ON' : 'OFF'}</span>
                    </div>
                  </div>
                )}
                {room.id in pendingRelay2 && (
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span className="uppercase font-semibold">{relay2Label}</span>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full font-semibold ${room.exhOn ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>{room.exhOn ? 'ON' : 'OFF'}</span>
                      <span>→</span>
                      <span className={`px-2 py-0.5 rounded-full font-semibold ${pendingRelay2[room.id] ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>{pendingRelay2[room.id] ? 'ON' : 'OFF'}</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 px-4 py-2.5 rounded-xl border-2 border-gray-200 text-gray-600 font-semibold text-sm">Cancel</button>
          {changedRooms.length > 0 && (
            <button onClick={onConfirm} className="flex-1 px-4 py-2.5 rounded-xl font-semibold text-white bg-[#5A7C8C] hover:bg-[#4a6b7a] text-sm">Apply</button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Reset Modal ───────────────────────────────────────────────────────────────
function ResetModal({ rooms, pendingResetChanges, onConfirm, onCancel }: {
  rooms: RoomData[]; pendingResetChanges: Record<string, Partial<RoomData>>; onConfirm: () => void; onCancel: () => void
}) {
  const changedRooms = rooms.filter(r => r.id in pendingResetChanges)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl p-7 max-w-sm w-full mx-4 border border-gray-100">
        <h2 className="text-base font-bold text-gray-900 mb-4">Confirm Reset</h2>
        {changedRooms.length === 0 ? (
          <p className="text-sm text-gray-500 mb-6">No pending changes.</p>
        ) : (
          <div className="space-y-2 mb-6">
            {changedRooms.map(room => {
              const pending = pendingResetChanges[room.id]
              return (
                <div key={room.id} className="bg-gray-50 rounded-lg px-4 py-2.5 text-sm">
                  <span className="font-medium text-gray-700 block mb-1.5">{room.name}</span>
                  {pending.isOn !== undefined && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <span>Room</span>
                      <span className={`px-1.5 py-0.5 rounded font-semibold ${room.isOn ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>{room.isOn ? 'ON' : 'OFF'}</span>
                      <span>→</span>
                      <span className={`px-1.5 py-0.5 rounded font-semibold ${pending.isOn ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>{pending.isOn ? 'ON' : 'OFF'}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 px-4 py-2.5 rounded-xl border-2 border-gray-200 text-gray-600 font-semibold text-sm">Cancel</button>
          {changedRooms.length > 0 && (
            <button onClick={onConfirm} className="flex-1 px-4 py-2.5 rounded-xl font-semibold text-white bg-[#5A7C8C] hover:bg-[#4a6b7a] text-sm">Confirm</button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function DeviceRoomsPage() {
  const router = useRouter()
  const params = useParams()
  const deviceId = params?.deviceId as string

  const { toasts, push: pushToast, dismiss: dismissToast } = useToast()

  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isAuto, setIsAuto] = useState(true)
  const lastModeChangeAt = useRef<number>(0)
  const [rooms, setRooms] = useState<RoomData[]>([])
  const [loading, setLoading] = useState(true)

  const [showWifi, setShowWifi] = useState(false)
  const [ssid, setSsid] = useState('')
  const [wifiPassword, setWifiPassword] = useState('')
  const [showWifiPassword, setShowWifiPassword] = useState(false)
  const [wifiLoading, setWifiLoading] = useState(false)
  const [wifiSaved, setWifiSaved] = useState(false)

  const [showModeConfirm, setShowModeConfirm] = useState(false)
  const [showManualDosing, setShowManualDosing] = useState(false)
  const [showReset, setShowReset] = useState(false)

  // Pending changes — relay1 = SOV (EMS) or Compressor (MLH), relay2 = Exhaust (EMS) or Cooling SOV (MLH)
  const [pendingRelay1, setPendingRelay1] = useState<Record<string, boolean>>({})
  const [pendingRelay2, setPendingRelay2] = useState<Record<string, boolean>>({})
  const [pendingResetChanges, setPendingResetChanges] = useState<Record<string, Partial<RoomData>>>({})
  const [enabledRooms, setEnabledRooms] = useState<Record<string, boolean>>({})

  const user = getUser()
  const canEditWifi = user?.role === 'owner' || user?.role === 'admin'
  const canEditRooms = user?.role === 'supervisor' ? false : (user?.role === 'sub-admin' ? !!user?.canEditRoom : true)

  // Detect device type
  const deviceType = getDeviceType(deviceId)
  const isMlh = deviceType.prefix === 'mlh'
  const relay1Label = isMlh ? 'Compressor' : 'SOV'
  const relay2Label = isMlh ? 'Cooling SOV' : 'Exhaust'

  useEffect(() => {
    const authStatus = localStorage.getItem('isAuthenticated')
    if (authStatus !== 'true') router.push('/')
    else setIsAuthenticated(true)
  }, [router])

  // Pre-fill WiFi when modal opens
  useEffect(() => {
    if (!showWifi) return
    const fetchWifi = async () => {
      try {
        const res = await fetch(`${API_BASE}/devices/${deviceId}/settings/wifi`)
        const data = await res.json()
        if (data.success && data.data?.wifi) {
          setSsid(data.data.wifi.ssid || '')
          setWifiPassword(data.data.wifi.password || '')
        }
      } catch {}
    }
    fetchWifi()
  }, [showWifi, deviceId])

  // Parse latest reading into rooms — handles both EMS and MLH shapes
  const applyReadingToRooms = (currentRooms: RoomData[], reading: Record<string, any>): RoomData[] => {
    return currentRooms.map(room => {
      const idx = room.id.replace('room-', '')
      const roomKey = `room${idx}`

      if (isMlh) {
        // MLH shape: { room1: { temp, humidity, compressor, sov }, ... }
        const r = reading[roomKey]
        if (!r) return room
        return { ...room, temp: r.temp ?? room.temp, humid: r.humidity ?? room.humid, compOn: r.compressor ?? room.compOn, sovOn: r.sov ?? room.sovOn }
      } else {
        // EMS nested shape: { room1: { temp, CO2, O2, c2h4 } }
        const r = reading[roomKey]
        if (r) return { ...room, temp: r.temp ?? room.temp, co2: r.CO2 ?? room.co2, humid: r.O2 ?? room.humid, c2h4: r.c2h4 ?? room.c2h4 }
        // EMS flat shape: { R1_temp, R1_CO2, ... }
        return {
          ...room,
          ...(reading[`R${idx}_temp`] !== undefined && { temp: reading[`R${idx}_temp`] }),
          ...(reading[`R${idx}_CO2`] !== undefined && { co2: reading[`R${idx}_CO2`] }),
          ...(reading[`R${idx}_O2`] !== undefined && { humid: reading[`R${idx}_O2`] }),
          ...(reading[`R${idx}_c2h4`] !== undefined && { c2h4: reading[`R${idx}_c2h4`] }),
        }
      }
    })
  }

  // Initial fetch
  useEffect(() => {
    if (!isAuthenticated || !deviceId) return
    const fetchState = async () => {
      try {
        const [stateRes, readingRes] = await Promise.all([
          fetch(`${API_BASE}/devices/${deviceId}/state`),
          fetch(`${API_BASE}/devices/${deviceId}/readings/latest`)
        ])
        const stateData = await stateRes.json()
        const readingData = await readingRes.json()

        let fetchedRooms: RoomData[] = []
        if (stateData.success) {
          fetchedRooms = stateData.data.rooms
          setIsAuto(stateData.data.mode === 'auto')
        }

        if (readingData.success && readingData.data?.reading) {
          fetchedRooms = applyReadingToRooms(fetchedRooms, readingData.data.reading)
        }

        // Fetch enabled rooms for MLH devices
        if (isMlh) {
          try {
            const erRes = await fetch(`${API_BASE}/devices/${deviceId}/settings/enabled-rooms`)
            const erData = await erRes.json()
            if (erData.success && erData.data?.enabledRooms) {
              setEnabledRooms(erData.data.enabledRooms)
            }
          } catch (_e) {}
        }

        // // ── TEMP MOCK DATA — remove once ESP32 sends real recipe status ──
        // fetchedRooms = fetchedRooms.map((room, i) => ({
        //   ...room,
        //   recipeName: i === 0 ? 'POTATO' : i === 1 ? 'TOMATO' : i === 2 ? 'BANANA' : null,
        //   recipeStep: i === 0 ? 2 : i === 1 ? 5 : i === 2 ? 1 : 0,
        //   recipeTotalSteps: i === 0 ? 10 : i === 1 ? 8 : i === 2 ? 5 : 0,
        //   recipeStepElapsedSec: i === 0 ? 5 * 3600 + 20 * 60 + 30 : i === 1 ? 45 * 60 : i === 2 ? 30 : 0,
        //   recipeStepDurationSec: i === 0 ? 96 * 3600 : i === 1 ? 4 * 3600 : i === 2 ? 24 * 3600 : 0,
        //   c2h4TriggerLow: 0.5,
        //   c2h4TriggerHigh: 2.5,
        //   co2TriggerLow: 800,
        //   co2TriggerHigh: 1500,
        // }))
        // // ── END MOCK ──

        setRooms(fetchedRooms)
      } catch (err) {
        console.error('Failed to fetch device state:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchState()
  }, [isAuthenticated, deviceId])

  // IoT WebSocket — real-time updates
  useIoT(
    [`devices/${deviceId}/readings`, `devices/${deviceId}/state`],
    useCallback(({ topic, payload }) => {
      if (topic.endsWith('/readings')) {
        // Live sensor data from device — pass through ALL sensor fields so
        // applyReadingToRooms() can map them (temp, CO2, O2, c2h4 for EMS;
        // temp, humidity, compressor, sov for MLH)
        if (payload.rooms) {
          const reading: Record<string, any> = {}
          payload.rooms.forEach((r: any) => {
            const idNum = typeof r.id === 'string'
              ? parseInt(r.id.replace('room-', ''), 10)
              : r.id
            // Strip the id, forward everything else as-is
            const { id: _drop, ...rest } = r
            reading[`room${idNum}`] = rest
          })
          setRooms(prev => applyReadingToRooms(prev, reading))
        }
      }
      if (topic.endsWith('/state')) {
        // Live relay state from device — merges SOV/Exh/Pump/HX/PF + any recipe fields
        if (payload.rooms) {
          setRooms(prev => prev.map(room => {
            const idx = room.id.replace('room-', '')
            // Match by id field (accepts "room-1", "1", or 1)
            const r = payload.rooms.find((x: any) => {
              const xid = typeof x.id === 'string' ? x.id.replace('room-', '') : String(x.id)
              return xid === idx
            })
            if (!r) return room
            return {
              ...room,
              ...(r.on        !== undefined && { isOn:   r.on }),
              ...(r.isOn      !== undefined && { isOn:   r.isOn }),
              ...(r.comp      !== undefined && { compOn: r.comp }),
              ...(r.compOn    !== undefined && { compOn: r.compOn }),
              ...(r.sov       !== undefined && { sovOn:  r.sov }),
              ...(r.sovOn     !== undefined && { sovOn:  r.sovOn }),
              ...(r.exh       !== undefined && { exhOn:  r.exh }),
              ...(r.exhOn     !== undefined && { exhOn:  r.exhOn }),
              ...(r.pump      !== undefined && { pumpOn: r.pump }),
              ...(r.pumpOn    !== undefined && { pumpOn: r.pumpOn }),
              ...(r.hxOn      !== undefined && { hxOn:   r.hxOn }),
              ...(r.pfOn      !== undefined && { pfOn:   r.pfOn }),
              // Recipe fields — pass through if present
              ...(r.recipeName           !== undefined && { recipeName: r.recipeName }),
              ...(r.recipeStep           !== undefined && { recipeStep: r.recipeStep }),
              ...(r.recipeTotalSteps     !== undefined && { recipeTotalSteps: r.recipeTotalSteps }),
              ...(r.recipeStepElapsedSec !== undefined && { recipeStepElapsedSec: r.recipeStepElapsedSec }),
              ...(r.recipeStepDurationSec!== undefined && { recipeStepDurationSec: r.recipeStepDurationSec }),
              ...(r.c2h4TriggerLow       !== undefined && { c2h4TriggerLow: r.c2h4TriggerLow }),
              ...(r.c2h4TriggerHigh      !== undefined && { c2h4TriggerHigh: r.c2h4TriggerHigh }),
              ...(r.co2TriggerLow        !== undefined && { co2TriggerLow: r.co2TriggerLow }),
              ...(r.co2TriggerHigh       !== undefined && { co2TriggerHigh: r.co2TriggerHigh }),
            }
          }))
        }
        // Ignore mode echoes for 5s after the user just toggled — prevents stale
        // device state from snapping the UI back. The firmware will eventually
        // publish the correct mode and at that point we accept it again.
        if (payload.mode && Date.now() - lastModeChangeAt.current > 2000) {
          setIsAuto(payload.mode === 'auto')
        }
      }
    }, [])
  )

  // Server update
  // Server update — always includes current mode so backend never has to guess
  const updateRoomsOnServer = async (updatedRooms: RoomData[]) => {
    try {
      await fetch(`${API_BASE}/devices/${deviceId}/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: isAuto ? 'auto' : 'manual', rooms: updatedRooms })
      })
    } catch {
      pushToast({ type: 'error', title: 'Sync Failed', message: 'Could not save changes.' })
    }
  }

  // Room click — toggle isOn in auto mode
  const handleRoomClick = (roomId: string) => {
    if (!isAuto || !canEditRooms) return
    const room = rooms.find(r => r.id === roomId)
    if (!room) return
    const cur = pendingResetChanges[roomId]?.isOn !== undefined ? pendingResetChanges[roomId].isOn! : room.isOn
    const next = !cur
    setPendingResetChanges(prev => {
      const updated = { ...prev, [roomId]: { ...(prev[roomId] ?? {}), isOn: next } }
      // If all overrides for this room match the server state, remove the entry entirely
      const orig = room
      const entry = updated[roomId]
      const isOnSame = entry.isOn === undefined || entry.isOn === orig.isOn
      const sovSame = entry.sovOn === undefined || entry.sovOn === orig.sovOn
      const exhSame = entry.exhOn === undefined || entry.exhOn === orig.exhOn
      const compSame = entry.compOn === undefined || entry.compOn === orig.compOn
      if (isOnSame && sovSame && exhSame && compSame) { const { [roomId]: _, ...rest } = updated; return rest }
      return updated
    })
  }

  // Relay 1 toggle (SOV for EMS, Compressor for MLH)
  const handleToggleRelay1 = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!canEditRooms) return
    if (!isAuto) {
      setPendingRelay1(prev => {
        const cur = id in prev ? prev[id] : (isMlh ? (rooms.find(r => r.id === id)?.compOn ?? false) : (rooms.find(r => r.id === id)?.sovOn ?? false))
        const next = !cur
        const orig = isMlh ? (rooms.find(r => r.id === id)?.compOn ?? false) : (rooms.find(r => r.id === id)?.sovOn ?? false)
        if (next === orig) { const { [id]: _, ...rest } = prev; return rest }
        return { ...prev, [id]: next }
      })
    } else {
      const room = rooms.find(r => r.id === id)
      if (!room) return
      const cur = pendingResetChanges[id]?.sovOn !== undefined ? pendingResetChanges[id].sovOn! : room.sovOn
      const next = !cur
      setPendingResetChanges(prev => {
        const updated = { ...prev, [id]: { ...(prev[id] ?? {}), sovOn: next } }
        const entry = updated[id]
        const isOnSame = entry.isOn === undefined || entry.isOn === room.isOn
        const sovSame = entry.sovOn === undefined || entry.sovOn === room.sovOn
        const exhSame = entry.exhOn === undefined || entry.exhOn === room.exhOn
        const compSame = entry.compOn === undefined || entry.compOn === room.compOn
        if (isOnSame && sovSame && exhSame && compSame) { const { [id]: _, ...rest } = updated; return rest }
        return updated
      })
    }
  }

  // Relay 2 toggle (Exhaust for EMS, Cooling SOV for MLH)
  const handleToggleRelay2 = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!canEditRooms) return
    if (!isAuto) {
      setPendingRelay2(prev => {
        const room = rooms.find(r => r.id === id)
        const cur = id in prev ? prev[id] : (isMlh ? (room?.sovOn ?? false) : (room?.exhOn ?? false))
        const next = !cur
        const orig = isMlh ? (room?.sovOn ?? false) : (room?.exhOn ?? false)
        if (next === orig) { const { [id]: _, ...rest } = prev; return rest }
        return { ...prev, [id]: next }
      })
    } else {
      const room = rooms.find(r => r.id === id)
      if (!room) return
      const cur = pendingResetChanges[id]?.exhOn !== undefined ? pendingResetChanges[id].exhOn! : room.exhOn
      const next = !cur
      setPendingResetChanges(prev => {
        const updated = { ...prev, [id]: { ...(prev[id] ?? {}), exhOn: next } }
        const entry = updated[id]
        const isOnSame = entry.isOn === undefined || entry.isOn === room.isOn
        const sovSame = entry.sovOn === undefined || entry.sovOn === room.sovOn
        const exhSame = entry.exhOn === undefined || entry.exhOn === room.exhOn
        const compSame = entry.compOn === undefined || entry.compOn === room.compOn
        if (isOnSame && sovSame && exhSame && compSame) { const { [id]: _, ...rest } = updated; return rest }
        return updated
      })
    }
  }

  const handleResetConfirm = async () => {
    setShowReset(false)
    if (Object.keys(pendingResetChanges).length === 0) return
    const updated = rooms.map(r => r.id in pendingResetChanges ? { ...r, ...pendingResetChanges[r.id] } : r)
    setRooms(updated); setPendingResetChanges({})
    await updateRoomsOnServer(updated)
    pushToast({ type: 'success', title: 'Changes Applied', message: 'Room settings saved.' })
  }

  const handleModeConfirm = async () => {
    setShowModeConfirm(false)
    const newMode = isAuto ? 'manual' : 'auto'
    lastModeChangeAt.current = Date.now()   // ignore device echoes for ~5s
    setIsAuto(!isAuto); setPendingRelay1({}); setPendingRelay2({}); setPendingResetChanges({})
    try {
      await fetch(`${API_BASE}/devices/${deviceId}/state`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: newMode })
      })
pushToast({ type: 'success', title: 'Mode Changed', message: `Switched to ${newMode === 'auto' ? 'Auto' : 'Manual'} mode.` })
      window.dispatchEvent(new CustomEvent('mechair-mode-change', { detail: { from: isAuto ? 'auto' : 'manual', to: newMode } }))
    } catch (_e) { pushToast({ type: 'error', title: 'Mode Change Failed', message: 'Please try again.' }); setIsAuto(isAuto) }
  }

  const handleManualDosingConfirm = async () => {
    setShowManualDosing(false)
    if (Object.keys(pendingRelay1).length === 0 && Object.keys(pendingRelay2).length === 0) return
    const updated = rooms.map(r => {
      const overrides: Partial<RoomData> = {}
      if (r.id in pendingRelay1) isMlh ? (overrides.compOn = pendingRelay1[r.id]) : (overrides.sovOn = pendingRelay1[r.id])
      if (r.id in pendingRelay2) isMlh ? (overrides.sovOn = pendingRelay2[r.id]) : (overrides.exhOn = pendingRelay2[r.id])
      return Object.keys(overrides).length > 0 ? { ...r, ...overrides } : r
    })
    setRooms(updated); setPendingRelay1({}); setPendingRelay2({})
    await updateRoomsOnServer(updated)
    pushToast({ type: 'success', title: 'Dosing Applied', message: 'Manual dosing settings saved.' })
  }

  // Display rooms with staged changes applied for preview
  const displayRooms = rooms.map(room => {
    if (!isAuto && (room.id in pendingRelay1 || room.id in pendingRelay2)) {
      const overrides: Partial<RoomData> = {}
      if (room.id in pendingRelay1) isMlh ? (overrides.compOn = pendingRelay1[room.id]) : (overrides.sovOn = pendingRelay1[room.id])
      if (room.id in pendingRelay2) isMlh ? (overrides.sovOn = pendingRelay2[room.id]) : (overrides.exhOn = pendingRelay2[room.id])
      return { ...room, ...overrides }
    }
    if (isAuto && room.id in pendingResetChanges) return { ...room, ...pendingResetChanges[room.id] }
    return room
  })

  const pendingManualCount = Object.keys(pendingRelay1).length + Object.keys(pendingRelay2).length
  const pendingResetCount = Object.keys(pendingResetChanges).length

  // Grid cols: EMS=2 cols (4 rooms), MLH=3 cols (6 rooms)
  const gridCols = isMlh ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1 md:grid-cols-2'

  if (!isAuthenticated || loading) {
    return <div className="h-full flex items-center justify-center"><div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-[#2B8DB8]" /></div>
  }

  return (
    <>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* WiFi Modal */}
      {showWifi && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div><h2 className="text-base font-semibold text-gray-800">WiFi Credentials</h2><p className="text-xs text-gray-400 mt-0.5">{deviceId}</p></div>
              <button onClick={() => setShowWifi(false)} className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">SSID</label>
                <input type="text" value={ssid} onChange={e => setSsid(e.target.value)} placeholder="Network name" autoComplete="new-password"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#2B8DB8]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
                <div className="relative">
                  <input type={showWifiPassword ? 'text' : 'password'} value={wifiPassword} onChange={e => setWifiPassword(e.target.value)} placeholder="WiFi password" autoComplete="new-password"
                    className="w-full px-4 py-2.5 pr-10 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#2B8DB8]" />
                  <button onClick={() => setShowWifiPassword(!showWifiPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={showWifiPassword ? "M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" : "M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"} />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-5 pt-0">
              <button onClick={() => setShowWifi(false)} className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50">Cancel</button>
              <button onClick={async () => {
                if (!ssid.trim()) return; setWifiLoading(true)
                try {
                  const res = await fetch(`${API_BASE}/devices/${deviceId}/settings/wifi`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ wifi: { ssid: ssid.trim(), password: wifiPassword } })
                  })
                  const data = await res.json()
                  if (data.success) {
                    setWifiSaved(true)
                    setTimeout(() => { setWifiSaved(false); setShowWifi(false) }, 1200)
                    pushToast({ type: 'success', title: 'WiFi Saved', message: 'Credentials pushed to device.' })
                  } else {
                    pushToast({ type: 'error', title: 'Save Failed', message: data.message || 'Unknown error' })
                  }
                } catch { pushToast({ type: 'error', title: 'Network Error', message: 'Failed to reach server.' }) } finally { setWifiLoading(false) }
              }} disabled={wifiLoading || !ssid.trim()} className="flex-1 px-4 py-2.5 bg-[#2B8DB8] text-white rounded-xl text-sm font-medium hover:bg-[#2478a0] disabled:opacity-50 flex items-center justify-center gap-2">
                {wifiSaved ? 'Saved ✓' : wifiLoading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showModeConfirm && (
        <ConfirmModal title="Change Mode"
          message={`Switch from ${isAuto ? 'Auto' : 'Manual'} to ${isAuto ? 'Manual' : 'Auto'} mode?`}
          confirmLabel={`Switch to ${isAuto ? 'Manual' : 'Auto'}`}
          confirmClassName={isAuto ? 'bg-amber-500 hover:bg-amber-600' : 'bg-[#5A7C8C] hover:bg-[#4a6b7a]'}
          onConfirm={handleModeConfirm} onCancel={() => setShowModeConfirm(false)} />
      )}

      {showManualDosing && (
        <ManualDosingModal rooms={rooms} pendingRelay1={pendingRelay1} pendingRelay2={pendingRelay2}
          relay1Label={relay1Label} relay2Label={relay2Label}
          onConfirm={handleManualDosingConfirm} onCancel={() => setShowManualDosing(false)} />
      )}

      {showReset && (
        <ResetModal rooms={rooms} pendingResetChanges={pendingResetChanges}
          onConfirm={handleResetConfirm} onCancel={() => setShowReset(false)} />
      )}

      <div>
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm mb-5 sm:mb-8">
          <button onClick={() => router.push('/dashboard')} className="text-gray-500 hover:text-gray-800">Home</button>
          <span className="text-gray-400">›</span>
          <span className="text-gray-800 font-semibold font-mono">{deviceId}</span>
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded text-white ml-1"
            style={{ backgroundColor: deviceType.color }}
          >
            {deviceType.shortLabel}
          </span>
        </div>

        {/* Control Bar */}
        <div className="flex items-center gap-2 sm:gap-4 mb-6 sm:mb-8 flex-wrap w-full">
          {canEditRooms && (
            <div className="relative">
              <button onClick={() => setShowReset(true)}
                className="px-4 sm:px-8 py-2.5 sm:py-4 bg-white border-2 border-[#5A7C8C] text-[#5A7C8C] rounded-xl sm:rounded-2xl font-semibold hover:bg-[#5A7C8C] hover:text-white transition-colors text-sm sm:text-lg">
                Reset
              </button>
              {isAuto && pendingResetCount > 0 && (
                <span className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center bg-amber-500 text-white text-xs font-bold rounded-full">{pendingResetCount}</span>
              )}
            </div>
          )}
          {canEditRooms && (
            <div className="relative">
              <button onClick={() => setShowManualDosing(true)}
                className={`px-4 sm:px-8 py-2.5 sm:py-4 rounded-xl sm:rounded-2xl font-semibold transition-colors text-sm sm:text-lg border-2 ${!isAuto ? 'bg-white border-[#5A7C8C] text-[#5A7C8C] hover:bg-[#5A7C8C] hover:text-white' : 'bg-white border-gray-200 text-gray-400 cursor-default'}`}>
                Manual Dosing
              </button>
              {!isAuto && pendingManualCount > 0 && (
                <span className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center bg-amber-500 text-white text-xs font-bold rounded-full">{pendingManualCount}</span>
              )}
            </div>
          )}
          <div className="flex items-center gap-2 sm:gap-3 ml-auto">
            {canEditWifi && (
              <button onClick={() => setShowWifi(true)}
                className="flex items-center gap-2 px-3 sm:px-5 py-2 sm:py-3 border-2 border-[#5A7C8C] text-[#5A7C8C] rounded-xl sm:rounded-2xl font-semibold hover:bg-[#5A7C8C] hover:text-white transition-colors text-sm sm:text-base">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
                </svg>
                WiFi
              </button>
            )}
            {canEditRooms ? (
              <button onClick={() => setShowModeConfirm(true)}
                className={`text-xs sm:text-sm font-semibold px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl border-2 whitespace-nowrap transition-colors ${isAuto ? 'border-[#5A7C8C] text-[#5A7C8C] hover:bg-[#5A7C8C] hover:text-white' : 'border-amber-500 text-amber-600 hover:bg-amber-500 hover:text-white'}`}>
                {isAuto ? 'Mode: Auto' : 'Mode: Manual'}
              </button>
            ) : (
              <span className={`text-xs sm:text-sm font-semibold px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl border-2 cursor-default whitespace-nowrap ${isAuto ? 'border-[#5A7C8C] text-[#5A7C8C]' : 'border-amber-500 text-amber-600'}`}>
                {isAuto ? 'Mode: Auto' : 'Mode: Manual'}
              </span>
            )}
          </div>
        </div>

        {/* Rooms Grid — EMS: 2 cols, MLH: 3 cols */}
        <div className={`grid ${gridCols} gap-4 sm:gap-6 max-w-6xl`}>
          {displayRooms.filter(room => {
            if (!isMlh || Object.keys(enabledRooms).length === 0) return true
            const roomKey = `Room ${room.id.replace('room-', '')}`
            const rKey = `r${room.id.replace('room-', '')}`
            return enabledRooms[roomKey] !== false && enabledRooms[rKey] !== false
          }).map(room => (
            <div key={room.id} onClick={() => handleRoomClick(room.id)} className={isAuto && canEditRooms ? 'cursor-pointer' : 'cursor-default'}>
              {isMlh ? (
                <MlhRoomCard room={room} isManual={!isAuto}
                  hasPendingComp={!isAuto && room.id in pendingRelay1}
                  hasPendingSov={!isAuto && room.id in pendingRelay2}
                  hasPendingChange={isAuto && room.id in pendingResetChanges}
                  onToggleComp={(e) => handleToggleRelay1(room.id, e)}
                  onToggleSov={(e) => handleToggleRelay2(room.id, e)} />
              ) : (
                <EmsRoomCard room={room} isManual={!isAuto}
                  hasPendingSov={!isAuto && room.id in pendingRelay1}
                  hasPendingExh={!isAuto && room.id in pendingRelay2}
                  hasPendingChange={isAuto && room.id in pendingResetChanges}
                  onToggleSov={(e) => handleToggleRelay1(room.id, e)}
                  onToggleExh={(e) => handleToggleRelay2(room.id, e)} />
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

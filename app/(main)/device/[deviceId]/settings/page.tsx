'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getUser, isSubAdmin, isSupervisor } from '@/utils/auth'
import AddSupervisorModal from '@/components/AddSupervisorModal'
import { getDeviceType } from '@/utils/deviceTypes'
import { useIoT } from '@/utils/useIoT'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://cpanel.backend.mechair.co.in/api'

// ─── Types ────────────────────────────────────────────────────────────────────
type TimeUnit = 'sec' | 'min' | 'hr'
interface TimingField { value: number; unit: TimeUnit }

// EMS types
type EmsTabType = 'timings' | 'manual' | 'pump' | 'recipes' | 'limits'
type EmsRoomType = string
interface EmsRoomSettings {
  c2h4TriggerDiff: number; co2Setpoint: number; co2TriggerDiff: number
  sovOnTime: TimingField; sovStartDelay: TimingField; exhaustFanOn: TimingField; exhaustFanOff: TimingField
}
interface EmsManualSettings { manualSovOnTime: TimingField; manualExhaustFanOnTime: TimingField }
interface EmsPumpSettings { pumpEnable: boolean; pumpOnTime: TimingField; pumpOffTime: TimingField }
interface RecipeStep { days: number; c2h4_ppm: number }
interface Recipe { id: string; name: string; steps: RecipeStep[] }

// MLH types
type MlhTabType = 'timings' | 'manual' | 'enabled-rooms'
type MlhRoomType = string
interface MlhRoomSettings {
  tempSetpoint: number; tempTriggerDiff: number
  humiditySetpoint: number; humidityTriggerDiff: number
}
interface MlhManualSettings { manualCompressorOnTime: TimingField; manualSovOnTime: TimingField }

// ─── Defaults ─────────────────────────────────────────────────────────────────
const defaultEmsSettings: EmsRoomSettings = {
  c2h4TriggerDiff: 0.5, co2Setpoint: 1000, co2TriggerDiff: 100,
  sovOnTime: { value: 30, unit: 'sec' }, sovStartDelay: { value: 0, unit: 'sec' },
  exhaustFanOn: { value: 45, unit: 'sec' }, exhaustFanOff: { value: 90, unit: 'sec' },
}
const defaultEmsManual: EmsManualSettings = {
  manualSovOnTime: { value: 15, unit: 'sec' }, manualExhaustFanOnTime: { value: 15, unit: 'sec' },
}
const defaultEmsPump: EmsPumpSettings = {
  pumpEnable: false, pumpOnTime: { value: 30, unit: 'sec' }, pumpOffTime: { value: 60, unit: 'sec' },
}
const defaultMlhSettings: MlhRoomSettings = {
  tempSetpoint: 4.0, tempTriggerDiff: 1.0, humiditySetpoint: 90.0, humidityTriggerDiff: 5.0,
}
const defaultMlhManual: MlhManualSettings = {
  manualCompressorOnTime: { value: 30, unit: 'sec' }, manualSovOnTime: { value: 15, unit: 'sec' },
}
const INITIAL_RECIPES: Recipe[] = [
  { id: 'potato', name: 'POTATO', steps: Array.from({ length: 10 }, (_, i) => ({ days: 3, c2h4_ppm: parseFloat(((i + 1) * 0.5).toFixed(1)) })) },
  { id: 'onion', name: 'ONION', steps: Array.from({ length: 5 }, (_, i) => ({ days: 3, c2h4_ppm: parseFloat(((i + 1) * 0.5).toFixed(1)) })) },
  { id: 'hffh', name: 'HFFH', steps: Array.from({ length: 7 }, (_, i) => ({ days: 3, c2h4_ppm: parseFloat(((i + 1) * 0.5).toFixed(1)) })) },
]
const EMS_ROOM_ID_MAP: Record<EmsRoomType, string> = { 'Room 1': 'room-1', 'Room 2': 'room-2', 'Room 3': 'room-3', 'Room 4': 'room-4' }
const DEFAULT_ROOM_ASSIGNMENTS: Record<EmsRoomType, string> = { 'Room 1': 'ONION', 'Room 2': 'POTATO', 'Room 3': 'POTATO', 'Room 4': 'POTATO' }

// ─── Icons ────────────────────────────────────────────────────────────────────
const SpinnerIcon = () => <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>
const CheckIcon = () => <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
const ChevronLeftIcon = () => <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>

// ─── API helpers ───────────────────────────────────────────────────────────────
async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`)
  return (await res.json()).data
}
async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`)
  return (await res.json()).data
}

// ─── Shared field components ───────────────────────────────────────────────────
function SetpointRow({ label, value, unit, step, onChange, readOnly }: {
  label: string; value: number; unit: string; step?: number; onChange: (v: string) => void; readOnly?: boolean
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
      <label className="text-gray-700 text-sm sm:text-base font-medium sm:w-48 sm:shrink-0">{label}</label>
      <div className="flex items-center gap-2">
        <input type="number" step={step ?? 1} value={value} onChange={e => onChange(e.target.value)} readOnly={readOnly} disabled={readOnly}
          className={`w-28 text-center text-lg font-semibold text-gray-800 border-2 border-[#2B8DB8] rounded-xl py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-[#2B8DB8]/40 bg-gray-50 ${readOnly ? 'opacity-70 cursor-not-allowed' : ''}`} />
        <span className="bg-[#2B8DB8] text-white text-sm font-bold px-4 py-2.5 rounded-xl min-w-[52px] text-center">{unit}</span>
      </div>
    </div>
  )
}

function TimingRow({ label, field, onChange, wide, readOnly }: {
  label: string; field: TimingField; onChange: (v: Partial<TimingField>) => void; wide?: boolean; readOnly?: boolean
}) {
  const [open, setOpen] = useState(false)
  const units: TimeUnit[] = ['sec', 'min', 'hr']
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
      <label className={`text-gray-700 text-sm sm:text-base font-medium sm:shrink-0 ${wide ? 'sm:w-56' : 'sm:w-48'}`}>{label}</label>
      <div className="flex items-center gap-2">
        <input type="number" min={0} value={field.value} onChange={e => onChange({ value: e.target.value === '' ? 0 : parseFloat(e.target.value) })} readOnly={readOnly} disabled={readOnly}
          className={`w-28 text-center text-lg font-semibold text-gray-800 border-2 border-[#2B8DB8] rounded-xl py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-[#2B8DB8]/40 bg-gray-50 ${readOnly ? 'opacity-70 cursor-not-allowed' : ''}`} />
        <div className="relative">
          <button type="button" onClick={() => !readOnly && setOpen(o => !o)} onBlur={() => setTimeout(() => setOpen(false), 150)} disabled={readOnly}
            className={`flex items-center gap-1.5 bg-[#2B8DB8] text-white text-sm font-bold pl-4 pr-3 py-2.5 rounded-xl min-w-[72px] justify-center ${readOnly ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}>
            {field.unit}
            <svg className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" /></svg>
          </button>
          {open && !readOnly && (
            <div className="absolute top-full left-0 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
              {units.map(u => (
                <button key={u} type="button" onMouseDown={() => { onChange({ unit: u }); setOpen(false) }}
                  className={`w-full text-center py-2 text-sm font-semibold transition-colors ${field.unit === u ? 'bg-[#2B8DB8] text-white' : 'text-gray-700 hover:bg-[#2B8DB8]/10'}`}>{u}</button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SaveButton({ saving, saved, onClick, disabled }: { saving: boolean; saved: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={saving || disabled}
      className={`flex items-center gap-2 px-10 py-3 rounded-xl text-white text-base font-semibold transition-all duration-200 shadow-md disabled:opacity-60 ${saved ? 'bg-[#2B8DB8] scale-95' : 'bg-[#7EC8E3] hover:bg-[#6ab8d6] active:scale-95'}`}>
      {saving ? <SpinnerIcon /> : <CheckIcon />}
      {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Settings'}
    </button>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// EMS SETTINGS TABS
// ═══════════════════════════════════════════════════════════════════════════════

function EmsTimingsTab({ activeRoom, deviceId, readOnly }: { activeRoom: EmsRoomType; deviceId: string; readOnly?: boolean }) {
  const roomCount = getDeviceType(deviceId).rooms
  const emsRooms: EmsRoomType[] = Array.from({ length: roomCount }, (_, i) => `Room ${i + 1}`)
  const [settings, setSettings] = useState<Record<EmsRoomType, EmsRoomSettings>>(Object.fromEntries(emsRooms.map(r => [r, { ...defaultEmsSettings }])) as Record<EmsRoomType, EmsRoomSettings>)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiGet<{ settings: Record<EmsRoomType, EmsRoomSettings> }>(`/devices/${deviceId}/settings/timings`)
      .then(data => { if (data?.settings) setSettings(prev => ({ ...prev, ...data.settings })) })
      .catch(() => setError('Failed to load timings.'))
      .finally(() => setLoading(false))
  }, [deviceId])

  // Live updates from device via IoT WebSocket
  useIoT(
    [`devices/${deviceId}/settings/timings`],
    useCallback(({ payload }) => {
      // Firmware publishes { "settings": { "Room 1": {...}, ... } }
      const incoming = payload?.settings ?? payload
      if (incoming && incoming['Room 1'] !== undefined) {
        setSettings(prev => {
          const updated = { ...prev }
          emsRooms.forEach(room => {
            if (incoming[room]) updated[room] = { ...prev[room], ...incoming[room] }
          })
          return updated
        })
      }
    }, [])
  )

  const cur = settings[activeRoom]
  const handleSave = async () => {
    try { setSaving(true); await apiPost(`/devices/${deviceId}/settings/timings`, { settings }); setSaved(true); setTimeout(() => setSaved(false), 2000) }
    catch { setError('Failed to save.') } finally { setSaving(false) }
  }

  if (loading) return <div className="flex items-center justify-center gap-3 py-12 text-gray-500"><SpinnerIcon /> Loading…</div>
  return (
    <div className="px-3 sm:px-8 py-4 sm:py-6">
      {error && <div className="mb-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">{error}</div>}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-5">
        <div className="space-y-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Setpoints</p>
          <SetpointRow label="C2H4 Trigger Diff:" value={cur.c2h4TriggerDiff} unit="ppm" step={0.1} readOnly={readOnly} onChange={v => setSettings(p => ({ ...p, [activeRoom]: { ...p[activeRoom], c2h4TriggerDiff: parseFloat(v) || 0 } }))} />
          <SetpointRow label="CO2 Setpoint:" value={cur.co2Setpoint} unit="ppm" readOnly={readOnly} onChange={v => setSettings(p => ({ ...p, [activeRoom]: { ...p[activeRoom], co2Setpoint: parseFloat(v) || 0 } }))} />
          <SetpointRow label="CO2 Trigger Diff:" value={cur.co2TriggerDiff} unit="ppm" readOnly={readOnly} onChange={v => setSettings(p => ({ ...p, [activeRoom]: { ...p[activeRoom], co2TriggerDiff: parseFloat(v) || 0 } }))} />
        </div>
        <div className="space-y-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Timings</p>
          <TimingRow label="SOV Start Delay:" field={cur.sovStartDelay} readOnly={readOnly} onChange={u => setSettings(p => ({ ...p, [activeRoom]: { ...p[activeRoom], sovStartDelay: { ...p[activeRoom].sovStartDelay, ...u } } }))} />
          <TimingRow label="SOV ON Time:" field={cur.sovOnTime} readOnly={readOnly} onChange={u => setSettings(p => ({ ...p, [activeRoom]: { ...p[activeRoom], sovOnTime: { ...p[activeRoom].sovOnTime, ...u } } }))} />
          <TimingRow label="Exhaust Fan ON:" field={cur.exhaustFanOn} readOnly={readOnly} onChange={u => setSettings(p => ({ ...p, [activeRoom]: { ...p[activeRoom], exhaustFanOn: { ...p[activeRoom].exhaustFanOn, ...u } } }))} />
          <TimingRow label="Exhaust Fan OFF:" field={cur.exhaustFanOff} readOnly={readOnly} onChange={u => setSettings(p => ({ ...p, [activeRoom]: { ...p[activeRoom], exhaustFanOff: { ...p[activeRoom].exhaustFanOff, ...u } } }))} />
        </div>
      </div>
      {!readOnly && <div className="pt-6"><SaveButton saving={saving} saved={saved} onClick={handleSave} /></div>}
    </div>
  )
}

function EmsManualTab({ activeRoom, deviceId, readOnly }: { activeRoom: EmsRoomType; deviceId: string; readOnly?: boolean }) {
  const roomCount = getDeviceType(deviceId).rooms
  const emsRooms: EmsRoomType[] = Array.from({ length: roomCount }, (_, i) => `Room ${i + 1}`)
  const [settings, setSettings] = useState<Record<EmsRoomType, EmsManualSettings>>(Object.fromEntries(emsRooms.map(r => [r, { ...defaultEmsManual }])) as Record<EmsRoomType, EmsManualSettings>)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    apiGet<{ manualSettings: Record<EmsRoomType, EmsManualSettings> }>(`/devices/${deviceId}/settings/manual-timings`)
      .then(data => { if (data?.manualSettings) setSettings(prev => ({ ...prev, ...data.manualSettings })) })
      .finally(() => setLoading(false))
  }, [deviceId])

  // Live updates from device via IoT WebSocket
  useIoT(
    [`devices/${deviceId}/settings/manual-timings`],
    useCallback(({ payload }) => {
      // Firmware publishes { "manualSettings": { "Room 1": {...}, ... } }
      const incoming = payload?.manualSettings ?? payload
      if (incoming && incoming['Room 1'] !== undefined) {
        setSettings(prev => {
          const updated = { ...prev }
          emsRooms.forEach(room => {
            if (incoming[room]) updated[room] = { ...prev[room], ...incoming[room] }
          })
          return updated
        })
      }
    }, [])
  )

  const cur = settings[activeRoom]
  const handleSave = async () => {
    try { setSaving(true); await apiPost(`/devices/${deviceId}/settings/manual-timings`, { manualSettings: settings }); setSaved(true); setTimeout(() => setSaved(false), 2000) }
    finally { setSaving(false) }
  }
  if (loading) return <div className="flex items-center justify-center gap-3 py-12 text-gray-500"><SpinnerIcon /> Loading…</div>
  return (
    <div className="px-3 sm:px-8 py-4 sm:py-6">
      <div className="space-y-5">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Manual Timings</p>
        <TimingRow label="Manual SOV ON Time:" field={cur.manualSovOnTime} wide readOnly={readOnly} onChange={u => setSettings(p => ({ ...p, [activeRoom]: { ...p[activeRoom], manualSovOnTime: { ...p[activeRoom].manualSovOnTime, ...u } } }))} />
        <TimingRow label="Manual Exhaust Fan ON:" field={cur.manualExhaustFanOnTime} wide readOnly={readOnly} onChange={u => setSettings(p => ({ ...p, [activeRoom]: { ...p[activeRoom], manualExhaustFanOnTime: { ...p[activeRoom].manualExhaustFanOnTime, ...u } } }))} />
      </div>
      {!readOnly && <div className="pt-6"><SaveButton saving={saving} saved={saved} onClick={handleSave} /></div>}
    </div>
  )
}

function EmsPumpTab({ activeRoom, deviceId, readOnly }: { activeRoom: EmsRoomType; deviceId: string; readOnly?: boolean }) {
  const roomCount = getDeviceType(deviceId).rooms
  const emsRooms: EmsRoomType[] = Array.from({ length: roomCount }, (_, i) => `Room ${i + 1}`)
  const [settings, setSettings] = useState<Record<EmsRoomType, EmsPumpSettings>>(Object.fromEntries(emsRooms.map(r => [r, { ...defaultEmsPump }])) as Record<EmsRoomType, EmsPumpSettings>)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    apiGet<{ pumpSettings: Record<EmsRoomType, EmsPumpSettings> }>(`/devices/${deviceId}/settings/pump`)
      .then(data => { if (data?.pumpSettings) setSettings(prev => ({ ...prev, ...data.pumpSettings })) })
      .finally(() => setLoading(false))
  }, [deviceId])

  // Live updates from device via IoT WebSocket
  useIoT(
    [`devices/${deviceId}/settings/pump`],
    useCallback(({ payload }) => {
      // Firmware publishes { "pumpSettings": { "Room 1": {...}, ... } }
      const incoming = payload?.pumpSettings ?? payload
      if (incoming && incoming['Room 1'] !== undefined) {
        setSettings(prev => {
          const updated = { ...prev }
          emsRooms.forEach(room => {
            if (incoming[room]) updated[room] = { ...prev[room], ...incoming[room] }
          })
          return updated
        })
      }
    }, [])
  )

  const cur = settings[activeRoom]
  const handleSave = async () => {
    try { setSaving(true); await apiPost(`/devices/${deviceId}/settings/pump`, { pumpSettings: settings }); setSaved(true); setTimeout(() => setSaved(false), 2000) }
    finally { setSaving(false) }
  }
  if (loading) return <div className="flex items-center justify-center gap-3 py-12 text-gray-500"><SpinnerIcon /> Loading…</div>
  return (
    <div className="px-3 sm:px-8 py-4 sm:py-6">
      <div className="space-y-5 max-w-md">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Pump Controls</p>
        <div className="flex items-center gap-3">
          <label className="text-gray-700 text-base font-medium w-48 shrink-0">Pump Enable:</label>
          <button onClick={() => !readOnly && setSettings(p => ({ ...p, [activeRoom]: { ...p[activeRoom], pumpEnable: !p[activeRoom].pumpEnable } }))} disabled={readOnly}
            className={`relative w-14 h-8 rounded-full transition-colors focus:outline-none ${readOnly ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'} ${cur.pumpEnable ? 'bg-[#5A7C8C]' : 'bg-gray-300'}`}>
            <span className={`absolute top-1 left-1 bg-white w-6 h-6 rounded-full transition-transform shadow-sm ${cur.pumpEnable ? 'translate-x-6' : 'translate-x-0'}`} />
          </button>
        </div>
        <TimingRow label="Pump ON Time:" field={cur.pumpOnTime} wide readOnly={readOnly} onChange={u => setSettings(p => ({ ...p, [activeRoom]: { ...p[activeRoom], pumpOnTime: { ...p[activeRoom].pumpOnTime, ...u } } }))} />
        <TimingRow label="Pump OFF Time:" field={cur.pumpOffTime} wide readOnly={readOnly} onChange={u => setSettings(p => ({ ...p, [activeRoom]: { ...p[activeRoom], pumpOffTime: { ...p[activeRoom].pumpOffTime, ...u } } }))} />
      </div>
      {!readOnly && <div className="pt-8"><SaveButton saving={saving} saved={saved} onClick={handleSave} /></div>}
    </div>
  )
}

function EmsRecipesTab({ deviceId, readOnly }: { deviceId: string; readOnly?: boolean }) {
  const roomCount = getDeviceType(deviceId).rooms
  const emsRooms: EmsRoomType[] = Array.from({ length: roomCount }, (_, i) => `Room ${i + 1}`)
  const [recipes, setRecipes] = useState<Recipe[]>(INITIAL_RECIPES)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [view, setView] = useState<'assignment' | 'select' | 'detail'>('assignment')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isNew, setIsNew] = useState(false)
const [assignments, setAssignments] = useState<Record<EmsRoomType, string>>(
    Object.fromEntries(emsRooms.map(r => [r, 'None'])) as Record<EmsRoomType, string>
  )
  useEffect(() => {
    Promise.all([
      apiGet<{ recipes: Recipe[] }>(`/devices/${deviceId}/recipes`),
      apiGet<{ assignments: Array<{ roomId: string; recipeId: string | null }> }>(`/devices/${deviceId}/room-recipe`)
    ]).then(([recData, assData]) => {
      const recipeList = recData?.recipes?.length ? recData.recipes : INITIAL_RECIPES
      if (recData?.recipes?.length) setRecipes(recData.recipes)
      // Lambda returns { assignments: [{roomId:"room-1", recipeId:"potato"}, ...] }
      if (Array.isArray(assData?.assignments)) {
        const mapped = { ...DEFAULT_ROOM_ASSIGNMENTS }
        assData.assignments.forEach(entry => {
          const roomEntry = Object.entries(EMS_ROOM_ID_MAP).find(([, id]) => id === entry.roomId)
          if (!roomEntry || !entry.recipeId) return
          const room = roomEntry[0] as EmsRoomType
          // Match by id OR name, case-insensitive (ESP32 sends lowercased name)
          const needle = String(entry.recipeId).toLowerCase()
          const match = recipeList.find(r =>
            r.id.toLowerCase() === needle || r.name.toLowerCase() === needle
          )
          if (match) mapped[room] = match.name
          else mapped[room] = 'None'
        })
        setAssignments(mapped)
      }
    }).finally(() => setLoading(false))
  }, [deviceId])

  // Live updates from device via IoT WebSocket — recipes catalog
  useIoT(
    [`devices/${deviceId}/recipes`],
    useCallback(({ payload }) => {
      // Firmware publishes { "recipes": [...] }
      const incoming = payload?.recipes
      if (Array.isArray(incoming) && incoming.length > 0) {
        setRecipes(incoming)
      }
    }, [])
  )

  // Live updates from device via IoT WebSocket — room recipe assignments
  useIoT(
    [`devices/${deviceId}/room-recipe`],
    useCallback(({ payload }) => {
      // Firmware publishes { "assignments": [{"roomId":"room-1","recipeId":"potato"},...] }
      const incoming = payload?.assignments
      if (Array.isArray(incoming)) {
        setAssignments(prev => {
          const mapped = { ...prev }
          incoming.forEach((entry: { roomId?: string; recipeId?: string | null }) => {
            const roomEntry = Object.entries(EMS_ROOM_ID_MAP).find(([, id]) => id === entry.roomId)
            if (!roomEntry) return
            const room = roomEntry[0] as EmsRoomType
            if (!entry.recipeId) {
              mapped[room] = 'None'
              return
            }
            // Match by id OR name, case-insensitive (ESP32 sends lowercased name)
            const needle = String(entry.recipeId).toLowerCase()
            const match = recipes.find(r =>
              r.id.toLowerCase() === needle || r.name.toLowerCase() === needle
            )
            mapped[room] = match ? match.name : 'None'
          })
          return mapped
        })
      }
    }, [recipes])
  )

  const persistRecipes = async (updated: Recipe[]) => {
    try { setSaving(true); await apiPost(`/devices/${deviceId}/recipes`, { recipes: updated }); setSaved(true); setTimeout(() => setSaved(false), 2000); return true }
    catch { return false } finally { setSaving(false) }
  }

  const saveAssignments = async () => {
    const payload = emsRooms.map(room => ({ roomId: EMS_ROOM_ID_MAP[room], recipeId: recipes.find(r => r.name === assignments[room])?.id ?? null }))
    try { setSaving(true); await apiPost(`/devices/${deviceId}/room-recipe`, { assignments: payload }); setSaved(true); setTimeout(() => setSaved(false), 2000) }
    finally { setSaving(false) }
  }

  if (loading) return <div className="flex items-center justify-center gap-3 py-12 text-gray-500"><SpinnerIcon /> Loading…</div>

  if (view === 'assignment') return (
    <div className="px-3 sm:px-8 py-4 sm:py-6 space-y-6">
      <div className="grid grid-cols-2 gap-x-10 gap-y-5">
        {emsRooms.map(room => (
          <div key={room}>
            <label className="text-sm font-semibold text-gray-700 block mb-1.5">{room}:</label>
            <select value={assignments[room]} onChange={e => !readOnly && setAssignments(p => ({ ...p, [room]: e.target.value }))} disabled={readOnly}
              className="w-full appearance-none rounded-xl border-2 border-[#2B8DB8] bg-gray-50 px-3 py-2.5 text-sm font-semibold text-gray-800 focus:outline-none">
              <option value="None">None</option>
              {recipes.map(r => <option key={r.id}>{r.name}</option>)}
            </select>
          </div>
        ))}
      </div>
      {!readOnly && (
        <div className="flex gap-3 flex-wrap">
          <button onClick={() => { setEditingId(null); setIsNew(true); setView('detail') }} className="flex items-center gap-2 rounded-xl bg-[#2B8DB8] px-5 py-2.5 text-sm font-semibold text-white">+ Add Recipe</button>
          <button onClick={() => setView('select')} className="flex items-center gap-2 rounded-xl bg-[#2B8DB8] px-5 py-2.5 text-sm font-semibold text-white">✏ Edit Recipe</button>
          <button onClick={saveAssignments} disabled={saving} className="flex items-center gap-2 rounded-xl bg-[#4CAF82] hover:bg-[#3d9e72] px-5 py-2.5 text-sm font-semibold text-white ml-auto disabled:opacity-60">
            {saving ? <SpinnerIcon /> : <CheckIcon />}{saving ? 'Saving…' : saved ? 'Saved!' : 'Save'}
          </button>
        </div>
      )}
    </div>
  )

  if (view === 'select') return (
    <div className="px-3 sm:px-8 py-4 sm:py-6 space-y-4">
      <h3 className="text-center text-lg font-bold text-gray-800">Select Recipe to Edit</h3>
      {recipes.map(r => <button key={r.id} onClick={() => { setEditingId(r.id); setIsNew(false); setView('detail') }} className="w-full rounded-xl bg-[#4A90D9] hover:bg-[#2B8DB8] px-5 py-3 text-sm font-semibold text-white text-left">{r.name} ({r.steps.length} steps)</button>)}
      <button onClick={() => setView('assignment')} className="flex items-center gap-1 rounded-xl bg-gray-400 hover:bg-gray-500 px-5 py-2.5 text-sm font-semibold text-white"><ChevronLeftIcon /> Back</button>
    </div>
  )

  const activeRecipe = editingId ? recipes.find(r => r.id === editingId) ?? { id: '', name: '', steps: [] } : { id: `recipe-${Date.now()}`, name: '', steps: [] }
  return (
    <div className="px-3 sm:px-8 py-4 sm:py-6">
      <RecipeDetail recipe={activeRecipe} isNew={isNew} saving={saving} saved={saved}
        onBack={() => setView(isNew ? 'assignment' : 'select')}
        onSave={async updated => {
          const next = recipes.find(r => r.id === updated.id) ? recipes.map(r => r.id === updated.id ? updated : r) : [...recipes, updated]
          if (await persistRecipes(next)) { setRecipes(next); setView('assignment') }
        }}
        onDelete={async id => {
          const next = recipes.filter(r => r.id !== id)
          if (await persistRecipes(next)) { setRecipes(next); setView('assignment') }
        }} />
    </div>
  )
}

function RecipeDetail({ recipe, isNew, saving, saved, onBack, onSave, onDelete }: {
  recipe: Recipe; isNew: boolean; saving: boolean; saved: boolean
  onBack: () => void; onSave: (r: Recipe) => void; onDelete: (id: string) => void
}) {
  const [name, setName] = useState(recipe.name)
  const [steps, setSteps] = useState<RecipeStep[]>(recipe.steps.length > 0 ? recipe.steps : [{ days: 3, c2h4_ppm: 0.5 }])
  const updateStep = (i: number, field: keyof RecipeStep, val: number) => setSteps(steps.map((s, idx) => idx === i ? { ...s, [field]: val } : s))
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input value={name} onChange={e => setName(e.target.value.toUpperCase())} placeholder="Recipe Name"
          className="rounded-xl border-2 border-[#2B8DB8] bg-gray-50 px-3 py-2 text-base font-bold text-gray-800 w-44 focus:outline-none" />
        <span className="text-sm font-semibold text-gray-500">Recipe — {steps.length} steps</span>
      </div>
      <div className="rounded-xl overflow-hidden border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[280px]">
          <thead><tr className="bg-[#4A90D9] text-white"><th className="py-2.5 px-4 text-center">Step</th><th className="py-2.5 px-4 text-center">Days</th><th className="py-2.5 px-4 text-center">C2H4 (ppm)</th><th className="py-2.5 px-3 w-10"></th></tr></thead>
          <tbody>
            {steps.map((step, i) => (
              <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="py-2 px-4 text-center font-semibold text-gray-700">{i === steps.length - 1 ? 'Final>' : i + 1}</td>
                <td className="py-2 px-4 text-center">{i === steps.length - 1 ? <span className="font-bold text-[#2B8DB8]">Final</span> : <input type="number" min={1} value={step.days} onChange={e => updateStep(i, 'days', Number(e.target.value))} className="w-16 text-center rounded-lg border-2 border-[#2B8DB8] px-2 py-1 text-sm font-semibold bg-gray-50 focus:outline-none" />}</td>
                <td className="py-2 px-4 text-center"><input type="number" min={0} step={0.1} value={step.c2h4_ppm} onChange={e => updateStep(i, 'c2h4_ppm', Number(e.target.value))} className="w-20 text-center rounded-lg border-2 border-[#2B8DB8] px-2 py-1 text-sm font-semibold bg-gray-50 focus:outline-none" /></td>
                <td className="py-2 px-3 text-center">{steps.length > 1 && <button onClick={() => setSteps(steps.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-600 font-bold text-xs">✕</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button onClick={() => steps.length < 10 && setSteps([...steps, { days: 3, c2h4_ppm: 0.5 }])} disabled={steps.length >= 10} className={`self-start text-sm font-semibold ${steps.length >= 10 ? 'text-gray-400' : 'text-[#4A90D9] hover:text-[#2B8DB8]'}`}>+ Add Step</button>
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={onBack} className="flex items-center gap-1 rounded-xl bg-gray-400 hover:bg-gray-500 px-5 py-2.5 text-sm font-semibold text-white"><ChevronLeftIcon /> Back</button>
        {!isNew && <button onClick={() => onDelete(recipe.id)} className="flex items-center gap-2 rounded-xl bg-red-500 hover:bg-red-600 px-5 py-2.5 text-sm font-semibold text-white">🗑 Delete</button>}
        <button onClick={() => onSave({ ...recipe, name, steps })} disabled={saving || !name.trim()} className="flex items-center gap-2 rounded-xl bg-[#4CAF82] hover:bg-[#3d9e72] px-5 py-2.5 text-sm font-semibold text-white ml-auto disabled:opacity-50">
          {saving ? <SpinnerIcon /> : <CheckIcon />}{saving ? 'Saving…' : saved ? 'Saved!' : 'Save'}
        </button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MLH SETTINGS TABS
// ═══════════════════════════════════════════════════════════════════════════════

function MlhTimingsTab({ activeRoom, deviceId, readOnly }: { activeRoom: MlhRoomType; deviceId: string; readOnly?: boolean }) {
  const mlhRooms: MlhRoomType[] = ['Room 1', 'Room 2', 'Room 3', 'Room 4', 'Room 5', 'Room 6']
  const [settings, setSettings] = useState<Record<MlhRoomType, MlhRoomSettings>>(Object.fromEntries(mlhRooms.map(r => [r, { ...defaultMlhSettings }])) as Record<MlhRoomType, MlhRoomSettings>)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiGet<{ settings: Record<MlhRoomType, MlhRoomSettings> }>(`/devices/${deviceId}/settings/timings`)
      .then(data => { if (data?.settings) setSettings(prev => ({ ...prev, ...data.settings })) })
      .catch(() => setError('Failed to load setpoints.'))
      .finally(() => setLoading(false))
  }, [deviceId])

  // Live updates from device via IoT WebSocket
  useIoT(
    [`devices/${deviceId}/settings/timings`],
    useCallback(({ payload }) => {
      if (payload['Room 1'] !== undefined) {
        setSettings(prev => {
          const updated = { ...prev }
          mlhRooms.forEach(room => {
            if (payload[room]) updated[room] = { ...prev[room], ...payload[room] }
          })
          return updated
        })
      }
    }, [])
  )

  const cur = settings[activeRoom]
  const handleSave = async () => {
    try { setSaving(true); await apiPost(`/devices/${deviceId}/settings/timings`, { settings }); setSaved(true); setTimeout(() => setSaved(false), 2000) }
    catch { setError('Failed to save.') } finally { setSaving(false) }
  }

  if (loading) return <div className="flex items-center justify-center gap-3 py-12 text-gray-500"><SpinnerIcon /> Loading…</div>
  return (
    <div className="px-3 sm:px-8 py-4 sm:py-6">
      {error && <div className="mb-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">{error}</div>}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-5">
        <div className="space-y-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Temperature</p>
          <SetpointRow label="Temp Setpoint:" value={cur.tempSetpoint} unit="°C" step={0.1} readOnly={readOnly} onChange={v => setSettings(p => ({ ...p, [activeRoom]: { ...p[activeRoom], tempSetpoint: parseFloat(v) || 0 } }))} />
          <SetpointRow label="Temp Trigger Diff:" value={cur.tempTriggerDiff} unit="°C" step={0.1} readOnly={readOnly} onChange={v => setSettings(p => ({ ...p, [activeRoom]: { ...p[activeRoom], tempTriggerDiff: parseFloat(v) || 0 } }))} />
        </div>
        <div className="space-y-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Humidity</p>
          <SetpointRow label="Humidity Setpoint:" value={cur.humiditySetpoint} unit="%" step={0.1} readOnly={readOnly} onChange={v => setSettings(p => ({ ...p, [activeRoom]: { ...p[activeRoom], humiditySetpoint: parseFloat(v) || 0 } }))} />
          <SetpointRow label="Humidity Trigger Diff:" value={cur.humidityTriggerDiff} unit="%" step={0.1} readOnly={readOnly} onChange={v => setSettings(p => ({ ...p, [activeRoom]: { ...p[activeRoom], humidityTriggerDiff: parseFloat(v) || 0 } }))} />
        </div>
      </div>
      {!readOnly && <div className="pt-6"><SaveButton saving={saving} saved={saved} onClick={handleSave} /></div>}
    </div>
  )
}

function MlhManualTab({ activeRoom, deviceId, readOnly }: { activeRoom: MlhRoomType; deviceId: string; readOnly?: boolean }) {
  const mlhRooms: MlhRoomType[] = ['Room 1', 'Room 2', 'Room 3', 'Room 4', 'Room 5', 'Room 6']
  const [settings, setSettings] = useState<Record<MlhRoomType, MlhManualSettings>>(Object.fromEntries(mlhRooms.map(r => [r, { ...defaultMlhManual }])) as Record<MlhRoomType, MlhManualSettings>)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    apiGet<{ manualSettings: Record<MlhRoomType, MlhManualSettings> }>(`/devices/${deviceId}/settings/manual-timings`)
      .then(data => { if (data?.manualSettings) setSettings(prev => ({ ...prev, ...data.manualSettings })) })
      .finally(() => setLoading(false))
  }, [deviceId])

  // Live updates from device via IoT WebSocket
  useIoT(
    [`devices/${deviceId}/settings/manual-timings`],
    useCallback(({ payload }) => {
      if (payload['Room 1'] !== undefined) {
        setSettings(prev => {
          const updated = { ...prev }
          mlhRooms.forEach(room => {
            if (payload[room]) {
              updated[room] = {
                ...prev[room],
                manualCompressorOnTime: payload[room].manualCompressorOnValue !== undefined
                  ? { value: payload[room].manualCompressorOnValue, unit: ['sec','min','hr'][payload[room].manualCompressorOnUnit ?? 0] as any }
                  : prev[room].manualCompressorOnTime,
                manualSovOnTime: payload[room].manualSovOnValue !== undefined
                  ? { value: payload[room].manualSovOnValue, unit: ['sec','min','hr'][payload[room].manualSovOnUnit ?? 0] as any }
                  : prev[room].manualSovOnTime,
              }
            }
          })
          return updated
        })
      }
    }, [])
  )

  const cur = settings[activeRoom]
  const handleSave = async () => {
    try { setSaving(true); await apiPost(`/devices/${deviceId}/settings/manual-timings`, { manualSettings: settings }); setSaved(true); setTimeout(() => setSaved(false), 2000) }
    finally { setSaving(false) }
  }
  if (loading) return <div className="flex items-center justify-center gap-3 py-12 text-gray-500"><SpinnerIcon /> Loading…</div>
  return (
    <div className="px-3 sm:px-8 py-4 sm:py-6 space-y-5">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Manual Timings</p>
      <TimingRow label="Manual Compressor ON:" field={cur.manualCompressorOnTime} wide readOnly={readOnly} onChange={u => setSettings(p => ({ ...p, [activeRoom]: { ...p[activeRoom], manualCompressorOnTime: { ...p[activeRoom].manualCompressorOnTime, ...u } } }))} />
      <TimingRow label="Manual SOV ON Time:" field={cur.manualSovOnTime} wide readOnly={readOnly} onChange={u => setSettings(p => ({ ...p, [activeRoom]: { ...p[activeRoom], manualSovOnTime: { ...p[activeRoom].manualSovOnTime, ...u } } }))} />
      {!readOnly && <div className="pt-6"><SaveButton saving={saving} saved={saved} onClick={handleSave} /></div>}
    </div>
  )
}

function MlhEnabledRoomsTab({ deviceId, readOnly }: { deviceId: string; readOnly?: boolean }) {
  const mlhRooms = ['Room 1', 'Room 2', 'Room 3', 'Room 4', 'Room 5', 'Room 6']
  const [enabled, setEnabled] = useState<Record<string, boolean>>(Object.fromEntries(mlhRooms.map(r => [r, true])))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    apiGet<{ enabledRooms: Record<string, boolean> }>(`/devices/${deviceId}/settings/enabled-rooms`)
      .then(data => { if (data?.enabledRooms) setEnabled(prev => ({ ...prev, ...data.enabledRooms })) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [deviceId])

  // Live updates from device via IoT WebSocket
  useIoT(
    [`devices/${deviceId}/settings/enabled-rooms`],
    useCallback(({ payload }) => {
      if (payload.r1 !== undefined) {
        setEnabled({
          'Room 1': payload.r1 ?? true,
          'Room 2': payload.r2 ?? true,
          'Room 3': payload.r3 ?? true,
          'Room 4': payload.r4 ?? true,
          'Room 5': payload.r5 ?? true,
          'Room 6': payload.r6 ?? true,
        })
      }
    }, [])
  )

  const handleSave = async () => {
    try { setSaving(true); await apiPost(`/devices/${deviceId}/settings/enabled-rooms`, { enabledRooms: enabled }); setSaved(true); setTimeout(() => setSaved(false), 2000) }
    finally { setSaving(false) }
  }

  if (loading) return <div className="flex items-center justify-center gap-3 py-12 text-gray-500"><SpinnerIcon /> Loading…</div>
  return (
    <div className="px-3 sm:px-8 py-4 sm:py-6">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-5">Enable / Disable Rooms</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-2xl">
        {mlhRooms.map(room => (
          <div key={room} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3 border border-gray-200">
            <span className="text-gray-700 font-medium text-sm">{room}</span>
            <button onClick={() => !readOnly && setEnabled(p => ({ ...p, [room]: !p[room] }))} disabled={readOnly}
              className={`relative w-12 h-7 rounded-full transition-colors focus:outline-none ${readOnly ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'} ${enabled[room] ? 'bg-emerald-600' : 'bg-gray-300'}`}>
              <span className={`absolute top-0.5 left-0.5 bg-white w-6 h-6 rounded-full transition-transform shadow-sm ${enabled[room] ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-400 mt-4">Changes sync to the physical display and ESP32 controller.</p>
      {!readOnly && <div className="pt-6"><SaveButton saving={saving} saved={saved} onClick={handleSave} /></div>}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// EMS EMAIL & HOOTER LIMITS TAB
// ═══════════════════════════════════════════════════════════════════════════════

interface EmailHooterLimits {
  // senderEmail: string
  recipientEmails: string[]
  emailCooldown: TimingField
  c2h4High: number
  c2h4Low: number
  co2High: number
  co2Low: number
  hooterOnTime: TimingField
  hooterCooldown: TimingField
}

const defaultEmailHooterLimits: EmailHooterLimits = {
  // senderEmail: '',
  recipientEmails: [],
  emailCooldown: { value: 30, unit: 'min' },
  c2h4High: 5.0,
  c2h4Low: 0.5,
  co2High: 2000,
  co2Low: 500,
  hooterOnTime: { value: 30, unit: 'sec' },
  hooterCooldown: { value: 5, unit: 'min' },
}

function EmsLimitsTab({ activeRoom, deviceId, readOnly }: { activeRoom: EmsRoomType; deviceId: string; readOnly?: boolean }) {
  const roomCount = getDeviceType(deviceId).rooms
  const emsRooms: EmsRoomType[] = Array.from({ length: roomCount }, (_, i) => `Room ${i + 1}`)
  const [settings, setSettings] = useState<Record<EmsRoomType, EmailHooterLimits>>(
    Object.fromEntries(emsRooms.map(r => [r, { ...defaultEmailHooterLimits, recipientEmails: [] }])) as Record<EmsRoomType, EmailHooterLimits>
  )
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newEmail, setNewEmail] = useState('')

  useEffect(() => {
    apiGet<{ limits: Record<EmsRoomType, EmailHooterLimits> }>(`/devices/${deviceId}/settings/email-hooter-limits`)
      .then(data => { if (data?.limits) setSettings(prev => ({ ...prev, ...Object.fromEntries(Object.entries(data.limits).map(([k, v]) => [k, { ...defaultEmailHooterLimits, ...v }])) })) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [deviceId])

  const cur = settings[activeRoom]
  const update = (patch: Partial<EmailHooterLimits>) => setSettings(p => ({ ...p, [activeRoom]: { ...p[activeRoom], ...patch } }))

  const addEmail = () => {
    const trimmed = newEmail.trim().toLowerCase()
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return
    if (cur.recipientEmails.includes(trimmed)) return
    update({ recipientEmails: [...cur.recipientEmails, trimmed] })
    setNewEmail('')
  }
  const removeEmail = (email: string) => update({ recipientEmails: cur.recipientEmails.filter(e => e !== email) })

  const handleSave = async () => {
    try { setSaving(true); await apiPost(`/devices/${deviceId}/settings/email-hooter-limits`, { limits: settings }); setSaved(true); setTimeout(() => setSaved(false), 2000) }
    catch { setError('Failed to save.') } finally { setSaving(false) }
  }

  if (loading) return <div className="flex items-center justify-center gap-3 py-12 text-gray-500"><SpinnerIcon /> Loading…</div>

  return (
    <div className="px-3 sm:px-8 py-4 sm:py-6">
      {error && <div className="mb-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-6">
        {/* ── Left: Email Settings ── */}
        <div className="space-y-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Email Settings</p>

          /* {/* Sender Email */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
            <label className="text-gray-700 text-sm sm:text-base font-medium sm:w-48 sm:shrink-0">Sender Email:</label>
            <input type="email" value={cur.senderEmail} onChange={e => !readOnly && update({ senderEmail: e.target.value })} readOnly={readOnly} disabled={readOnly} placeholder="alerts@mechair.co.in"
              className={`flex-1 text-sm font-semibold text-gray-800 border-2 border-[#2B8DB8] rounded-xl py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-[#2B8DB8]/40 bg-gray-50 ${readOnly ? 'opacity-70 cursor-not-allowed' : ''}`} />
          </div> */

          {/* Recipient Emails */}
          <div className="space-y-2">
            <label className="text-gray-700 text-sm sm:text-base font-medium">Recipient Emails:</label>
            <div className="flex gap-2">
              <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} readOnly={readOnly} disabled={readOnly} placeholder="user@example.com"
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addEmail())}
                className={`flex-1 text-sm font-semibold text-gray-800 border-2 border-[#2B8DB8] rounded-xl py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-[#2B8DB8]/40 bg-gray-50 ${readOnly ? 'opacity-70 cursor-not-allowed' : ''}`} />
              {!readOnly && (
                <button onClick={addEmail} className="px-4 py-2.5 bg-[#2B8DB8] text-white text-sm font-bold rounded-xl hover:bg-[#247a9e] transition-colors">+ Add</button>
              )}
            </div>
            {cur.recipientEmails.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {cur.recipientEmails.map(email => (
                  <span key={email} className="inline-flex items-center gap-1.5 bg-[#2B8DB8]/10 text-[#2B8DB8] text-sm font-semibold px-3 py-1.5 rounded-full">
                    {email}
                    {!readOnly && (
                      <button onClick={() => removeEmail(email)} className="text-[#2B8DB8] hover:text-red-500 font-bold text-xs leading-none">✕</button>
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Email Cooldown */}
          <TimingRow label="Email Cooldown:" field={cur.emailCooldown} readOnly={readOnly}
            onChange={u => update({ emailCooldown: { ...cur.emailCooldown, ...u } })} />
        </div>

        {/* ── Right: Gas Limits ── */}
        <div className="space-y-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">C₂H₄ Limits</p>
          <SetpointRow label="C₂H₄ High Limit:" value={cur.c2h4High} unit="ppm" step={0.1} readOnly={readOnly} onChange={v => update({ c2h4High: parseFloat(v) || 0 })} />
          <SetpointRow label="C₂H₄ Low Limit:" value={cur.c2h4Low} unit="ppm" step={0.1} readOnly={readOnly} onChange={v => update({ c2h4Low: parseFloat(v) || 0 })} />

          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest pt-3">CO₂ Limits</p>
          <SetpointRow label="CO₂ High Limit:" value={cur.co2High} unit="ppm" readOnly={readOnly} onChange={v => update({ co2High: parseFloat(v) || 0 })} />
          <SetpointRow label="CO₂ Low Limit:" value={cur.co2Low} unit="ppm" readOnly={readOnly} onChange={v => update({ co2Low: parseFloat(v) || 0 })} />
        </div>
      </div>

      {/* ── Bottom: Hooter Settings ── */}
      <div className="mt-8 pt-6 border-t border-gray-200">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-5">Hooter Settings</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-5 max-w-3xl">
          <TimingRow label="Hooter ON Time:" field={cur.hooterOnTime} readOnly={readOnly}
            onChange={u => update({ hooterOnTime: { ...cur.hooterOnTime, ...u } })} />
          <TimingRow label="Hooter Cooldown:" field={cur.hooterCooldown} readOnly={readOnly}
            onChange={u => update({ hooterCooldown: { ...cur.hooterCooldown, ...u } })} />
        </div>
      </div>

      {!readOnly && <div className="pt-6"><SaveButton saving={saving} saved={saved} onClick={handleSave} /></div>}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
export default function SettingsPage() {
  const params = useParams()
  const deviceId = params?.deviceId as string

  const deviceType = getDeviceType(deviceId)
  const isMlh = deviceType.prefix === 'mlh'

  // Tab state — EMS or MLH
  const [activeEmsTab, setActiveEmsTab] = useState<EmsTabType>('timings')
  const [activeMlhTab, setActiveMlhTab] = useState<MlhTabType>('timings')

  // Room state — dynamic based on device ID
  const roomCount = deviceType.rooms
  const emsRooms: EmsRoomType[] = Array.from({ length: roomCount }, (_, i) => `Room ${i + 1}`)
  const mlhRooms: MlhRoomType[] = Array.from({ length: roomCount }, (_, i) => `Room ${i + 1}`)
  const [activeEmsRoom, setActiveEmsRoom] = useState<EmsRoomType>('Room 1')
  const [activeMlhRoom, setActiveMlhRoom] = useState<MlhRoomType>('Room 1')

  const [readOnly, setReadOnly] = useState(false)
  const [showAddSupervisor, setShowAddSupervisor] = useState(false)
  const [showSupervisorModal, setShowSupervisorModal] = useState(false)

  useEffect(() => {
    setReadOnly(isSupervisor())
    setShowAddSupervisor(isSubAdmin())
  }, [])

  // Tab definitions
  const emsTabs: { key: EmsTabType; label: string; short: string }[] = [
    { key: 'timings', label: 'Timings & Setpoint', short: 'Timings' },
    { key: 'manual', label: 'Manual Timings', short: 'Manual' },
    { key: 'pump', label: 'Pump Settings', short: 'Pump' },
    { key: 'recipes', label: 'Recipes', short: 'Recipes' },
    { key: 'limits', label: 'Email & Hooter Limits', short: 'Limits' },
  ]
  const mlhTabs: { key: MlhTabType; label: string; short: string }[] = [
    { key: 'timings', label: 'Setpoint & Timings', short: 'Setpoints' },
    { key: 'manual', label: 'Manual Settings', short: 'Manual' },
    { key: 'enabled-rooms', label: 'Enable Rooms', short: 'Rooms' },
  ]

  const activeTabs = isMlh ? mlhTabs : emsTabs
  const activeTabKey = isMlh ? activeMlhTab : activeEmsTab
  const setActiveTab = isMlh ? (k: any) => setActiveMlhTab(k) : (k: any) => setActiveEmsTab(k)
  const activeRooms = isMlh ? mlhRooms : emsRooms
  const activeRoom = isMlh ? activeMlhRoom : activeEmsRoom
  const setActiveRoom = isMlh ? (r: any) => setActiveMlhRoom(r) : (r: any) => setActiveEmsRoom(r)
  const showRoomTabs = isMlh ? activeMlhTab !== 'enabled-rooms' : activeEmsTab !== 'recipes'

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6 sm:mb-8 flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">Settings</h2>
          <p className="text-gray-600">
            Configure settings for{' '}
            <span className="font-semibold font-mono">{deviceId}</span>
            {' — '}
            <span className="font-semibold" style={{ color: deviceType.color }}>{deviceType.label}</span>
          </p>
        </div>
        {showAddSupervisor && (
          <button onClick={() => setShowSupervisorModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#5A7C8C] text-white rounded-xl text-sm font-medium hover:bg-[#4a6c7c] transition-colors shadow-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
            Add Supervisor
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-md overflow-hidden">
        {/* Tab bar */}
        <div className="flex items-center px-2 sm:px-4 py-3" style={{ backgroundColor: isMlh ? '#2D7D46' : '#2B8DB8' }}>
          <div className="relative flex bg-white/20 rounded-full p-1 w-full">
            <div className="absolute top-1 bottom-1 rounded-full bg-white shadow-md transition-all duration-300"
              style={{ width: `calc((100% - 8px) / ${activeTabs.length})`, transform: `translateX(calc(${activeTabs.findIndex(t => t.key === activeTabKey)} * 100%))` }} />
            {activeTabs.map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={`relative z-10 flex-1 py-2 sm:py-2.5 text-[10px] sm:text-sm font-semibold transition-colors duration-300 flex items-center justify-center rounded-full px-1 sm:px-3 leading-tight text-center ${activeTabKey === tab.key ? (isMlh ? 'text-emerald-700' : 'text-[#2B8DB8]') : 'text-white hover:text-white/80'}`}>
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.short}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Room tabs */}
        {showRoomTabs && (
          <div className="flex gap-2 sm:gap-3 px-3 sm:px-6 pt-4 sm:pt-5 pb-2 overflow-x-auto">
            {activeRooms.map(room => (
              <button key={room} onClick={() => setActiveRoom(room)}
                className={`px-4 sm:px-6 py-2 rounded-full text-sm font-semibold transition-all whitespace-nowrap flex-shrink-0 ${activeRoom === room ? 'text-white shadow-md' : 'text-white hover:opacity-80'}`}
                style={{ backgroundColor: activeRoom === room ? (isMlh ? '#60a878' : '#7EC8E3') : (isMlh ? '#2D7D46' : '#2B8DB8') }}>
                {room}
              </button>
            ))}
          </div>
        )}

        {/* EMS tab content */}
        {!isMlh && activeEmsTab === 'timings' && <EmsTimingsTab activeRoom={activeEmsRoom} deviceId={deviceId} readOnly={readOnly} />}
        {!isMlh && activeEmsTab === 'manual' && <EmsManualTab key={`manual-${activeEmsRoom}`} activeRoom={activeEmsRoom} deviceId={deviceId} readOnly={readOnly} />}
        {!isMlh && activeEmsTab === 'pump' && <EmsPumpTab key={`pump-${activeEmsRoom}`} activeRoom={activeEmsRoom} deviceId={deviceId} readOnly={readOnly} />}
        {!isMlh && activeEmsTab === 'recipes' && <EmsRecipesTab deviceId={deviceId} readOnly={readOnly} />}
        {!isMlh && activeEmsTab === 'limits' && <EmsLimitsTab activeRoom={activeEmsRoom} deviceId={deviceId} readOnly={readOnly} />}

        {/* MLH tab content */}
        {isMlh && activeMlhTab === 'timings' && <MlhTimingsTab activeRoom={activeMlhRoom} deviceId={deviceId} readOnly={readOnly} />}
        {isMlh && activeMlhTab === 'manual' && <MlhManualTab key={`mlh-manual-${activeMlhRoom}`} activeRoom={activeMlhRoom} deviceId={deviceId} readOnly={readOnly} />}
        {isMlh && activeMlhTab === 'enabled-rooms' && <MlhEnabledRoomsTab deviceId={deviceId} readOnly={readOnly} />}
      </div>

      <div className="border-t border-gray-200 mt-12 py-6">
        <p className="text-center text-gray-500 text-sm">© 2026 Mech Air. All rights reserved.</p>
      </div>

      {showSupervisorModal && <AddSupervisorModal deviceId={deviceId} onClose={() => setShowSupervisorModal(false)} />}
    </div>
  )
}

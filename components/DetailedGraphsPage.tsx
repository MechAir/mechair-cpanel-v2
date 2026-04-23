'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import ReportModal from '@/components/ReportModal'
import { getDeviceType } from '@/utils/deviceTypes'
import { useIoT } from '@/utils/useIoT'

const POLL_INTERVAL_MS = 10000
const LIVE_WINDOW_MS = 15 * 60 * 1000  // 15-minute rolling window for live mode
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://cpanel.backend.mechair.co.in/api'

const ROOM_PREFIX: Record<string, string> = Object.fromEntries(
  Array.from({ length: 20 }, (_, i) => [String(i + 1), `R${i + 1}`])
)

interface ApiReading { [key: string]: number }

interface RangeReading {
  timestamp: string
  triggerco2?: boolean
  triggerc2h4?: boolean
  room1: { temp: number; CO2: number; O2: number; c2h4: number }
  room2: { temp: number; CO2: number; O2: number; c2h4: number }
  room3: { temp: number; CO2: number; O2: number; c2h4: number }
  room4: { temp: number; CO2: number; O2: number; c2h4: number }
}

const METRIC_META = {
  temp: { unit: '°C', label: 'Temperature', color: '#2563EB', triggerColor: '#EF4444', decimals: 1 },
  CO2: { unit: 'ppm', label: 'Carbon Dioxide (CO₂)', color: '#1E3A8A', triggerColor: '#F97316', decimals: 0 },
  O2: { unit: '%', label: 'Humidity', color: '#818CF8', triggerColor: '#EF4444', decimals: 2 },
  C2H4: { unit: 'ppm', label: 'Ethylene (C₂H₄)', color: '#10B981', triggerColor: '#EF4444', decimals: 2 },
} as const

// MLH overrides — humidity replaces CO2 label, O2/C2H4 not shown
const MLH_METRIC_META = {
  temp: { unit: '°C', label: 'Temperature', color: '#2563EB', triggerColor: '#EF4444', decimals: 1 },
  CO2: { unit: '%', label: 'Humidity', color: '#0891b2', triggerColor: '#EF4444', decimals: 1 },
  O2: { unit: '%', label: 'O₂', color: '#818CF8', triggerColor: '#EF4444', decimals: 2 },
  C2H4: { unit: 'ppm', label: 'C₂H₄', color: '#10B981', triggerColor: '#EF4444', decimals: 2 },
} as const

type MetricKey = keyof typeof METRIC_META
type RangeMode = 'live' | 'last_hour' | '6h' | '1d' | '1w' | 'month' | 'custom'

interface TimeRange {
  mode: RangeMode
  customFrom?: string
  customTo?: string
}

const RANGE_OPTIONS: { key: RangeMode; label: string }[] = [
  { key: 'live', label: 'Live' },
  { key: 'last_hour', label: 'Last 1 Hour' },
  { key: '6h', label: 'Last 6 Hours' },
  { key: '1d', label: 'Last 24 Hours' },
  { key: '1w', label: 'Last 7 Days' },
  { key: 'month', label: 'Last 1 Month' },
  { key: 'custom', label: '📅 Custom Range' },
]

function RangeDropdown({ value, onChange }: {
  value: TimeRange
  onChange: (r: TimeRange) => void
}) {
  const [open, setOpen] = useState(false)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({})

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  useEffect(() => {
    if (!open || !ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const isMobile = window.innerWidth < 640
    if (isMobile) {
      setDropdownStyle({
        position: 'fixed',
        top: rect.bottom + 4,
        left: 8,
        right: 8,
        width: 'auto',
      })
    } else {
      setDropdownStyle({
        position: 'absolute',
        top: '100%',
        right: 0,
        marginTop: 4,
        width: 224,
      })
    }
  }, [open])

  const selected = RANGE_OPTIONS.find(r => r.key === value.mode)!

  const applyCustom = () => {
    if (!customFrom || !customTo) return
    onChange({ mode: 'custom', customFrom: new Date(customFrom).toISOString(), customTo: new Date(customTo).toISOString() })
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => {
          if (!open && ref.current) {
            const rect = ref.current.getBoundingClientRect()
            const isMobile = window.innerWidth < 640
            if (isMobile) {
              setDropdownStyle({
                position: 'fixed',
                top: rect.bottom + 4,
                left: 8,
                right: 8,
                width: 'auto',
              })
            } else {
              setDropdownStyle({
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: 4,
                width: 224,
              })
            }
          }
          setOpen(o => !o)
        }}
        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl
                   text-sm font-semibold text-gray-700 hover:border-[#2B8DB8] hover:text-[#2B8DB8]
                   transition-colors shadow-sm min-w-[160px] justify-between"
      >
        <span>{selected.label}</span>
        <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          style={dropdownStyle}
          className="bg-white border border-gray-100 rounded-xl shadow-xl z-[9999] overflow-y-auto max-h-[70vh] py-1"
        >
          {RANGE_OPTIONS.map(opt => (
            <button
              key={opt.key}
              onClick={() => { if (opt.key !== 'custom') { onChange({ mode: opt.key }); setOpen(false) } }}
              className={`w-full text-left px-4 py-2.5 text-sm transition-colors
                ${value.mode === opt.key ? 'bg-[#EBF5FB] text-[#2B8DB8] font-semibold' : 'text-gray-700 hover:bg-gray-50'}`}
            >
              {opt.label}
            </button>
          ))}
          <div className="px-4 py-3 border-t border-gray-100 space-y-2">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Custom Range</p>
            <div>
              <label className="text-[10px] text-gray-400 block mb-0.5">From</label>
              <input type="datetime-local" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#2B8DB8]" />
            </div>
            <div>
              <label className="text-[10px] text-gray-400 block mb-0.5">To</label>
              <input type="datetime-local" value={customTo} onChange={e => setCustomTo(e.target.value)}
                className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#2B8DB8]" />
            </div>
            <button onClick={applyCustom}
              className="w-full py-1.5 bg-[#2B8DB8] text-white text-xs font-semibold rounded-lg hover:bg-[#2478a0] transition-colors">
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function extractMetric(reading: RangeReading, roomKey: string, metricKey: MetricKey): number {
  const roomIndex = parseInt(roomKey.replace('R', ''), 10) - 1
  const roomName = `room${roomIndex + 1}` as keyof RangeReading
  const room = reading[roomName] as any
  if (!room) return 0
  if (metricKey === 'temp') return isFinite(room.temp) ? room.temp : 0
  if (metricKey === 'CO2') return isFinite(room.CO2) ? room.CO2 : (isFinite(room.humidity) ? room.humidity : 0)
  if (metricKey === 'O2') return isFinite(room.O2) ? room.O2 : 0
  if (metricKey === 'C2H4') return isFinite(room.c2h4) ? room.c2h4 : 0
  return 0
}

function formatLabel(ts: string, mode: RangeMode): string {
  const d = new Date(ts)
  if (mode === 'live' || mode === 'last_hour' || mode === '6h')
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  if (mode === 'month' || mode === '1w' || mode === '1d')
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function getRange(data: number[]): { lo: number; hi: number } {
  const valid = data.filter(v => isFinite(v))
  if (!valid.length) return { lo: 0, hi: 1 }
  const lo = Math.min(...valid), hi = Math.max(...valid)
  const spread = hi - lo
  const pad = spread < 1e-6 ? (Math.abs(lo) * 0.1 || 1) : spread * 0.3
  return { lo: lo - pad, hi: hi + pad }
}

function useSize(ref: React.RefObject<HTMLDivElement>) {
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      setSize({ w: Math.round(width), h: Math.round(height) })
    })
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [ref])
  return size
}

function NoData({ color }: { color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8, opacity: 0.5 }}>
      <svg width={36} height={36} viewBox="0 0 36 36" fill="none">
        <circle cx={18} cy={18} r={17} stroke={color} strokeWidth={1.5} strokeDasharray="4 3" />
        <path d="M12 18h12M18 12v12" stroke={color} strokeWidth={1.5} strokeLinecap="round" opacity={0.4} />
      </svg>
      <span style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600 }}>No data for this range</span>
    </div>
  )
}

// ── SegmentedLine ─────────────────────────────────────────────────────────────
// FIX 3: xOf/yOf clamp dots 6px from SVG edge so they never bleed outside
const DOT_PAD = 6
function SegmentedLine({
  data, triggers, lo, hi, W, H, baseColor, triggerColor,
  hoverIdx, onHoverChange, timestamps, relayIntervals,
  onEventHover,
}: {
  data: number[]
  triggers: boolean[]
  lo: number; hi: number
  W: number; H: number
  baseColor: string
  triggerColor: string
  hoverIdx: number | null
  onHoverChange: (i: number | null) => void
  timestamps?: number[]             // ms epoch per data point
  relayIntervals?: RelayInterval[]  // exact ON/OFF event intervals
  onEventHover?: (info: { x: number; label: string } | null) => void
}) {
  if (data.length < 2 || W === 0 || H === 0) return null

  // FIX 3: clamp so edge dots stay inside SVG bounds
  const xOf = (i: number) => Math.max(DOT_PAD, Math.min(W - DOT_PAD, (i / (data.length - 1)) * W))
  const yOf = (v: number) => Math.max(DOT_PAD, Math.min(H - DOT_PAD, H - ((v - lo) / (hi - lo)) * H))

  // Time-based x mapping for event intervals
  const tStart = timestamps && timestamps.length >= 2 ? timestamps[0] : 0
  const tEnd = timestamps && timestamps.length >= 2 ? timestamps[timestamps.length - 1] : 1
  const tSpan = tEnd - tStart || 1
  const xOfTime = (t: number) => Math.max(DOT_PAD, Math.min(W - DOT_PAD, ((t - tStart) / tSpan) * W))

  const linePts = data.map((v, i) => `${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' L')
  const areaD = `M${linePts} L${xOf(data.length - 1)},${H} L0,${H} Z`

  // Use time-accurate relay intervals if available, otherwise fall back to boolean bands
  const hasIntervals = relayIntervals && relayIntervals.length > 0 && timestamps && timestamps.length >= 2

  return (
    <>
      <path d={areaD} fill={baseColor} opacity={0.07} />

      {/* Trigger bands — time-accurate shaded zones from relay events */}
      {hasIntervals ? relayIntervals!.map((iv, i) => {
        const x1 = xOfTime(Math.max(iv.start, tStart))
        const x2 = xOfTime(Math.min(iv.end, tEnd))
        if (x2 <= x1) return null
        return <rect key={`band-${i}`} x={x1} y={0} width={x2 - x1} height={H}
          fill={triggerColor} opacity={0.13} rx={2} />
      }) : null}

      {/* Event dots — visible dot + invisible larger hit area that fires onEventHover */}
      {hasIntervals ? relayIntervals!.map((iv, i) => {
        const onTime = new Date(iv.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        const offTime = new Date(iv.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        const durSec = Math.round((iv.end - iv.start) / 1000)
        return (
          <g key={`ev-${i}`}>
            {iv.start >= tStart && iv.start <= tEnd && (<>
              <circle cx={xOfTime(iv.start)} cy={H - 8} r={5}
                fill={triggerColor} stroke="white" strokeWidth={1.5} style={{ pointerEvents: 'none' }} />
              <circle cx={xOfTime(iv.start)} cy={H - 8} r={14}
                fill="transparent" style={{ cursor: 'pointer' }}
                onMouseEnter={() => onEventHover?.({ x: xOfTime(iv.start), label: `▶ ON at ${onTime} (${durSec}s)` })}
                onMouseLeave={() => onEventHover?.(null)} />
            </>)}
            {iv.end >= tStart && iv.end <= tEnd && (<>
              <circle cx={xOfTime(iv.end)} cy={H - 8} r={5}
                fill="white" stroke={triggerColor} strokeWidth={1.5} style={{ pointerEvents: 'none' }} />
              <circle cx={xOfTime(iv.end)} cy={H - 8} r={14}
                fill="transparent" style={{ cursor: 'pointer' }}
                onMouseEnter={() => onEventHover?.({ x: xOfTime(iv.end), label: `■ OFF at ${offTime} (${durSec}s)` })}
                onMouseLeave={() => onEventHover?.(null)} />
            </>)}
          </g>
        )
      }) : null}

      {data.slice(0, -1).map((_, i) => (
        <line
          key={i}
          x1={xOf(i).toFixed(1)} y1={yOf(data[i]).toFixed(1)}
          x2={xOf(i + 1).toFixed(1)} y2={yOf(data[i + 1]).toFixed(1)}
          stroke={triggers[i] || triggers[i + 1] ? triggerColor : baseColor}
          strokeWidth={2.5}
          strokeLinecap="round"
        />
      ))}

      {hoverIdx !== null && (
        <line x1={xOf(hoverIdx)} y1={0} x2={xOf(hoverIdx)} y2={H}
          stroke={baseColor} strokeWidth={1.5} strokeDasharray="4 3" opacity={0.4} />
      )}
      {data.map((v, i) => {
        const step = data.length > 40 ? 8 : data.length > 20 ? 4 : 1
        // only render normal dots at intervals, but ALWAYS render triggered dots
        if (!triggers[i] && i % step !== 0 && i !== 0 && i !== data.length - 1) return null
        const x = xOf(i), y = yOf(v)
        const isTriggered = triggers[i]
        const dotColor = isTriggered ? triggerColor : baseColor
        return (
          <circle key={i} cx={x} cy={y}
            r={hoverIdx === i ? 6 : isTriggered ? 5 : (data.length > 20 ? 2.5 : 4)}
            fill={hoverIdx === i ? dotColor : isTriggered ? triggerColor : 'white'}
            stroke={dotColor}
            strokeWidth={isTriggered ? 2.5 : 2}
          />
        )
      })}

      {/* {data.map((v, i) => {
        if (!triggers[i]) return null
        return (
          <circle key={`halo-${i}`} cx={xOf(i)} cy={yOf(v)} r={10}
            fill="none" stroke={triggerColor} strokeWidth={1} opacity={0.3} />
        )
      })} */}
    </>
  )
}

function GraphExpandModal({
  metricKey, data, triggers, labels, latestValue, onClose, timestamps, relayIntervals,
}: {
  metricKey: MetricKey
  data: number[]
  triggers: boolean[]
  labels: string[]
  latestValue?: number
  onClose: () => void
  timestamps?: number[]
  relayIntervals?: RelayInterval[]
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const { w: W, h: H } = useSize(wrapRef)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const [eventHover, setEventHover] = useState<{ x: number; label: string } | null>(null)
  const m = METRIC_META[metricKey]
  const { color, triggerColor } = m
  const { lo, hi } = getRange(data)
  const TICKS = 7
  const tickVals = Array.from({ length: TICKS }, (_, i) => hi - ((hi - lo) / (TICKS - 1)) * i)
  const hasData = data.length > 0
  const latestTriggered = triggers.length > 0 && triggers[triggers.length - 1]
  const anyTriggered = triggers.some(Boolean)
  const displayColor = latestTriggered ? triggerColor : color
  const chartH = 360
  const triggeredCount = triggers.filter(Boolean).length
  const min = hasData ? Math.min(...data) : undefined
  const max = hasData ? Math.max(...data) : undefined
  const avg = hasData ? data.reduce((a, b) => a + b, 0) / data.length : undefined

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!wrapRef.current || data.length < 2 || W === 0) return
    const rect = wrapRef.current.getBoundingClientRect()
    setHoverIdx(Math.min(data.length - 1, Math.max(0, Math.round(((e.clientX - rect.left) / W) * (data.length - 1)))))
  }, [data.length, W])

  const hoverVal = hoverIdx !== null ? data[hoverIdx] : null
  const hoverX = hoverIdx !== null && data.length > 1 ? (hoverIdx / (data.length - 1)) * W : 0
  const hoverY = hoverVal !== null ? H - ((hoverVal - lo) / (hi - lo)) * H : H / 2
  const hoverTriggered = hoverIdx !== null ? triggers[hoverIdx] : false

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
        animation: 'fadeIn 0.18s ease',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'white', borderRadius: 24,
        boxShadow: '0 32px 80px rgba(0,0,0,0.3)',
        width: '100%', maxWidth: 960,
        maxHeight: '90vh', overflowY: 'auto',
        padding: 'clamp(16px, 4vw, 28px) clamp(16px, 4vw, 32px)',
        animation: 'slideUp 0.22s ease',
        border: anyTriggered ? `1.5px solid ${triggerColor}40` : '1.5px solid #E2E8F0',
        position: 'relative',
      }}>
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 20, right: 20,
            width: 36, height: 36, borderRadius: '50%',
            background: '#F1F5F9', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#64748B', fontSize: 18, fontWeight: 700,
            transition: 'background 0.15s, color 0.15s', zIndex: 10,
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#E2E8F0'; (e.currentTarget as HTMLButtonElement).style.color = '#1E293B' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#F1F5F9'; (e.currentTarget as HTMLButtonElement).style.color = '#64748B' }}
          title="Close (Esc)"
        >✕</button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div style={{ width: 16, height: 16, borderRadius: 4, background: color, flexShrink: 0 }} />
          <div>
            <h3 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', margin: 0, lineHeight: 1.2 }}>{m.label}</h3>
            <p style={{ fontSize: 12, color: '#94A3B8', margin: '4px 0 0', fontWeight: 500 }}>Expanded view · Unit: {m.unit}</p>
          </div>
          {anyTriggered && (
            <span style={{
              fontSize: 11, fontWeight: 700, color: triggerColor,
              background: `${triggerColor}15`, border: `1px solid ${triggerColor}40`,
              borderRadius: 8, padding: '4px 10px', textTransform: 'uppercase', letterSpacing: '0.06em', marginLeft: 4,
            }}>⚠ {triggeredCount} Trigger{triggeredCount !== 1 ? 's' : ''}</span>
          )}
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontSize: 36, fontWeight: 900, color: displayColor, lineHeight: 1 }}>
              {latestValue !== undefined ? latestValue.toFixed(m.decimals) : '—'}
              <span style={{ fontSize: 14, fontWeight: 500, color: '#CBD5E1', marginLeft: 6 }}>{m.unit}</span>
            </div>
            <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 2 }}>Latest reading</div>
          </div>
        </div>

        {hasData && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 20 }}
            className="sm:grid-cols-4">
            {[
              { label: 'Minimum', value: min, icon: '↓' },
              { label: 'Maximum', value: max, icon: '↑' },
              { label: 'Average', value: avg, icon: '≈' },
              { label: 'Data Points', value: data.length, icon: '#', noUnit: true },
            ].map(({ label, value, icon, noUnit }) => (
              <div key={label} style={{ background: '#F8FAFC', borderRadius: 12, padding: '12px 16px', border: '1px solid #F1F5F9' }}>
                <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                  <span style={{ marginRight: 4 }}>{icon}</span>{label}
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#1E293B' }}>
                  {typeof value === 'number' ? value.toFixed(noUnit ? 0 : m.decimals) : '—'}
                  {!noUnit && <span style={{ fontSize: 10, color: '#94A3B8', marginLeft: 4 }}>{m.unit}</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 0 }}>
          {hasData && (
            <div style={{ width: 52, flexShrink: 0, height: chartH, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', paddingRight: 8 }}>
              {tickVals.map((v, i) => (
                <span key={i} style={{ fontSize: 10, color: '#CBD5E1', textAlign: 'right', lineHeight: 1 }}>
                  {Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2)}
                </span>
              ))}
            </div>
          )}
          {/* minWidth:0 prevents flex child from overflowing */}
          <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
            {/* FIX 1: overflow hidden — stops dots/halos from bleeding outside */}
            <div ref={wrapRef}
              style={{ height: chartH, position: 'relative', cursor: hasData ? 'crosshair' : 'default', overflow: 'hidden' }}
              onMouseMove={hasData ? handleMouseMove : undefined} onMouseLeave={() => setHoverIdx(null)}>
              {!hasData ? <NoData color={color} /> : W > 0 && H > 0 ? (
                <svg width={W} height={H} style={{ position: 'absolute', top: 0, left: 0, overflow: 'hidden' }}>
                  {tickVals.map((_, i) => (
                    <line key={i} x1={0} y1={H * i / (TICKS - 1)} x2={W} y2={H * i / (TICKS - 1)}
                      stroke={i === 0 ? '#E2E8F0' : '#F8FAFC'} strokeWidth={i === 0 ? 1.5 : 1} />
                  ))}
                  <line x1={0} y1={H} x2={W} y2={H} stroke="#E2E8F0" strokeWidth={1.5} />
                  <SegmentedLine data={data} triggers={triggers} lo={lo} hi={hi} W={W} H={H}
                    baseColor={color} triggerColor={triggerColor} hoverIdx={hoverIdx} onHoverChange={setHoverIdx}
                    timestamps={timestamps} relayIntervals={relayIntervals} />
                </svg>
              ) : null}

              {hoverIdx !== null && hoverVal !== null && W > 0 && hasData && (
                <div style={{ position: 'absolute', top: Math.max(0, hoverY - 52), left: hoverX > W * 0.7 ? 'auto' : hoverX + 16, right: hoverX > W * 0.7 ? (W - hoverX) + 16 : 'auto', pointerEvents: 'none', zIndex: 99 }}>
                  <div style={{ background: hoverTriggered ? triggerColor : color, color: 'white', borderRadius: 12, padding: '9px 14px', fontSize: 15, fontWeight: 800, whiteSpace: 'nowrap', boxShadow: '0 6px 24px rgba(0,0,0,0.25)' }}>
                    {hoverTriggered && <div style={{ fontSize: 9, fontWeight: 700, opacity: 0.9, marginBottom: 2 }}>⚠ TRIGGERED</div>}
                    {hoverVal.toFixed(m.decimals)} {m.unit}
                    <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.85, marginTop: 2 }}>{labels[hoverIdx] ?? ''}</div>
                  </div>
                </div>
              )}
            </div>
            {/* FIX 2+5: smarter step + overflow hidden on label row */}
            {hasData && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, overflow: 'hidden', width: '100%' }}>
                {labels.map((lbl, i) => {
                  const step = Math.max(1, Math.floor(labels.length / 10))
                  return i % step === 0
                    ? <span key={i} style={{ fontSize: 9, color: '#CBD5E1', overflow: 'hidden', maxWidth: 72, textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lbl}</span>
                    : <span key={i} />
                })}
              </div>
            )}
          </div>
        </div>

        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <span style={{ fontSize: 11, color: '#CBD5E1' }}>Click outside or press <kbd style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 4, padding: '1px 5px', fontSize: 10, color: '#64748B' }}>Esc</kbd> to close</span>
        </div>
      </div>
    </div>
  )
}

// ── MetricGraph ───────────────────────────────────────────────────────────────
function MetricGraph({ metricKey, data, triggers, labels, latestValue, tall, isLoading, onExpand, timestamps, relayIntervals }: {
  metricKey: MetricKey
  data: number[]
  triggers: boolean[]
  labels: string[]
  latestValue?: number
  tall?: boolean
  isLoading?: boolean
  onExpand?: () => void
  timestamps?: number[]
  relayIntervals?: RelayInterval[]
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const { w: W, h: H } = useSize(wrapRef)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const [eventHover, setEventHover] = useState<{ x: number; label: string } | null>(null)
  const m = METRIC_META[metricKey]
  const { color, triggerColor } = m
  const { lo, hi } = getRange(data)
  const TICKS = 5
  const tickVals = Array.from({ length: TICKS }, (_, i) => hi - ((hi - lo) / (TICKS - 1)) * i)
  const hasData = data.length > 0
  const latestTriggered = triggers.length > 0 && triggers[triggers.length - 1]
  const anyTriggered = triggers.some(Boolean)

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!wrapRef.current || data.length < 2 || W === 0) return
    const rect = wrapRef.current.getBoundingClientRect()
    setHoverIdx(Math.min(data.length - 1, Math.max(0, Math.round(((e.clientX - rect.left) / W) * (data.length - 1)))))
  }, [data.length, W])

  const hoverVal = hoverIdx !== null ? data[hoverIdx] : null
  const hoverX = hoverIdx !== null && data.length > 1 ? (hoverIdx / (data.length - 1)) * W : 0
  const hoverY = hoverVal !== null ? H - ((hoverVal - lo) / (hi - lo)) * H : H / 2
  const hoverTriggered = hoverIdx !== null ? triggers[hoverIdx] : false
  const chartH = tall ? 200 : 140
  const displayColor = latestTriggered ? triggerColor : color

  return (
    // FIX 4: overflow hidden on the card so nothing bleeds through rounded corners
    <div
      onClick={onExpand}
      style={{
        background: 'white', borderRadius: 16, padding: '18px 20px',
        boxShadow: '0 1px 8px rgba(0,0,0,0.07)',
        border: anyTriggered ? `1px solid ${triggerColor}30` : '1px solid #F1F5F9',
        overflow: 'hidden',  // ← FIX 4
      }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 12, height: 12, borderRadius: 3, background: color }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {m.label}
          </span>
          {anyTriggered && (
            <span style={{
              fontSize: 9, fontWeight: 700, color: triggerColor,
              background: `${triggerColor}15`, border: `1px solid ${triggerColor}40`,
              borderRadius: 6, padding: '1px 6px', textTransform: 'uppercase', letterSpacing: '0.05em'
            }}>
              ⚠ Triggered
            </span>
          )}
        </div>
        <span style={{ fontSize: 22, fontWeight: 900, color: displayColor, lineHeight: 1 }}>
          {latestValue !== undefined ? latestValue.toFixed(m.decimals) : '—'}
          <span style={{ fontSize: 10, fontWeight: 500, color: '#CBD5E1', marginLeft: 4 }}>{m.unit}</span>
        </span>
      </div>

      <div style={{ display: 'flex', gap: 0 }}>
        {hasData && !isLoading && (
          <div style={{ width: 44, flexShrink: 0, height: chartH, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', paddingRight: 6 }}>
            {tickVals.map((v, i) => (
              <span key={i} style={{ fontSize: 9, color: '#CBD5E1', textAlign: 'right', lineHeight: 1 }}>
                {Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2)}
              </span>
            ))}
          </div>
        )}
        {/* minWidth:0 prevents flex child overflow */}
        <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
          {/* FIX 1: overflow hidden on chart wrapper div */}
          <div ref={wrapRef}
            style={{ height: chartH, position: 'relative', cursor: hasData ? 'crosshair' : 'default', overflow: 'hidden' }}
            onMouseMove={hasData ? handleMouseMove : undefined} onMouseLeave={() => setHoverIdx(null)}>
            {isLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8 }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${color}`, borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
                <span style={{ fontSize: 11, color: '#94A3B8' }}>Loading…</span>
              </div>
            ) : !hasData ? (
              <NoData color={color} />
            ) : W > 0 && H > 0 ? (
              <svg width={W} height={H} style={{ position: 'absolute', top: 0, left: 0, overflow: 'hidden' }}>
                {tickVals.map((_, i) => (
                  <line key={i} x1={0} y1={H * i / (TICKS - 1)} x2={W} y2={H * i / (TICKS - 1)}
                    stroke={i === 0 ? '#E2E8F0' : '#F8FAFC'} strokeWidth={i === 0 ? 1.5 : 1} />
                ))}
                <line x1={0} y1={H} x2={W} y2={H} stroke="#E2E8F0" strokeWidth={1.5} />
                <SegmentedLine
                  data={data} triggers={triggers}
                  lo={lo} hi={hi} W={W} H={H}
                  baseColor={color}
                  triggerColor={triggerColor}
                  hoverIdx={hoverIdx}
                  onHoverChange={setHoverIdx}
                  timestamps={timestamps}
                  relayIntervals={relayIntervals}
                  onEventHover={setEventHover}
                />
              </svg>
            ) : null}

            {hoverIdx !== null && typeof hoverVal === 'number' && W > 0 && hasData && !isLoading && (
              <div style={{ position: 'absolute', top: Math.max(0, hoverY - 44), left: hoverX > W * 0.7 ? 'auto' : hoverX + 12, right: hoverX > W * 0.7 ? (W - hoverX) + 12 : 'auto', pointerEvents: 'none', zIndex: 99 }}>
                <div style={{ background: hoverTriggered ? triggerColor : color, color: 'white', borderRadius: 10, padding: '7px 12px', fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap', boxShadow: '0 6px 20px rgba(0,0,0,0.22)' }}>
                  {hoverTriggered && <div style={{ fontSize: 9, fontWeight: 700, opacity: 0.9, marginBottom: 2 }}>⚠ TRIGGERED</div>}
                  {hoverVal.toFixed(m.decimals)} {m.unit}
                  <div style={{ fontSize: 10, fontWeight: 400, opacity: 0.85, marginTop: 2 }}>{labels[hoverIdx] ?? ''}</div>
                </div>
              </div>
            )}

            {/* Event dot tooltip */}
            {eventHover && (
              <div style={{ position: 'absolute', bottom: 18, left: eventHover.x > W * 0.7 ? 'auto' : eventHover.x + 8, right: eventHover.x > W * 0.7 ? (W - eventHover.x) + 8 : 'auto', pointerEvents: 'none', zIndex: 100 }}>
                <div style={{ background: triggerColor, color: 'white', borderRadius: 8, padding: '5px 10px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', boxShadow: '0 4px 16px rgba(0,0,0,0.25)' }}>
                  {eventHover.label}
                </div>
              </div>
            )}
          </div>

          {/* FIX 2+5: adaptive step count + overflow hidden on label row */}
          {hasData && !isLoading && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, overflow: 'hidden', width: '100%' }}>
              {labels.map((lbl, i) => {
                const step = labels.length > 30 ? 10 : labels.length > 15 ? 5 : labels.length > 8 ? 3 : 1
                return i % step === 0
                  ? <span key={i} style={{ fontSize: 8, color: '#CBD5E1', overflow: 'hidden', maxWidth: 60, textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lbl}</span>
                  : <span key={i} />
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── CombinedGraphExpandModal ──────────────────────────────────────────────────
function CombinedGraphExpandModal({ dataMap, triggerMap, labels, latest, prefix, onClose, visibleMetrics }: {
  dataMap: Record<MetricKey, number[]>
  triggerMap: Record<MetricKey, boolean[]>
  labels: string[]
  latest: Partial<ApiReading>
  prefix: string
  onClose: () => void
  visibleMetrics?: MetricKey[]
}) {
  const allKeys = visibleMetrics || (Object.keys(METRIC_META) as MetricKey[])
  const defaultVisible: Record<MetricKey, boolean> = { temp: false, CO2: false, O2: false, C2H4: false }
  allKeys.forEach(k => defaultVisible[k] = true)
  const [visible, setVisible] = useState<Record<MetricKey, boolean>>(defaultVisible)
  const toggleMetric = (key: MetricKey) => setVisible(prev => ({ ...prev, [key]: !prev[key] }))
  const wrapRef = useRef<HTMLDivElement>(null)
  const { w: W, h: H } = useSize(wrapRef)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const maxLen = Math.max(...Object.values(dataMap).map(d => d.length), 2)
  const hasData = maxLen > 1

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!wrapRef.current || maxLen < 2 || W === 0) return
    const rect = wrapRef.current.getBoundingClientRect()
    setHoverIdx(Math.min(maxLen - 1, Math.max(0, Math.round(((e.clientX - rect.left) / W) * (maxLen - 1)))))
  }, [maxLen, W])

  const hoverX = hoverIdx !== null && maxLen > 1 ? (hoverIdx / (maxLen - 1)) * W : 0

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const chartH = 360

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
        animation: 'fadeIn 0.18s ease',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'white', borderRadius: 24,
        boxShadow: '0 32px 80px rgba(0,0,0,0.3)',
        width: '100%', maxWidth: 960,
        maxHeight: '90vh', overflowY: 'auto',
        padding: 'clamp(16px, 4vw, 28px) clamp(16px, 4vw, 32px)',
        animation: 'slideUp 0.22s ease',
        border: '1.5px solid #E2E8F0',
        position: 'relative',
        display: 'flex', flexDirection: 'column'
      }}>
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 20, right: 20,
            width: 36, height: 36, borderRadius: '50%',
            background: '#F1F5F9', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#64748B', fontSize: 18, fontWeight: 700,
            transition: 'background 0.15s, color 0.15s', zIndex: 10,
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#E2E8F0'; (e.currentTarget as HTMLButtonElement).style.color = '#1E293B' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#F1F5F9'; (e.currentTarget as HTMLButtonElement).style.color = '#64748B' }}
          title="Close (Esc)"
        >✕</button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h3 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', margin: 0, lineHeight: 1.2 }}>All Metrics Combined</h3>
            <p style={{ fontSize: 12, color: '#94A3B8', margin: '4px 0 0', fontWeight: 500 }}>Expanded view</p>
          </div>
          <div style={{ marginRight: 48, display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
            {allKeys.map(k => (
              <button key={k} onClick={(e) => { e.stopPropagation(); toggleMetric(k); }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', opacity: visible[k] ? 1 : 0.35, transition: 'opacity 0.2s', padding: '4px 8px', borderRadius: 8 }}>
                <div style={{ width: 14, height: 14, borderRadius: 4, background: METRIC_META[k].color }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#64748B' }}>{METRIC_META[k].label.split(' ')[0]}</span>
                {(k === 'CO2' || k === 'C2H4') && (
                  <>
                    <span style={{ fontSize: 10, color: '#CBD5E1', margin: '0 2px' }}>→</span>
                    <div style={{ width: 14, height: 14, borderRadius: 4, background: METRIC_META[k].triggerColor }} />
                    <span style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600 }}>trigger</span>
                  </>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* FIX 1: overflow hidden */}
        <div ref={wrapRef}
          style={{ height: chartH, position: 'relative', cursor: hasData ? 'crosshair' : 'default', overflow: 'hidden' }}
          onMouseMove={hasData ? handleMouseMove : undefined} onMouseLeave={() => setHoverIdx(null)}>
          {!hasData ? (
            <NoData color="#94A3B8" />
          ) : W > 0 && H > 0 ? (
            <svg width={W} height={H} style={{ position: 'absolute', top: 0, left: 0, overflow: 'hidden' }}>
              {[0, 0.25, 0.5, 0.75, 1].map((f, i) => (
                <line key={i} x1={0} y1={H * f} x2={W} y2={H * f} stroke={f === 0 ? '#E2E8F0' : '#F8FAFC'} strokeWidth={f === 0 ? 1.5 : 1} />
              ))}
              <line x1={0} y1={H} x2={W} y2={H} stroke="#E2E8F0" strokeWidth={1.5} />

              {allKeys.map(key => {
                if (!visible[key]) return null
                const d = dataMap[key]
                const trigs = triggerMap[key]
                if (d.length < 2) return null
                const { lo, hi } = getRange(d)
                // FIX 3: clamp in combined expand modal too
                const xOf = (i: number) => Math.max(DOT_PAD, Math.min(W - DOT_PAD, (i / (d.length - 1)) * W))
                const yOf = (v: number) => Math.max(DOT_PAD, Math.min(H - DOT_PAD, H - ((v - lo) / (hi - lo)) * H))
                const baseColor = METRIC_META[key].color
                const tColor = METRIC_META[key].triggerColor

                const linePts = d.map((v, i) => `${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' L')
                const areaD = `M${linePts} L${xOf(d.length - 1)},${H} L0,${H} Z`

                return (
                  <g key={key}>
                    <path d={areaD} fill={baseColor} opacity={0.05} />
                    {d.slice(0, -1).map((_, i) => {
                      const red = trigs[i] || trigs[i + 1]
                      return (
                        <line key={i}
                          x1={xOf(i).toFixed(1)} y1={yOf(d[i]).toFixed(1)}
                          x2={xOf(i + 1).toFixed(1)} y2={yOf(d[i + 1]).toFixed(1)}
                          stroke={red ? tColor : baseColor}
                          strokeWidth={2.5} strokeLinecap="round"
                        />
                      )
                    })}
                    {d.map((v, i) => {
                      const isTriggered = trigs[i]
                      const dotColor = isTriggered ? tColor : baseColor
                      return (
                        <circle key={i} cx={xOf(i)} cy={yOf(v)}
                          r={hoverIdx === i ? 6 : isTriggered ? 6 : 4}
                          fill={hoverIdx === i ? dotColor : isTriggered ? tColor : 'white'}
                          stroke={dotColor} strokeWidth={2}
                        />
                      )
                    })}
                  </g>
                )
              })}

              {hoverIdx !== null && maxLen > 1 && (
                <line x1={hoverX} y1={0} x2={hoverX} y2={H} stroke="#94A3B8" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.7} />
              )}
            </svg>
          ) : null}

          {hoverIdx !== null && W > 0 && hasData && (
            <div style={{ position: 'absolute', top: 20, left: hoverX > W * 0.65 ? 'auto' : hoverX + 16, right: hoverX > W * 0.65 ? (W - hoverX) + 16 : 'auto', pointerEvents: 'none', zIndex: 99 }}>
              <div style={{ background: '#0F172A', borderRadius: 16, padding: '12px 16px', minWidth: 180, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
                <div style={{ fontSize: 10, color: '#64748B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>{labels[hoverIdx] ?? ''}</div>
                {allKeys.map(key => {
                  if (!visible[key]) return null
                  const val = dataMap[key][hoverIdx]
                  const mk = METRIC_META[key]
                  const isTriggered = triggerMap[key][hoverIdx]
                  return (
                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 16 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: isTriggered ? mk.triggerColor : mk.color, display: 'inline-block', flexShrink: 0 }} />
                        <span style={{ color: '#94A3B8', fontSize: 12 }}>{mk.label.split(' ')[0]}</span>
                        {isTriggered && <span style={{ fontSize: 10, color: mk.triggerColor, fontWeight: 700 }}>⚠</span>}
                      </span>
                      <span style={{ fontWeight: 900, color: isTriggered ? mk.triggerColor : mk.color, fontSize: 14 }}>
                        {val !== undefined ? val.toFixed(mk.decimals) : '—'}
                        <span style={{ color: '#475569', fontSize: 10, fontWeight: 400, marginLeft: 3 }}>{mk.unit}</span>
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* FIX 5: overflow hidden + width 100% */}
        {hasData && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, overflow: 'hidden', width: '100%' }}>
            {labels.map((lbl, i) => i % Math.max(1, Math.floor(labels.length / 10)) === 0
              ? <span key={i} style={{ fontSize: 10, color: '#CBD5E1', overflow: 'hidden', maxWidth: 80, textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lbl}</span>
              : <span key={i} />
            )}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${allKeys.length},1fr)`, gap: 12, paddingTop: 16, marginTop: 16, borderTop: '1px solid #F8FAFC' }}>
          {allKeys.map(key => {
            if (!visible[key]) return null
            const val = key === 'temp' ? latest[`${prefix}_temp`]
              : key === 'CO2' ? latest[`${prefix}_CO2`]
                : key === 'O2' ? latest[`${prefix}_O2`]
                  : latest[`${prefix}_C2H4`] ?? latest[`${prefix}_c2h4`]
            const mk = METRIC_META[key]
            const latestTriggered = triggerMap[key].length > 0 && triggerMap[key][triggerMap[key].length - 1]
            return (
              <div key={key} style={{ textAlign: 'center', opacity: visible[key] ? 1 : 0.35, transition: 'opacity 0.2s', background: '#F8FAFC', borderRadius: 12, padding: '12px 16px', border: '1px solid #F1F5F9' }}>
                <div style={{ fontSize: 10, color: '#64748B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{mk.label.split(' ')[0]}</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: latestTriggered ? mk.triggerColor : mk.color }}>
                  {val !== undefined ? val.toFixed(mk.decimals) : '—'}
                  <span style={{ fontSize: 10, fontWeight: 500, color: '#94A3B8', marginLeft: 4 }}>{mk.unit}</span>
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <span style={{ fontSize: 11, color: '#CBD5E1' }}>Click outside or press <kbd style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 4, padding: '1px 5px', fontSize: 10, color: '#64748B' }}>Esc</kbd> to close</span>
        </div>
      </div>
    </div>
  )
}

// ── CombinedGraph ─────────────────────────────────────────────────────────────
function CombinedGraph({ dataMap, triggerMap, labels, latest, prefix, isLoading, onExpand, visibleMetrics }: {
  dataMap: Record<MetricKey, number[]>
  triggerMap: Record<MetricKey, boolean[]>
  labels: string[]
  latest: Partial<ApiReading>
  prefix: string
  isLoading?: boolean
  onExpand?: () => void
  visibleMetrics?: MetricKey[]
}) {
  const allKeys = visibleMetrics || (Object.keys(METRIC_META) as MetricKey[])
  const defaultVisible: Record<MetricKey, boolean> = { temp: false, CO2: false, O2: false, C2H4: false }
  allKeys.forEach(k => defaultVisible[k] = true)
  const [visible, setVisible] = useState<Record<MetricKey, boolean>>(defaultVisible)
  const toggleMetric = (key: MetricKey) => setVisible(prev => ({ ...prev, [key]: !prev[key] }))
  const wrapRef = useRef<HTMLDivElement>(null)
  const { w: W, h: H } = useSize(wrapRef)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const maxLen = Math.max(...Object.values(dataMap).map(d => d.length), 2)
  const hasData = maxLen > 1

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!wrapRef.current || maxLen < 2 || W === 0) return
    const rect = wrapRef.current.getBoundingClientRect()
    setHoverIdx(Math.min(maxLen - 1, Math.max(0, Math.round(((e.clientX - rect.left) / W) * (maxLen - 1)))))
  }, [maxLen, W])

  const hoverX = hoverIdx !== null && maxLen > 1 ? (hoverIdx / (maxLen - 1)) * W : 0

  return (
    // FIX 4: overflow hidden on card
    <div
      onClick={onExpand}
      style={{
        background: 'white', borderRadius: 16, padding: '18px 20px',
        boxShadow: '0 1px 8px rgba(0,0,0,0.07)', border: '1px solid #F1F5F9',
        display: 'flex', flexDirection: 'column',
        cursor: onExpand ? 'pointer' : 'default',
        overflow: 'hidden',  // ← FIX 4
      }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>All Metrics Combined</span>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
          {allKeys.map(k => (
            <button key={k} onClick={(e) => { e.stopPropagation(); toggleMetric(k); }}
              style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', opacity: visible[k] ? 1 : 0.35, transition: 'opacity 0.2s', padding: '2px 4px' }}>
              <div style={{ width: 10, height: 10, borderRadius: 3, background: METRIC_META[k].color }} />
              <span style={{ fontSize: 10, fontWeight: 600, color: '#94A3B8' }}>{METRIC_META[k].label.split(' ')[0]}</span>
              {(k === 'CO2' || k === 'C2H4') && (
                <>
                  <span style={{ fontSize: 9, color: '#CBD5E1', margin: '0 1px' }}>→</span>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: METRIC_META[k].triggerColor }} />
                  <span style={{ fontSize: 9, color: '#CBD5E1' }}>trig</span>
                </>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* FIX 1: overflow hidden on chart wrapper */}
      <div ref={wrapRef}
        style={{ height: 210, position: 'relative', cursor: hasData ? 'crosshair' : 'default', overflow: 'hidden' }}
        onMouseMove={hasData && !isLoading ? handleMouseMove : undefined} onMouseLeave={() => setHoverIdx(null)}>
        {isLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8 }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid #2563EB', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
            <span style={{ fontSize: 11, color: '#94A3B8' }}>Loading…</span>
          </div>
        ) : !hasData ? (
          <NoData color="#94A3B8" />
        ) : W > 0 && H > 0 ? (
          <svg width={W} height={H} style={{ position: 'absolute', top: 0, left: 0, overflow: 'hidden' }}>
            {[0, 0.25, 0.5, 0.75, 1].map((f, i) => (
              <line key={i} x1={0} y1={H * f} x2={W} y2={H * f} stroke={f === 0 ? '#E2E8F0' : '#F8FAFC'} strokeWidth={f === 0 ? 1.5 : 1} />
            ))}
            <line x1={0} y1={H} x2={W} y2={H} stroke="#E2E8F0" strokeWidth={1.5} />

            {allKeys.map(key => {
              if (!visible[key]) return null
              const d = dataMap[key]
              const trigs = triggerMap[key]
              if (d.length < 2) return null
              const { lo, hi } = getRange(d)
              // FIX 3: clamp in combined graph too
              const xOf = (i: number) => Math.max(DOT_PAD, Math.min(W - DOT_PAD, (i / (d.length - 1)) * W))
              const yOf = (v: number) => Math.max(DOT_PAD, Math.min(H - DOT_PAD, H - ((v - lo) / (hi - lo)) * H))
              const baseColor = METRIC_META[key].color
              const tColor = METRIC_META[key].triggerColor

              const linePts = d.map((v, i) => `${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' L')
              const areaD = `M${linePts} L${xOf(d.length - 1)},${H} L0,${H} Z`

              return (
                <g key={key}>
                  <path d={areaD} fill={baseColor} opacity={0.05} />
                  {d.slice(0, -1).map((_, i) => {
                    const red = trigs[i] || trigs[i + 1]
                    return (
                      <line key={i}
                        x1={xOf(i).toFixed(1)} y1={yOf(d[i]).toFixed(1)}
                        x2={xOf(i + 1).toFixed(1)} y2={yOf(d[i + 1]).toFixed(1)}
                        stroke={red ? tColor : baseColor}
                        strokeWidth={2.5} strokeLinecap="round"
                      />
                    )
                  })}
                  {d.map((v, i) => {
                    const isTriggered = trigs[i]
                    const dotColor = isTriggered ? tColor : baseColor
                    return (
                      <circle key={i} cx={xOf(i)} cy={yOf(v)}
                        r={hoverIdx === i ? 5 : isTriggered ? (d.length > 20 ? 3.5 : 5) : (d.length > 20 ? 2 : 3)}
                        fill={hoverIdx === i ? dotColor : isTriggered ? tColor : 'white'}
                        stroke={dotColor} strokeWidth={2}
                      />
                    )
                  })}
                </g>
              )
            })}

            {hoverIdx !== null && maxLen > 1 && (
              <line x1={hoverX} y1={0} x2={hoverX} y2={H} stroke="#94A3B8" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.7} />
            )}
          </svg>
        ) : null}

        {hoverIdx !== null && W > 0 && hasData && !isLoading && (
          <div style={{ position: 'absolute', top: 8, left: hoverX > W * 0.65 ? 'auto' : hoverX + 14, right: hoverX > W * 0.65 ? (W - hoverX) + 14 : 'auto', pointerEvents: 'none', zIndex: 99 }}>
            <div style={{ background: '#0F172A', borderRadius: 12, padding: '10px 14px', minWidth: 155, boxShadow: '0 8px 28px rgba(0,0,0,0.3)' }}>
              <div style={{ fontSize: 9, color: '#64748B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 9 }}>{labels[hoverIdx] ?? ''}</div>
              {allKeys.map(key => {
                if (!visible[key]) return null
                const val = dataMap[key][hoverIdx]
                const mk = METRIC_META[key]
                const isTriggered = triggerMap[key][hoverIdx]
                return (
                  <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 14 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: isTriggered ? mk.triggerColor : mk.color, display: 'inline-block', flexShrink: 0 }} />
                      <span style={{ color: '#94A3B8', fontSize: 10 }}>{mk.label.split(' ')[0]}</span>
                      {isTriggered && <span style={{ fontSize: 8, color: mk.triggerColor, fontWeight: 700 }}>⚠</span>}
                    </span>
                    <span style={{ fontWeight: 900, color: isTriggered ? mk.triggerColor : mk.color, fontSize: 12 }}>
                      {val !== undefined ? val.toFixed(mk.decimals) : '—'}
                      <span style={{ color: '#475569', fontSize: 9, fontWeight: 400, marginLeft: 2 }}>{mk.unit}</span>
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* FIX 2+5: adaptive step + overflow hidden on label row */}
      {hasData && !isLoading && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, overflow: 'hidden', width: '100%' }}>
          {labels.map((lbl, i) => {
            const step = labels.length > 40 ? 10 : labels.length > 20 ? 5 : 3
            return i % step === 0
              ? <span key={i} style={{ fontSize: 8, color: '#CBD5E1', overflow: 'hidden', maxWidth: 60, textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lbl}</span>
              : <span key={i} />
          })}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${allKeys.length},1fr)`, gap: 8, paddingTop: 12, marginTop: 6, borderTop: '1px solid #F8FAFC' }}>
        {allKeys.map(key => {
          if (!visible[key]) return null
          const val = key === 'temp' ? latest[`${prefix}_temp`]
            : key === 'CO2' ? latest[`${prefix}_CO2`]
              : key === 'O2' ? latest[`${prefix}_O2`]
                : latest[`${prefix}_C2H4`] ?? latest[`${prefix}_c2h4`]
          const mk = METRIC_META[key]
          const latestTriggered = triggerMap[key].length > 0 && triggerMap[key][triggerMap[key].length - 1]
          return (
            <div key={key} style={{ textAlign: 'center', opacity: visible[key] ? 1 : 0.35, transition: 'opacity 0.2s' }}>
              <div style={{ fontSize: 9, color: '#CBD5E1', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{mk.label.split(' ')[0]}</div>
              <div style={{ fontSize: 14, fontWeight: 900, color: latestTriggered ? mk.triggerColor : mk.color, lineHeight: 1.3 }}>
                {val !== undefined ? val.toFixed(mk.decimals) : '—'}
                <span style={{ fontSize: 9, fontWeight: 400, color: '#CBD5E1', marginLeft: 2 }}>{mk.unit}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// // ── API helpers ───────────────────────────────────────────────────────────────
// function buildRangeUrl(deviceId: string, range: TimeRange): string {
//   const base = `${API_BASE}/devices/${deviceId}/readings/range`
//   const params = new URLSearchParams({ mode: range.mode, maxPoints: '60' })
//   if (range.mode === 'custom' && range.customFrom && range.customTo) {
//     params.set('from', range.customFrom); params.set('to', range.customTo)
//   }
//   return `${base}?${params.toString()}`
// }

function buildRangeUrl(deviceId: string, range: TimeRange): string {
  const base = `${API_BASE}/devices/${deviceId}/readings/range`
  // No maxPoints cap — return ALL readings in the time window
  const params = new URLSearchParams({ mode: 'custom' })
  const now = new Date()

  switch (range.mode) {
    case 'last_hour':
      params.set('from', new Date(now.getTime() - 60 * 60 * 1000).toISOString())
      params.set('to', now.toISOString())
      break
    case '6h':
      params.set('from', new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString())
      params.set('to', now.toISOString())
      break
    case '1d':
      params.set('from', new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString())
      params.set('to', now.toISOString())
      break
    case '1w':
      params.set('from', new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString())
      params.set('to', now.toISOString())
      break
    case 'month':
      params.set('from', new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString())
      params.set('to', now.toISOString())
      break
    case 'custom':
      if (range.customFrom && range.customTo) {
        params.set('from', range.customFrom)
        params.set('to', range.customTo)
      }
      break
  }

  return `${base}?${params.toString()}`
}

// Build trigger boolean arrays from relay events (Events table) + reading timestamps.
// Events have notes like "[device] Room 1 Exhaust ON" / "[device] Room 1 SOV OFF".
// Returns a boolean[] aligned to `timestamps` where true = relay was ON at that moment.
// Parse relay events into ON/OFF time intervals (ms epoch)
interface RelayInterval { start: number; end: number }

function buildRelayIntervals(
  events: { timestamp: string; note?: string }[],
  relayKeyword: string,   // "Exhaust" or "SOV"
  roomName: string,       // "Room 1"
  windowEnd?: number      // close any open interval at this time
): RelayInterval[] {
  const intervals: RelayInterval[] = []
  let onTime: number | null = null
  for (const e of events) {
    const note = e.note ?? ''
    if (!note.includes(roomName) || !note.includes(relayKeyword)) continue
    const t = new Date(e.timestamp).getTime()
    if (note.includes('ON') && !note.includes('OFF')) {
      if (onTime === null) onTime = t
    } else if (note.includes('OFF')) {
      if (onTime !== null) { intervals.push({ start: onTime, end: t }); onTime = null }
    }
  }
  if (onTime !== null) intervals.push({ start: onTime, end: windowEnd ?? Date.now() })
  return intervals
}

// For each reading timestamp, check if it falls inside any relay ON interval
function buildTriggerArrayFromIntervals(
  intervals: RelayInterval[],
  timestamps: number[]     // ms epoch per reading
): boolean[] {
  return timestamps.map(t => intervals.some(iv => t >= iv.start && t <= iv.end))
}

// Build the events API URL for the same time window as readings
function buildEventsUrl(deviceId: string, range: TimeRange): string {
  const base = `${API_BASE}/devices/${deviceId}/events/range`
  const params = new URLSearchParams({ mode: 'custom', eventType: 'relay_change' })
  const now = new Date()
  switch (range.mode) {
    case 'live':
    case 'last_hour': params.set('from', new Date(now.getTime() - 60 * 60 * 1000).toISOString()); params.set('to', now.toISOString()); break
    case '6h':        params.set('from', new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString()); params.set('to', now.toISOString()); break
    case '1d':        params.set('from', new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()); params.set('to', now.toISOString()); break
    case '1w':        params.set('from', new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()); params.set('to', now.toISOString()); break
    case 'month':     params.set('from', new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()); params.set('to', now.toISOString()); break
    case 'custom':    if (range.customFrom && range.customTo) { params.set('from', range.customFrom); params.set('to', range.customTo) }; break
  }
  return `${base}?${params.toString()}`
}

interface AllData {
  temp: number[]; co2: number[]; o2: number[]; c2h4: number[]
  triggersCO2: boolean[]
  triggersC2H4: boolean[]
  timestamps: number[]            // ms epoch per reading point
  intervalsCO2: RelayInterval[]   // Exhaust ON/OFF intervals (exact event times)
  intervalsC2H4: RelayInterval[]  // SOV ON/OFF intervals (exact event times)
  labels: string[]
  loading: boolean
  latestTemp?: number; latestCO2?: number; latestO2?: number; latestC2H4?: number
}

export default function DetailedGraphsPage() {
  const router = useRouter()
  const params = useParams()
  const deviceId = (params?.deviceId as string) ?? 'DEVICE_001'
  const roomId = (params?.roomId as string) ?? '1'
  const [expandedMetric, setExpandedMetric] = useState<MetricKey | 'combined' | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [timeRange, setTimeRange] = useState<TimeRange>({ mode: 'live' })
  const [allData, setAllData] = useState<AllData>({
    temp: [], co2: [], o2: [], c2h4: [],
    triggersCO2: [], triggersC2H4: [],
    timestamps: [], intervalsCO2: [], intervalsC2H4: [],
    labels: [], loading: false,
  })
  const [liveStatus, setLiveStatus] = useState<'connecting' | 'ok' | 'error'>('connecting')
  const [lastUpdated, setLastUpdated] = useState('')
  const [latest, setLatest] = useState<Partial<ApiReading>>({})
  const [enabledRooms, setEnabledRooms] = useState<Record<string, boolean>>({})
  
  // Track live relay states from /state topic so trigger bands appear on graphs
  const relayStateRef = useRef<{ sovOn: boolean; exhOn: boolean }>({ sovOn: false, exhOn: false })

  useEffect(() => {
    if (localStorage.getItem('isAuthenticated') !== 'true') router.push('/')
    else setIsAuthenticated(true)
  }, [router])

  // Fetch enabled rooms for MLH
  useEffect(() => {
    if (getDeviceType(deviceId).prefix !== 'mlh') return
    fetch(`${API_BASE}/devices/${deviceId}/settings/enabled-rooms`)
      .then(r => r.json())
      .then(data => { if (data.success && data.data?.enabledRooms) setEnabledRooms(data.data.enabledRooms) })
      .catch(() => {})
  }, [deviceId])

  // ── IoT WebSocket live mode ───────────────────────────────────────────────
  // Subscribe to the device's readings topic. We always subscribe (rules of hooks),
  // but we only update chart state when the user is in `live` mode.
  // When entering live mode, seed the chart with the last 15 readings from the API
  // so the graph isn't empty — then the WebSocket takes over and streams new data.
  useEffect(() => {
    if (timeRange.mode !== 'live') return
    setAllData({ temp: [], co2: [], o2: [], c2h4: [], triggersCO2: [], triggersC2H4: [], timestamps: [], intervalsCO2: [], intervalsC2H4: [], labels: [], loading: true })
    setLiveStatus('connecting')

    // Seed with last 15 readings + relay events for trigger bands
    let cancelled = false
    ;(async () => {
      try {
        const now = new Date()
        const params = new URLSearchParams({ mode: 'custom', from: new Date(now.getTime() - LIVE_WINDOW_MS).toISOString(), to: now.toISOString() })
        const [readingsRes, eventsRes] = await Promise.all([
          fetch(`${API_BASE}/devices/${deviceId}/readings/range?${params.toString()}`),
          fetch(buildEventsUrl(deviceId, { mode: 'last_hour' }))
        ])
        if (!readingsRes.ok) return
        const json = await readingsRes.json()
        if (!json.success || cancelled) return
        const allReadings: RangeReading[] = (json.data.readings ?? []).slice().sort(
          (a: RangeReading, b: RangeReading) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        )
        const readings = allReadings
        const roomKey = ROOM_PREFIX[roomId] ?? 'R1'
        const roomName = `Room ${roomId}`
        const timestamps = readings.map(r => new Date(r.timestamp).getTime())
        // Parse relay events for trigger bands
        let relayEvents: { timestamp: string; note?: string }[] = []
        try {
          const evJson = await eventsRes.json()
          if (evJson.success) relayEvents = evJson.data.events ?? []
        } catch { /* ignore events fetch failure */ }
        const formatLiveLabel = (ts: string) => {
          const d = new Date(ts)
          return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`
        }
        // Set initial relay state from most recent events
        const lastExhOn = [...relayEvents].reverse().find(e => (e.note ?? '').includes(roomName) && (e.note ?? '').includes('Exhaust'))
        const lastSovOn = [...relayEvents].reverse().find(e => (e.note ?? '').includes(roomName) && (e.note ?? '').includes('SOV'))
        if (lastExhOn) relayStateRef.current.exhOn = (lastExhOn.note ?? '').includes('ON') && !(lastExhOn.note ?? '').includes('OFF')
        if (lastSovOn) relayStateRef.current.sovOn = (lastSovOn.note ?? '').includes('ON') && !(lastSovOn.note ?? '').includes('OFF')
        const exhIntervals = buildRelayIntervals(relayEvents, 'Exhaust', roomName)
        const sovIntervals = buildRelayIntervals(relayEvents, 'SOV', roomName)
        const tsMs = readings.map(r => new Date(r.timestamp).getTime())
        setAllData({
          loading: false,
          labels: readings.map(r => formatLiveLabel(r.timestamp)),
          temp: readings.map(r => extractMetric(r, roomKey, 'temp')),
          co2: readings.map(r => extractMetric(r, roomKey, 'CO2')),
          o2: readings.map(r => extractMetric(r, roomKey, 'O2')),
          c2h4: readings.map(r => extractMetric(r, roomKey, 'C2H4')),
          triggersCO2: buildTriggerArrayFromIntervals(exhIntervals, tsMs),
          triggersC2H4: buildTriggerArrayFromIntervals(sovIntervals, tsMs),
          timestamps: tsMs,
          intervalsCO2: exhIntervals,
          intervalsC2H4: sovIntervals,
        })
        setLiveStatus('ok')
      } catch {
        if (!cancelled) setAllData(prev => ({ ...prev, loading: false }))
      }
    })()
    return () => { cancelled = true }
  }, [timeRange.mode, deviceId, roomId])

 useIoT(
    [`devices/${deviceId}/readings`, `devices/${deviceId}/state`],
    useCallback(({ topic, payload }) => {
      // Track relay states from /state messages for live trigger bands
      if (topic.endsWith('/state')) {
        const stateRooms: any[] = Array.isArray(payload?.rooms) ? payload.rooms : []
        const stateRoomIdx = parseInt(roomId, 10)
        const stateRoom = stateRooms.find((r: any) => {
          const rid = typeof r?.id === 'string' ? parseInt(r.id.replace('room-', ''), 10) : Number(r?.id)
          return rid === stateRoomIdx
        })
        if (stateRoom) {
          const nowExh = !!(stateRoom.exh ?? stateRoom.exhOn ?? false)
          const nowSov = !!(stateRoom.sov ?? stateRoom.sovOn ?? false)
          const prevExh = relayStateRef.current.exhOn
          const prevSov = relayStateRef.current.sovOn
          relayStateRef.current = { sovOn: nowSov, exhOn: nowExh }

          // Update intervals in real-time so bands/dots appear live
          if (timeRange.mode === 'live' && (nowExh !== prevExh || nowSov !== prevSov)) {
            const t = Date.now()
            setAllData(prev => {
              let exhIvs = [...prev.intervalsCO2]
              let sovIvs = [...prev.intervalsC2H4]
              // Exhaust toggled
              if (nowExh && !prevExh) {
                exhIvs.push({ start: t, end: t })          // open new interval
              } else if (!nowExh && prevExh && exhIvs.length > 0) {
                exhIvs[exhIvs.length - 1] = { ...exhIvs[exhIvs.length - 1], end: t }  // close last
              }
              // SOV toggled
              if (nowSov && !prevSov) {
                sovIvs.push({ start: t, end: t })
              } else if (!nowSov && prevSov && sovIvs.length > 0) {
                sovIvs[sovIvs.length - 1] = { ...sovIvs[sovIvs.length - 1], end: t }
              }
              return { ...prev, intervalsCO2: exhIvs, intervalsC2H4: sovIvs }
            })
          }
        }
        return
      }

      // Only feed live mode — historical modes use the /range fetch instead
      if (timeRange.mode !== 'live') return

      // Firmware publishes { device, version, rooms: [{id, temp, CO2|humidity, O2, c2h4}, ...] }
      const roomsArr: any[] = Array.isArray(payload?.rooms) ? payload.rooms : []
      if (roomsArr.length === 0) return

      const roomIndex = parseInt(roomId, 10)
      const room = roomsArr.find((r: any) => Number(r?.id) === roomIndex)
      if (!room) return

      const temp = Number(room.temp ?? 0)
      const co2 = Number(room.CO2 ?? room.humidity ?? 0)
      const o2 = Number(room.O2 ?? 0)
      const c2h4 = Number(room.c2h4 ?? 0)
      // Use relay state ref (updated by /state messages) for trigger flags
      const trigCO2 = relayStateRef.current.exhOn
      const trigC2H4 = relayStateRef.current.sovOn
      const label = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

      const prefix = ROOM_PREFIX[roomId] ?? 'R1'
      setLiveStatus('ok')
      setLastUpdated(new Date().toLocaleTimeString())
      setLatest({
        [`${prefix}_temp`]: temp,
        [`${prefix}_CO2`]: co2,
        [`${prefix}_O2`]: o2,
        [`${prefix}_c2h4`]: c2h4,
        [`${prefix}_triggerco2`]: trigCO2 as unknown as number,
        [`${prefix}_triggerc2h4`]: trigC2H4 as unknown as number,
      } as Partial<ApiReading>)

      const nowMs = Date.now()
      const cutoff = nowMs - LIVE_WINDOW_MS
      setAllData(prev => {
        if (prev.loading) return prev
        // Extend any open (ON) interval's end to now so the band grows live
        let exhIvs = prev.intervalsCO2
        let sovIvs = prev.intervalsC2H4
        if (relayStateRef.current.exhOn && exhIvs.length > 0) {
          exhIvs = [...exhIvs]
          exhIvs[exhIvs.length - 1] = { ...exhIvs[exhIvs.length - 1], end: nowMs }
        }
        if (relayStateRef.current.sovOn && sovIvs.length > 0) {
          sovIvs = [...sovIvs]
          sovIvs[sovIvs.length - 1] = { ...sovIvs[sovIvs.length - 1], end: nowMs }
        }
        const newTs = [...prev.timestamps, nowMs]
        const s = Math.max(0, newTs.findIndex(t => t >= cutoff))
        return {
          ...prev,
          temp: [...prev.temp, temp].slice(s),
          co2: [...prev.co2, co2].slice(s),
          o2: [...prev.o2, o2].slice(s),
          c2h4: [...prev.c2h4, c2h4].slice(s),
          triggersCO2: [...prev.triggersCO2, trigCO2].slice(s),
          triggersC2H4: [...prev.triggersC2H4, trigC2H4].slice(s),
          timestamps: newTs.slice(s),
          labels: [...prev.labels, label].slice(s),
          intervalsCO2: exhIvs.filter(iv => iv.end >= cutoff),
          intervalsC2H4: sovIvs.filter(iv => iv.end >= cutoff),
          latestTemp: temp, latestCO2: co2, latestO2: o2, latestC2H4: c2h4,
        }
      })
    }, [timeRange.mode, roomId])
  )

  // ── Range mode (non-live) ─────────────────────────────────────────────────
  const fetchRange = useCallback(async (range: TimeRange) => {
    setAllData(prev => ({ ...prev, loading: true, temp: [], co2: [], o2: [], c2h4: [], triggersCO2: [], triggersC2H4: [], timestamps: [], intervalsCO2: [], intervalsC2H4: [], labels: [] }))
    try {
      const [readingsRes, eventsRes] = await Promise.all([
        fetch(buildRangeUrl(deviceId, range)),
        fetch(buildEventsUrl(deviceId, range))
      ])
      if (!readingsRes.ok) throw new Error('fetch failed')
      const json = await readingsRes.json()
      if (!json.success) { setAllData(prev => ({ ...prev, loading: false })); return }

      const readings: RangeReading[] = (json.data.readings ?? []).slice().sort(
        (a: RangeReading, b: RangeReading) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      )
      const roomKey = ROOM_PREFIX[roomId] ?? 'R1'
      const roomName = `Room ${roomId}`
      const labels = readings.map(r => formatLabel(r.timestamp, range.mode))
      const timestamps = readings.map(r => new Date(r.timestamp).getTime())
      const lastIdx = readings.length - 1

      // Parse relay events for trigger bands
      let relayEvents: { timestamp: string; note?: string }[] = []
      try {
        const evJson = await eventsRes.json()
        if (evJson.success) relayEvents = evJson.data.events ?? []
      } catch { /* ignore events fetch failure — triggers just won't show */ }

      const exhIntervals = buildRelayIntervals(relayEvents, 'Exhaust', roomName)
      const sovIntervals = buildRelayIntervals(relayEvents, 'SOV', roomName)
      const tsMs = readings.map(r => new Date(r.timestamp).getTime())

      setAllData({
        loading: false, labels,
        temp: readings.map(r => extractMetric(r, roomKey, 'temp')),
        co2: readings.map(r => extractMetric(r, roomKey, 'CO2')),
        o2: readings.map(r => extractMetric(r, roomKey, 'O2')),
        c2h4: readings.map(r => extractMetric(r, roomKey, 'C2H4')),
        triggersCO2: buildTriggerArrayFromIntervals(exhIntervals, tsMs),
        triggersC2H4: buildTriggerArrayFromIntervals(sovIntervals, tsMs),
        timestamps: tsMs,
        intervalsCO2: exhIntervals,
        intervalsC2H4: sovIntervals,
        latestTemp: lastIdx >= 0 ? extractMetric(readings[lastIdx], roomKey, 'temp') : undefined,
        latestCO2: lastIdx >= 0 ? extractMetric(readings[lastIdx], roomKey, 'CO2') : undefined,
        latestO2: lastIdx >= 0 ? extractMetric(readings[lastIdx], roomKey, 'O2') : undefined,
        latestC2H4: lastIdx >= 0 ? extractMetric(readings[lastIdx], roomKey, 'C2H4') : undefined,
      })
    } catch { setAllData(prev => ({ ...prev, loading: false })) }
  }, [deviceId, roomId])

  useEffect(() => {
    if (!isAuthenticated || timeRange.mode === 'live') return
    fetchRange(timeRange)
  }, [isAuthenticated, timeRange, fetchRange])

  if (!isAuthenticated) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-[#2B8DB8]" />
      </div>
    )
  }

  const prefix = ROOM_PREFIX[roomId] ?? 'R1'
  const emptyTriggers = allData.temp.map(() => false)
  const metricDataMap = {
    C2H4: { data: allData.c2h4, triggers: allData.triggersC2H4, latestValue: timeRange.mode === 'live' ? (latest[`${prefix}_C2H4`] ?? latest[`${prefix}_c2h4`]) : allData.latestC2H4 },
    CO2: { data: allData.co2, triggers: allData.triggersCO2, latestValue: timeRange.mode === 'live' ? latest[`${prefix}_CO2`] : allData.latestCO2 },
    O2: { data: allData.o2, triggers: emptyTriggers, latestValue: timeRange.mode === 'live' ? latest[`${prefix}_O2`] : allData.latestO2 },
    temp: { data: allData.temp, triggers: emptyTriggers, latestValue: timeRange.mode === 'live' ? latest[`${prefix}_temp`] : allData.latestTemp },
  }

  const combinedDataMap: Record<MetricKey, number[]> = {
    temp: allData.temp, CO2: allData.co2, O2: allData.o2, C2H4: allData.c2h4,
  }
  const combinedTriggerMap: Record<MetricKey, boolean[]> = {
    temp: emptyTriggers,
    CO2: allData.triggersCO2,
    O2: emptyTriggers,
    C2H4: allData.triggersC2H4,
  }

  return (
    <div>
      <style>{`
        @keyframes spin    { to { transform: rotate(360deg) } }
        @keyframes fadeIn  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px) scale(0.97) } to { opacity: 1; transform: translateY(0) scale(1) } }
      `}</style>

      {/* Breadcrumb */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-4 mb-4 sm:mb-6">
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <button onClick={() => router.push('/dashboard')} className="text-gray-400 hover:text-gray-700">Home</button>
          <span className="text-gray-300">›</span>
          <button onClick={() => router.push(`/device/${deviceId}/${deviceId.toLowerCase().startsWith('mlh') ? 'machines' : 'rooms'}`)} className="text-gray-400 hover:text-gray-700">{deviceId}</button>
          <span className="text-gray-300">›</span>
          <span className="text-gray-700 font-semibold">{deviceId.toLowerCase().startsWith('mlh') ? 'Machine' : 'Room'} {roomId} — Graphs</span>
        </div>
        {timeRange.mode === 'live' && (
          <div className={`ml-auto flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap
            ${liveStatus === 'ok' ? 'bg-green-100 text-green-700' : liveStatus === 'error' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
            <span className={`w-2 h-2 rounded-full ${liveStatus === 'ok' ? 'bg-green-500 animate-pulse' : liveStatus === 'error' ? 'bg-red-500' : 'bg-yellow-500 animate-pulse'}`} />
            {liveStatus === 'ok' ? `Live · ${lastUpdated}` : liveStatus === 'error' ? 'No data' : 'Connecting…'}
          </div>
        )}
      </div>

      {/* Title + controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-5 sm:mb-6 gap-3 sm:gap-4">
        <div>
          <h2 className="text-xl sm:text-3xl font-bold text-gray-800">{deviceId.toLowerCase().startsWith('mlh') ? 'Machine' : 'Room'} {roomId} — Detailed Metrics</h2>
          <p className="text-gray-500 text-sm mt-1 flex flex-wrap items-center gap-2 sm:gap-3">
            <span>
              {timeRange.mode === 'live'
               ? `Live · ${allData.temp.length} points`
                : `Showing: ${RANGE_OPTIONS.find(r => r.key === timeRange.mode)?.label ?? 'Custom'}`}
            </span>
            <span className="flex items-center gap-2 text-xs">
              {getDeviceType(deviceId).sensors.includes('co2') && (<>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: METRIC_META.CO2.triggerColor, display: 'inline-block' }} />
              <span style={{ color: METRIC_META.CO2.triggerColor, fontWeight: 600 }}>CO₂ triggered</span>
              </>)}
              {getDeviceType(deviceId).sensors.includes('c2h4') && (<>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: METRIC_META.C2H4.triggerColor, display: 'inline-block', marginLeft: 4 }} />
              <span style={{ color: METRIC_META.C2H4.triggerColor, fontWeight: 600 }}>C₂H₄ triggered</span>
              </>)}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <div className="flex gap-1.5 sm:gap-2">
            {Array.from({ length: getDeviceType(deviceId).rooms }, (_, i) => String(i + 1))
              .filter(id => {
                if (getDeviceType(deviceId).prefix !== 'mlh') return true
                return enabledRooms[`Room ${id}`] !== false && enabledRooms[`r${id}`] !== false
              })
              .map(id => (
              <button key={id}
                onClick={() => router.push(`/device/${deviceId}/${deviceId.toLowerCase().startsWith('mlh') ? 'machine' : 'room'}/${id}/graphs/detailed`)}
                className={`px-3 sm:px-5 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-semibold transition-all duration-200
                  ${roomId === id ? 'bg-[#7EC8E3] text-white shadow-md' : 'bg-[#2B8DB8] text-white hover:bg-[#3A9DC4]'}`}>
                {deviceId.toLowerCase().startsWith('mlh') ? 'Machine' : 'Room'} {id}
              </button>
            ))}
          </div>
          <RangeDropdown value={timeRange} onChange={setTimeRange} />
          <button
            onClick={() => setShowReport(true)}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-white border border-gray-200 rounded-xl
             text-xs sm:text-sm font-semibold text-gray-700 hover:border-[#2B8DB8] hover:text-[#2B8DB8]
             transition-colors shadow-sm whitespace-nowrap"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="hidden sm:inline">Generate Report</span>
            <span className="sm:hidden">Report</span>
          </button>
        </div>
      </div>

      {/* Graphs — filtered by device type sensors */}
      {(() => {
        const dt = getDeviceType(deviceId)
        const isMlh = dt.prefix === 'mlh'
        const showC2H4 = dt.sensors.includes('c2h4')
        const showCO2 = dt.sensors.includes('co2')
        const showO2 = dt.sensors.includes('o2')
        const showHumidity = dt.sensors.includes('humidity')

        // Top row: show only relevant sensors
        const topCards = []
        if (showC2H4) topCards.push(
          <MetricGraph key="C2H4" metricKey="C2H4" data={allData.c2h4} triggers={allData.triggersC2H4} labels={allData.labels}
            timestamps={allData.timestamps} relayIntervals={allData.intervalsC2H4}
            latestValue={timeRange.mode === 'live' ? (latest[`${prefix}_C2H4`] ?? latest[`${prefix}_c2h4`]) : allData.latestC2H4}
            isLoading={allData.loading} onExpand={() => setExpandedMetric('C2H4')} />
        )
        if (showCO2) topCards.push(
          <MetricGraph key="CO2" metricKey="CO2" data={allData.co2} triggers={allData.triggersCO2} labels={allData.labels}
            timestamps={allData.timestamps} relayIntervals={allData.intervalsCO2}
            latestValue={timeRange.mode === 'live' ? latest[`${prefix}_CO2`] : allData.latestCO2}
            isLoading={allData.loading} onExpand={() => setExpandedMetric('CO2')} />
        )
        if (showO2 || showHumidity) topCards.push(
          <MetricGraph key="O2" metricKey="O2" data={allData.o2} triggers={emptyTriggers} labels={allData.labels}
            latestValue={timeRange.mode === 'live' ? latest[`${prefix}_O2`] : allData.latestO2}
            isLoading={allData.loading} onExpand={() => setExpandedMetric('O2')} />
        )

        // For MLH: only show temp and humidity in combined, filter out CO2/C2H4
        const filteredCombinedDataMap: Record<MetricKey, number[]> = { ...combinedDataMap }
        const filteredCombinedTriggerMap: Record<MetricKey, boolean[]> = { ...combinedTriggerMap }

        return (<>
          <div className={`grid grid-cols-1 ${topCards.length >= 3 ? 'lg:grid-cols-3' : topCards.length === 2 ? 'lg:grid-cols-2' : ''} gap-3 sm:gap-5 mb-3 sm:mb-5`}>
            {topCards}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-5 mb-3 sm:mb-5">
            <MetricGraph metricKey="temp" data={allData.temp} triggers={emptyTriggers} labels={allData.labels}
              latestValue={timeRange.mode === 'live' ? latest[`${prefix}_temp`] : allData.latestTemp}
              tall isLoading={allData.loading} onExpand={() => setExpandedMetric('temp')} />
            <CombinedGraph dataMap={filteredCombinedDataMap} triggerMap={filteredCombinedTriggerMap}
              labels={allData.labels} latest={latest} prefix={prefix} isLoading={allData.loading} onExpand={() => setExpandedMetric('combined')}
              visibleMetrics={isMlh ? ['temp', 'CO2'] : undefined} />
          </div>
        </>)
      })()}

      {expandedMetric && expandedMetric !== 'combined' && (
        <GraphExpandModal
          metricKey={expandedMetric as MetricKey}
          data={metricDataMap[expandedMetric as MetricKey].data}
          triggers={metricDataMap[expandedMetric as MetricKey].triggers}
          timestamps={allData.timestamps}
          relayIntervals={expandedMetric === 'CO2' ? allData.intervalsCO2 : expandedMetric === 'C2H4' ? allData.intervalsC2H4 : []}
          labels={allData.labels}
          latestValue={metricDataMap[expandedMetric as MetricKey].latestValue}
          onClose={() => setExpandedMetric(null)}
        />
      )}

      {expandedMetric === 'combined' && (
        <CombinedGraphExpandModal
          dataMap={combinedDataMap}
          triggerMap={combinedTriggerMap}
          labels={allData.labels}
          latest={latest}
          prefix={prefix}
          onClose={() => setExpandedMetric(null)}
          visibleMetrics={getDeviceType(deviceId).prefix === 'mlh' ? ['temp', 'CO2'] as MetricKey[] : undefined}
        />
      )}

      {showReport && (
        <ReportModal deviceId={deviceId} roomId={roomId} onClose={() => setShowReport(false)} />
      )}
    </div>
  )
}

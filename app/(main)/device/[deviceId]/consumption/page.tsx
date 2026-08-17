'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { getDeviceType } from '@/utils/deviceTypes'
import { useIoT } from '@/utils/useIoT'

interface MeterData {
  amp: number | null
  watts: number | null
  kwh: number | null
  freq: number | null
  lastUpdated: string | null
}

interface MeterReading {
  timestamp: string
  amp: number
  watts: number
  kwh: number
  freq: number
}

type HistoryRange = '1h' | '6h' | '1d' | '1w' | 'custom'

const RANGE_OPTIONS: { key: HistoryRange; label: string }[] = [
  { key: '1h', label: '1 Hour' },
  { key: '6h', label: '6 Hours' },
  { key: '1d', label: '24 Hours' },
  { key: '1w', label: '7 Days' },
  { key: 'custom', label: 'Custom' },
]

const METER_METRICS = [
  { key: 'amp' as const, label: 'Current', unit: 'A', color: '#F59E0B' },
  { key: 'watts' as const, label: 'Active Power', unit: 'kW', color: '#3B82F6' },
  { key: 'kwh' as const, label: 'Energy', unit: 'kWh', color: '#10B981' },
  { key: 'freq' as const, label: 'Frequency', unit: 'Hz', color: '#8B5CF6' },
]

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://cpanel.backend.mechair.co.in/api'

export default function ConsumptionPage() {
  const router = useRouter()
  const params = useParams()
  const deviceId = params?.deviceId as string
  const deviceType = getDeviceType(deviceId)

  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [meter, setMeter] = useState<MeterData>({ amp: null, watts: null, kwh: null, freq: null, lastUpdated: null })

  // Report state
  const [historyRange, setHistoryRange] = useState<HistoryRange>('1d')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [history, setHistory] = useState<MeterReading[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [fetched, setFetched] = useState(false)

  useEffect(() => {
    const authStatus = localStorage.getItem('isAuthenticated')
    if (authStatus !== 'true') router.push('/')
    else setIsAuthenticated(true)
  }, [router])

  // Fetch latest reading to seed meter data
  useEffect(() => {
    if (!isAuthenticated || !deviceId) return
    const fetchLatest = async () => {
      try {
        const res = await fetch(`${API_BASE}/devices/${deviceId}/readings/latest`)
        const data = await res.json()
        if (data.success && data.data?.reading) {
          const m = data.data.reading.meter || data.data.reading.roomData?.meter
          if (m) {
          setMeter({
            amp: m.amp ?? m.va ?? null,
            watts: m.w ?? m.watts ?? null,
            kwh: m.kwh ?? null,
            freq: m.freq ?? null,
            lastUpdated: data.data.reading.timestamp ?? null,
          })
          }
        }
      } catch {}
    }
    fetchLatest()
  }, [isAuthenticated, deviceId])

  // Live updates via IoT WebSocket
  useIoT(
    [`devices/${deviceId}/readings`],
    useCallback(({ topic, payload }) => {
      if (topic.endsWith('/readings') && (payload.meter || payload.roomData?.meter)) {
        const m = payload.meter || payload.roomData?.meter
        setMeter({
          amp: m.amp ?? m.va ?? null,
          watts: m.w ?? m.watts ?? null,
          kwh: m.kwh ?? null,
          freq: m.freq ?? null,
          lastUpdated: new Date().toLocaleTimeString(),
        })
      }
    }, [])
  )

  // Fetch report data
  const fetchHistory = useCallback(async () => {
    if (!deviceId) return
    setHistoryLoading(true)
    setFetched(false)
    try {
      const params = new URLSearchParams({ mode: 'custom' })
      const now = new Date()
      switch (historyRange) {
        case '1h':
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
        case 'custom':
          if (customFrom && customTo) {
            params.set('from', new Date(customFrom).toISOString())
            params.set('to', new Date(customTo).toISOString())
          } else {
            setHistoryLoading(false)
            return
          }
          break
      }
      const res = await fetch(`${API_BASE}/devices/${deviceId}/readings/range?${params}`)
      const json = await res.json()
      if (json.success) {
        const readings = (json.data.readings ?? [])
          .sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
          .filter((r: any) => r.meter || r.roomData?.meter)
          .map((r: any) => {
            const m = r.meter || r.roomData?.meter || {}
            return {
              timestamp: r.timestamp,
              amp: m.amp ?? m.va ?? 0,
              watts: m.w ?? m.watts ?? 0,
              kwh: m.kwh ?? 0,
              freq: m.freq ?? 0,
            }
          })
        setHistory(readings)
      }
    } catch (e) {
      console.error('Failed to fetch history:', e)
    } finally {
      setHistoryLoading(false)
      setFetched(true)
    }
  }, [deviceId, historyRange, customFrom, customTo])

  // Export CSV
  const exportCSV = useCallback(() => {
    if (history.length === 0) return
    const header = 'Timestamp,Current (A),Active Power (kW),Energy (kWh),Frequency (Hz)\n'
    const rows = history.map(r =>
      `${r.timestamp},${r.amp.toFixed(3)},${r.watts.toFixed(3)},${r.kwh.toFixed(3)},${r.freq.toFixed(2)}`
    ).join('\n')
    const blob = new Blob([header + rows], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `consumption_${deviceId}_${historyRange}_${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [history, deviceId, historyRange])

  // Export Excel
  const exportExcel = useCallback(async () => {
    if (history.length === 0) return
    setExporting(true)
    try {
      const { utils, writeFile } = await import('xlsx')
      const wsData = [
        ['Timestamp', 'Current (A)', 'Active Power (kW)', 'Energy (kWh)', 'Frequency (Hz)'],
        ...history.map(r => [
          r.timestamp,
          Number(r.amp.toFixed(3)),
          Number(r.watts.toFixed(3)),
          Number(r.kwh.toFixed(3)),
          Number(r.freq.toFixed(2)),
        ])
      ]
      const ws = utils.aoa_to_sheet(wsData)
      ws['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 16 }]

      const wb = utils.book_new()
      utils.book_append_sheet(wb, ws, 'Consumption')

      // Summary sheet
      const summaryStats = METER_METRICS.map(m => {
        const vals = history.map(r => r[m.key]).filter(v => isFinite(v) && v !== 0)
        if (vals.length === 0) return [m.label, m.unit, 0, '--', '--', '--']
        return [
          m.label, m.unit, vals.length,
          Math.min(...vals).toFixed(3),
          Math.max(...vals).toFixed(3),
          (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(3),
        ]
      })
      const ws2 = utils.aoa_to_sheet([
        ['Parameter', 'Unit', 'Points', 'Min', 'Max', 'Avg'],
        ...summaryStats, [],
        ['Device', deviceId],
        ['Range', historyRange === 'custom' ? `${customFrom} to ${customTo}` : historyRange],
        ['Generated', new Date().toLocaleString()],
      ])
      ws2['!cols'] = [{ wch: 16 }, { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 12 }]
      utils.book_append_sheet(wb, ws2, 'Summary')

      writeFile(wb, `consumption_${deviceId}_${historyRange}_${Date.now()}.xlsx`)
    } catch (e) {
      console.error('Excel export failed:', e)
    } finally {
      setExporting(false)
    }
  }, [history, deviceId, historyRange, customFrom, customTo])

  const meterConnected = meter.amp !== null || meter.watts !== null || meter.kwh !== null || meter.freq !== null

  const cards = [
    { label: 'Current', value: meter.amp, unit: 'A', icon: '⚡', bg: 'bg-amber-50', text: 'text-amber-700' },
    { label: 'Active Power', value: meter.watts, unit: 'kW', icon: '🔌', bg: 'bg-blue-50', text: 'text-blue-700' },
    { label: 'Energy', value: meter.kwh, unit: 'kWh', icon: '📊', bg: 'bg-emerald-50', text: 'text-emerald-700' },
    { label: 'Frequency', value: meter.freq, unit: 'Hz', icon: '〜', bg: 'bg-purple-50', text: 'text-purple-700' },
  ]

  // Stats from history
  const stats = METER_METRICS.map(m => {
    const vals = history.map(r => r[m.key]).filter(v => isFinite(v) && v !== 0)
    if (vals.length === 0) return { ...m, min: null, max: null, avg: null, count: 0 }
    return {
      ...m,
      min: Math.min(...vals),
      max: Math.max(...vals),
      avg: vals.reduce((a, b) => a + b, 0) / vals.length,
      count: vals.length,
    }
  })

  if (!isAuthenticated) {
    return <div className="h-full flex items-center justify-center"><div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-[#2B8DB8]" /></div>
  }

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm mb-6">
        <button onClick={() => router.push('/dashboard')} className="text-gray-500 hover:text-gray-800">Home</button>
        <span className="text-gray-400">›</span>
        <button onClick={() => router.push(`/device/${deviceId}/machines`)} className="text-gray-500 hover:text-gray-800 font-mono">{deviceId}</button>
        <span className="text-gray-400">›</span>
        <span className="text-gray-800 font-semibold">Consumption</span>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded text-white ml-1" style={{ backgroundColor: deviceType.color }}>
          {deviceType.shortLabel}
        </span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Energy Consumption</h1>
          <p className="text-sm text-gray-500 mt-1">
            {meterConnected
              ? `Last updated: ${meter.lastUpdated ?? '--'}`
              : 'Waiting for energy meter data'}
          </p>
        </div>
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold ${meterConnected ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
          <div className={`w-2 h-2 rounded-full ${meterConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
          {meterConnected ? 'Meter Online' : 'Meter Offline'}
        </div>
      </div>

      {/* Live Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map(card => (
          <div key={card.label} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-gray-500">{card.label}</span>
              <span className={`w-8 h-8 rounded-lg ${card.bg} flex items-center justify-center text-base`}>{card.icon}</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className={`text-3xl font-bold ${card.value !== null ? card.text : 'text-gray-300'}`}>
                {card.value !== null ? card.value.toFixed(2) : '--'}
              </span>
              {card.unit && <span className="text-sm text-gray-400 font-medium">{card.unit}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Report Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <h2 className="text-lg font-semibold text-gray-800">Consumption Report</h2>
          <div className="flex flex-wrap items-center gap-2">
            {RANGE_OPTIONS.map(opt => (
              <button
                key={opt.key}
                onClick={() => { setHistoryRange(opt.key); setFetched(false) }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  historyRange === opt.key
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom date pickers */}
        {historyRange === 'custom' && (
          <div className="flex flex-wrap items-end gap-3 mb-6">
            <div>
              <label className="text-xs text-gray-500 block mb-1">From</label>
              <input type="datetime-local" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">To</label>
              <input type="datetime-local" value={customTo} onChange={e => setCustomTo(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
            </div>
          </div>
        )}

        {/* Fetch Button */}
        <button
          onClick={fetchHistory}
          disabled={historyLoading}
          className="mb-6 flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {historyLoading ? (
            <><div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white" /> Fetching...</>
          ) : (
            <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg> Fetch Report</>
          )}
        </button>

        {/* Stats Table + Export */}
        {fetched && history.length > 0 && (
          <>
            <div className="overflow-x-auto mb-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 text-gray-500 font-medium">Parameter</th>
                    <th className="text-left py-2 px-3 text-gray-500 font-medium">Unit</th>
                    <th className="text-right py-2 px-3 text-gray-500 font-medium">Points</th>
                    <th className="text-right py-2 px-3 text-gray-500 font-medium">Min</th>
                    <th className="text-right py-2 px-3 text-gray-500 font-medium">Max</th>
                    <th className="text-right py-2 px-3 text-gray-500 font-medium">Avg</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map(s => (
                    <tr key={s.key} className="border-b border-gray-50">
                      <td className="py-2 px-3 font-medium" style={{ color: s.color }}>{s.label}</td>
                      <td className="py-2 px-3 text-gray-400">{s.unit}</td>
                      <td className="py-2 px-3 text-right text-gray-600">{s.count}</td>
                      <td className="py-2 px-3 text-right text-gray-600">{s.min !== null ? s.min.toFixed(3) : '--'}</td>
                      <td className="py-2 px-3 text-right text-gray-600">{s.max !== null ? s.max.toFixed(3) : '--'}</td>
                      <td className="py-2 px-3 text-right text-gray-600">{s.avg !== null ? s.avg.toFixed(3) : '--'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Export Buttons */}
            <div className="flex items-center gap-3">
              <button onClick={exportCSV}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Export CSV
              </button>
              <button onClick={exportExcel} disabled={exporting}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {exporting ? 'Exporting...' : 'Export Excel'}
              </button>
              <span className="text-xs text-gray-400">{history.length} readings</span>
            </div>
          </>
        )}

        {/* No data after fetch */}
        {fetched && history.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">No meter readings found for this period</p>
        )}
      </div>

      {/* Empty state for no meter at all */}
      {!meterConnected && !fetched && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center mt-6">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-700 mb-1">No Energy Meter Connected</h3>
          <p className="text-sm text-gray-400 max-w-md mx-auto">
            Connect the RS485 energy meter. Data will appear here automatically once readings are received.
          </p>
        </div>
      )}
    </div>
  )
}

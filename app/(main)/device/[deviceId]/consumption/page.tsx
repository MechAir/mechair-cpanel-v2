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

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://cpanel.backend.mechair.co.in/api'

export default function ConsumptionPage() {
  const router = useRouter()
  const params = useParams()
  const deviceId = params?.deviceId as string
  const deviceType = getDeviceType(deviceId)

  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [meter, setMeter] = useState<MeterData>({ amp: null, watts: null, kwh: null, freq: null, lastUpdated: null })

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
        if (data.success && data.data?.reading?.meter) {
          const m = data.data.reading.meter
          setMeter({
            amp: m.amp ?? null,
            watts: m.w ?? m.watts ?? null,
            kwh: m.kwh ?? null,
            freq: m.freq ?? null,
            lastUpdated: data.data.reading.timestamp ?? null,
          })
        }
      } catch {}
    }
    fetchLatest()
  }, [isAuthenticated, deviceId])

  // Live updates via IoT WebSocket
  useIoT(
    [`devices/${deviceId}/readings`],
    useCallback(({ topic, payload }) => {
      if (topic.endsWith('/readings') && payload.meter) {
        const m = payload.meter
        setMeter({
          amp: m.amp ?? null,
          watts: m.w ?? m.watts ?? null,
          kwh: m.kwh ?? null,
          freq: m.freq ?? null,
          lastUpdated: new Date().toLocaleTimeString(),
        })
      }
    }, [])
  )

  const meterConnected = meter.amp !== null || meter.watts !== null || meter.kwh !== null || meter.freq !== null

  const cards = [
    { label: 'Current', value: meter.amp, unit: 'A', icon: '⚡', bg: 'bg-amber-50', text: 'text-amber-700' },
    { label: 'Active Power', value: meter.watts, unit: 'kW', icon: '🔌', bg: 'bg-blue-50', text: 'text-blue-700' },
    { label: 'Energy', value: meter.kwh, unit: 'kWh', icon: '📊', bg: 'bg-emerald-50', text: 'text-emerald-700' },
    { label: 'Frequency', value: meter.freq, unit: 'Hz', icon: '〜', bg: 'bg-purple-50', text: 'text-purple-700' },
  ]

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

      {/* Metric Cards */}
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

      {/* Empty state */}
      {!meterConnected && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
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

'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

interface RangeReading {
    timestamp: string
    triggerco2?: boolean
    triggerc2h4?: boolean
    room1: { temp: number; CO2: number; O2: number; c2h4: number }
    room2: { temp: number; CO2: number; O2: number; c2h4: number }
    room3: { temp: number; CO2: number; O2: number; c2h4: number }
    room4: { temp: number; CO2: number; O2: number; c2h4: number }
}

type ReportRange = '1d' | '1w' | '1m' | '3m' | 'custom'

const RANGE_OPTIONS: { key: ReportRange; label: string }[] = [
    { key: '1d', label: 'Last 24 Hours' },
    { key: '1w', label: 'Last 7 Days' },
    { key: '1m', label: 'Last 1 Month' },
    { key: '3m', label: 'Last 3 Months' },
    { key: 'custom', label: 'Custom Range' },
]

function buildApiParams(range: ReportRange, customFrom: string, customTo: string): URLSearchParams | null {
    const params = new URLSearchParams({ maxPoints: '120' })
    const now = new Date()
    switch (range) {
        case '1d':
            params.set('mode', 'custom')
            params.set('from', new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString())
            params.set('to', now.toISOString())
            break
        case '1w':
            params.set('mode', 'custom')
            params.set('from', new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString())
            params.set('to', now.toISOString())
            break
        case '1m':
            params.set('mode', 'month')
            break
        case '3m':
            params.set('mode', 'custom')
            params.set('from', new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString())
            params.set('to', now.toISOString())
            break
        case 'custom':
            if (!customFrom || !customTo) return null
            params.set('mode', 'custom')
            params.set('from', new Date(customFrom).toISOString())
            params.set('to', new Date(customTo).toISOString())
            break
    }
    return params
}

const METRICS = [
    { key: 'temp', label: 'Temperature', unit: '°C', color: '#2563EB', decimals: 1 },
    { key: 'CO2', label: 'Carbon Dioxide (CO₂)', unit: 'ppm', color: '#1E3A8A', decimals: 0 },
    { key: 'O2', label: 'Humidity', unit: '%', color: '#818CF8', decimals: 2 },
    { key: 'C2H4', label: 'Ethylene (C₂H₄)', unit: 'ppm', color: '#F59E0B', decimals: 2 },
] as const

type MetricKey = 'temp' | 'CO2' | 'O2' | 'C2H4'

const ROOM_PREFIX: Record<string, string> = { '1': 'R1', '2': 'R2', '3': 'R3', '4': 'R4' }
const TRIGGER_COLOR = '#EF4444'

function extractMetric(r: RangeReading, roomKey: string, key: MetricKey): number {
    const idx = parseInt(roomKey.replace('R', ''), 10)
    const room = (r as unknown as Record<string, { temp: number; CO2: number; O2: number; c2h4: number }>)[`room${idx}`]
    if (!room) return 0
    if (key === 'temp') return isFinite(room.temp) ? room.temp : 0
    if (key === 'CO2') return isFinite(room.CO2) ? room.CO2 : 0
    if (key === 'O2') return isFinite(room.O2) ? room.O2 : 0
    // C2H4: API returns lowercase c2h4, also guard against undefined/NaN
    const val = room.c2h4 ?? (room as unknown as Record<string, number>)['C2H4']
    return isFinite(val) ? val : 0
}

function minMax(vals: number[]): { min: number; max: number; avg: number } {
    if (!vals.length) return { min: 0, max: 0, avg: 0 }
    const min = Math.min(...vals), max = Math.max(...vals)
    return { min, max, avg: vals.reduce((a, b) => a + b, 0) / vals.length }
}

/**
 * Draw a chart on canvas with per-point trigger coloring.
 * Triggered points draw a red dot and the segment to/from them is red.
 */
function drawChart(
    canvas: HTMLCanvasElement,
    data: number[],
    labels: string[],
    triggers: boolean[],  // same length as data
    color: string,
    label: string,
    unit: string,
    decimals: number
) {
    const W = canvas.width, H = canvas.height
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, W, H)

    const PAD_LEFT = 52, PAD_RIGHT = 16, PAD_TOP = 32, PAD_BOTTOM = 36
    const CW = W - PAD_LEFT - PAD_RIGHT
    const CH = H - PAD_TOP - PAD_BOTTOM

    // Has any trigger?
    const anyTriggered = triggers.some(Boolean)

    // Title
    ctx.fillStyle = '#374151'
    ctx.font = 'bold 13px Inter, system-ui, sans-serif'
    ctx.fillText(label, PAD_LEFT, 20)

    // Triggered badge
    if (anyTriggered) {
        const badgeX = PAD_LEFT + ctx.measureText(label).width + 8
        ctx.fillStyle = '#FEF2F2'
        const badgeW = 70
        roundRect(ctx, badgeX, 8, badgeW, 16, 4)
        ctx.fill()
        ctx.fillStyle = TRIGGER_COLOR
        ctx.font = 'bold 9px Inter, system-ui, sans-serif'
        ctx.fillText('⚠ TRIGGERED', badgeX + 5, 19)
        ctx.font = 'bold 13px Inter, system-ui, sans-serif'
    }

    if (data.length < 2) {
        ctx.fillStyle = '#94A3B8'
        ctx.font = '12px Inter, system-ui, sans-serif'
        ctx.fillText('No data', PAD_LEFT + CW / 2 - 25, PAD_TOP + CH / 2)
        return
    }

    const lo = Math.min(...data), hi = Math.max(...data)
    const spread = hi - lo
    const pad = spread < 1e-6 ? Math.abs(lo) * 0.1 || 1 : spread * 0.3
    const slo = lo - pad, shi = hi + pad

    const xOf = (i: number) => PAD_LEFT + (i / (data.length - 1)) * CW
    const yOf = (v: number) => PAD_TOP + CH - ((v - slo) / (shi - slo)) * CH

    // Grid lines
    ctx.strokeStyle = '#F1F5F9'; ctx.lineWidth = 1
    for (let i = 0; i < 5; i++) {
        const y = PAD_TOP + (i / 4) * CH
        ctx.beginPath(); ctx.moveTo(PAD_LEFT, y); ctx.lineTo(PAD_LEFT + CW, y); ctx.stroke()
        const val = shi - (i / 4) * (shi - slo)
        ctx.fillStyle = '#CBD5E1'; ctx.font = '9px Inter, system-ui, sans-serif'
        ctx.textAlign = 'right'
        ctx.fillText(Math.abs(val) >= 100 ? val.toFixed(0) : Math.abs(val) >= 10 ? val.toFixed(1) : val.toFixed(2), PAD_LEFT - 4, y + 3)
    }
    ctx.textAlign = 'left'

    // Area fill (base color only)
    ctx.beginPath()
    ctx.moveTo(xOf(0), yOf(data[0]))
    data.forEach((v, i) => { if (i > 0) ctx.lineTo(xOf(i), yOf(v)) })
    ctx.lineTo(xOf(data.length - 1), PAD_TOP + CH)
    ctx.lineTo(xOf(0), PAD_TOP + CH)
    ctx.closePath()
    const grad = ctx.createLinearGradient(0, PAD_TOP, 0, PAD_TOP + CH)
    grad.addColorStop(0, color + '28'); grad.addColorStop(1, color + '04')
    ctx.fillStyle = grad; ctx.fill()

    // Draw segments — each segment colored based on whether either endpoint is triggered
    ctx.lineWidth = 2.5
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'
    for (let i = 0; i < data.length - 1; i++) {
        const red = triggers[i] || triggers[i + 1]
        ctx.strokeStyle = red ? TRIGGER_COLOR : color
        ctx.beginPath()
        ctx.moveTo(xOf(i), yOf(data[i]))
        ctx.lineTo(xOf(i + 1), yOf(data[i + 1]))
        ctx.stroke()
    }

    // Dots — triggered = red filled, normal = white filled with base stroke
    const dotStep = Math.max(1, Math.floor(data.length / 20))
    data.forEach((v, i) => {
        const isTriggered = triggers[i]
        const showDot = isTriggered || i % dotStep === 0 || i === 0 || i === data.length - 1
        if (!showDot) return

        const x = xOf(i), y = yOf(v)
        const dotColor = isTriggered ? TRIGGER_COLOR : color
        const dotR = isTriggered ? 5 : 3.5

        // Halo for triggered points
        if (isTriggered) {
            ctx.beginPath()
            ctx.arc(x, y, dotR + 4, 0, Math.PI * 2)
            ctx.strokeStyle = TRIGGER_COLOR + '40'
            ctx.lineWidth = 1.5
            ctx.stroke()
        }

        ctx.beginPath()
        ctx.arc(x, y, dotR, 0, Math.PI * 2)
        ctx.fillStyle = isTriggered ? TRIGGER_COLOR : '#FFFFFF'
        ctx.fill()
        ctx.strokeStyle = dotColor
        ctx.lineWidth = isTriggered ? 2.5 : 2
        ctx.stroke()
    })

    // X-axis labels
    ctx.fillStyle = '#CBD5E1'; ctx.font = '8px Inter, system-ui, sans-serif'; ctx.textAlign = 'center'
    const step = Math.max(1, Math.floor(labels.length / 8))
    labels.forEach((lbl, i) => {
        if (i % step !== 0 && i !== labels.length - 1) return
        ctx.fillText(lbl, xOf(i), PAD_TOP + CH + 14)
    })
    ctx.textAlign = 'left'
}

// Helper to draw rounded rects on canvas
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.lineTo(x + w - r, y)
    ctx.quadraticCurveTo(x + w, y, x + w, y + r)
    ctx.lineTo(x + w, y + h - r)
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
    ctx.lineTo(x + r, y + h)
    ctx.quadraticCurveTo(x, y + h, x, y + h - r)
    ctx.lineTo(x, y + r)
    ctx.quadraticCurveTo(x, y, x + r, y)
    ctx.closePath()
}

interface ReportModalProps {
    deviceId: string
    roomId: string
    onClose: () => void
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://cpanel.backend.mechair.co.in/api'

export default function ReportModal({ deviceId, roomId, onClose }: ReportModalProps) {
    const [selectedRange, setSelectedRange] = useState<ReportRange>('1w')
    const [customFrom, setCustomFrom] = useState('')
    const [customTo, setCustomTo] = useState('')
    const [loading, setLoading] = useState(false)
    const [generating, setGenerating] = useState(false)
    const [previewData, setPreviewData] = useState<{
        temp: number[]; co2: number[]; o2: number[]; c2h4: number[]
        labels: string[]
        rawTimestamps: string[]
        // Per-reading trigger arrays
        triggersCO2: boolean[]
        triggersC2H4: boolean[]
    } | null>(null)
    const [error, setError] = useState('')

    const canvasRefs = {
        temp: useRef<HTMLCanvasElement>(null),
        CO2: useRef<HTMLCanvasElement>(null),
        O2: useRef<HTMLCanvasElement>(null),
        C2H4: useRef<HTMLCanvasElement>(null),
    }

    const fetchData = useCallback(async () => {
        setLoading(true); setError(''); setPreviewData(null)
        try {
            const params = buildApiParams(selectedRange, customFrom, customTo)
            if (!params) { setError('Please select both From and To dates.'); setLoading(false); return }

            const res = await fetch(`${API_BASE}/devices/${deviceId}/readings/range?${params}`)
            if (!res.ok) {
                const body = await res.json().catch(() => ({}))
                throw new Error(body.message ?? `HTTP ${res.status}`)
            }
            const json = await res.json()
            if (!json.success) throw new Error(json.message ?? 'API returned failure')

            const readings: RangeReading[] = json.data.readings ?? []
            const roomKey = ROOM_PREFIX[roomId] ?? 'R1'

            const formatLabel = (ts: string) => {
                const d = new Date(ts)
                if (selectedRange === '1d') return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
            }

            setPreviewData({
                temp: readings.map(r => extractMetric(r, roomKey, 'temp')),
                co2: readings.map(r => extractMetric(r, roomKey, 'CO2')),
                o2: readings.map(r => extractMetric(r, roomKey, 'O2')),
                c2h4: readings.map(r => extractMetric(r, roomKey, 'C2H4')),
                labels: readings.map(r => formatLabel(r.timestamp)),
                rawTimestamps: readings.map(r => r.timestamp),
                // Each reading has its own trigger flag inside the corresponding room object
                triggersCO2: readings.map(r => !!(r as any)[`room${parseInt(roomKey.replace('R', ''), 10)}`]?.triggerco2),
                triggersC2H4: readings.map(r => !!(r as any)[`room${parseInt(roomKey.replace('R', ''), 10)}`]?.triggerc2h4),
            })
        } catch (e) {
            setError(`Failed to fetch data: ${e instanceof Error ? e.message : 'Unknown error'}`)
        } finally { setLoading(false) }
    }, [selectedRange, customFrom, customTo, deviceId, roomId])

    // Draw charts with per-point trigger coloring
    useEffect(() => {
        if (!previewData) return
        const noTriggers = previewData.temp.map(() => false)

        const entries: [MetricKey, number[], boolean[]][] = [
            ['temp', previewData.temp, noTriggers],
            ['CO2', previewData.co2, previewData.triggersCO2],
            ['O2', previewData.o2, noTriggers],
            ['C2H4', previewData.c2h4, previewData.triggersC2H4],
        ]
        entries.forEach(([key, data, triggers]) => {
            const meta = METRICS.find(m => m.key === key)!
            const canvas = canvasRefs[key].current
            if (canvas) drawChart(canvas, data, previewData.labels, triggers, meta.color, meta.label, meta.unit, meta.decimals)
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [previewData])

    const generatePDF = useCallback(async () => {
        if (!previewData) return
        setGenerating(true)
        try {
            const { default: jsPDF } = await import('jspdf')
            const { default: autoTable } = await import('jspdf-autotable')

            const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
            const PW = doc.internal.pageSize.getWidth()
            const PH = doc.internal.pageSize.getHeight()

            const rangeLabel = RANGE_OPTIONS.find(o => o.key === selectedRange)?.label ?? 'Custom'
            const generatedAt = new Date().toLocaleString()
            const roomLabel = `Room ${roomId}`

            const anyTriggerCO2 = previewData.triggersCO2.some(Boolean)
            const anyTriggerC2H4 = previewData.triggersC2H4.some(Boolean)
            const triggerCount = (anyTriggerCO2 ? 1 : 0) + (anyTriggerC2H4 ? 1 : 0)
            const co2TriggerCount = previewData.triggersCO2.filter(Boolean).length
            const c2h4TriggerCount = previewData.triggersC2H4.filter(Boolean).length

            const drawHeaderFooter = (pageNum: number, totalPages: number) => {
                doc.setFillColor(43, 141, 184)
                doc.rect(0, 0, PW, 18, 'F')
                doc.setTextColor(255, 255, 255)
                doc.setFontSize(13)
                doc.setFont('helvetica', 'bold')
                doc.text('Mech Air — Sensor Report', 14, 11.5)
                doc.setFontSize(8)
                doc.setFont('helvetica', 'normal')
                doc.text(`${roomLabel} · ${rangeLabel}`, PW - 14, 11.5, { align: 'right' })
                doc.setFillColor(241, 245, 249)
                doc.rect(0, PH - 12, PW, 12, 'F')
                doc.setTextColor(148, 163, 184)
                doc.setFontSize(8)
                doc.setFont('helvetica', 'normal')
                doc.text(`Generated: ${generatedAt}`, 14, PH - 4.5)
                doc.text(`Page ${pageNum} of ${totalPages}`, PW - 14, PH - 4.5, { align: 'right' })
                doc.text('Mech Air IoT Platform · Confidential', PW / 2, PH - 4.5, { align: 'center' })
            }

            drawHeaderFooter(1, 2)

            // Trigger alert banner on page 1 if any
            let titleY = 30
            if (anyTriggerCO2 || anyTriggerC2H4) {
                doc.setFillColor(254, 226, 226)
                doc.roundedRect(14, titleY, PW - 28, triggerCount === 2 ? 22 : 16, 2, 2, 'F')
                doc.setTextColor(185, 28, 28)
                doc.setFontSize(9)
                doc.setFont('helvetica', 'bold')
                let alertMsg = '! Trigger alerts in this period: '
                const parts = []
                if (anyTriggerCO2) parts.push(`CO2 (${co2TriggerCount} reading${co2TriggerCount > 1 ? 's' : ''})`)
                if (anyTriggerC2H4) parts.push(`C2H4 (${c2h4TriggerCount} reading${c2h4TriggerCount > 1 ? 's' : ''})`)
                alertMsg += parts.join(', ') + '. Red points on charts indicate triggered readings.'
                const alertLines = doc.splitTextToSize(alertMsg, PW - 40)
                const alertBoxH = Math.max(16, alertLines.length * 5 + 10)
                doc.setFillColor(254, 226, 226)
                doc.roundedRect(14, titleY, PW - 28, alertBoxH, 2, 2, 'F')
                doc.setTextColor(185, 28, 28)
                doc.setFontSize(9)
                doc.setFont('helvetica', 'bold')
                doc.text(alertLines, 18, titleY + 7)
                titleY += alertBoxH + 4
            }

            doc.setTextColor(30, 58, 138)
            doc.setFontSize(20)
            doc.setFont('helvetica', 'bold')
            doc.text('Sensor Analytics Report', 14, titleY + 8)

            doc.setTextColor(100, 116, 139)
            doc.setFontSize(10)
            doc.setFont('helvetica', 'normal')
            doc.text(`Device: ${deviceId}   |   ${roomLabel}   |   Period: ${rangeLabel}`, 14, titleY + 16)
            doc.text(`Data points: ${previewData.labels.length}   |   Generated: ${generatedAt}`, 14, titleY + 22)

            doc.setDrawColor(226, 232, 240)
            doc.setLineWidth(0.5)
            doc.line(14, titleY + 26, PW - 14, titleY + 26)

            const chartW = (PW - 14 - 14 - 6) / 2
            const chartH = 52
            const gapX = 6, gapY = 6
            const startY = titleY + 30

            doc.setTextColor(30, 58, 138); doc.setFontSize(11); doc.setFont('helvetica', 'bold')
            doc.text('Metric Graphs', 14, startY - 2)

            const chartPairs: MetricKey[] = ['temp', 'CO2', 'O2', 'C2H4']
            for (let idx = 0; idx < 4; idx++) {
                const key = chartPairs[idx]
                const canvas = canvasRefs[key].current
                if (!canvas) continue

                const col = idx % 2, row = Math.floor(idx / 2)
                const x = 14 + col * (chartW + gapX)
                const y = startY + 4 + row * (chartH + gapY)

                doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.3)
                doc.roundedRect(x, y, chartW, chartH, 2, 2, 'S')

                const imgData = canvas.toDataURL('image/png')
                doc.addImage(imgData, 'PNG', x + 1, y + 1, chartW - 2, chartH - 2)
            }

            const tableY = startY + 4 + 2 * (chartH + gapY) + 8
            doc.setTextColor(30, 58, 138); doc.setFontSize(11); doc.setFont('helvetica', 'bold')
            doc.text('Statistical Summary', 14, tableY)

            const tableRows = METRICS.map(m => {
                const vals = m.key === 'temp' ? previewData.temp
                    : m.key === 'CO2' ? previewData.co2
                        : m.key === 'O2' ? previewData.o2
                            : previewData.c2h4
                const triggers = m.key === 'CO2' ? previewData.triggersCO2
                    : m.key === 'C2H4' ? previewData.triggersC2H4
                        : vals.map(() => false)
                const { min, max, avg } = minMax(vals)
                const trigCount = triggers.filter(Boolean).length
                return [
                    m.label,
                    m.unit,
                    vals.length.toString(),
                    min.toFixed(m.decimals),
                    max.toFixed(m.decimals),
                    avg.toFixed(m.decimals),

                ]
            })

            autoTable(doc, {
                startY: tableY + 4,
                head: [['Parameter', 'Unit', 'Points', 'Min', 'Max', 'Avg']],
                body: tableRows,
                styles: { fontSize: 9, cellPadding: 3, lineColor: [226, 232, 240], lineWidth: 0.3 },
                headStyles: { fillColor: [43, 141, 184], textColor: 255, fontStyle: 'bold', fontSize: 9 },
                alternateRowStyles: { fillColor: [241, 245, 249] },
                columnStyles: {
                    0: { fontStyle: 'bold', cellWidth: 44 },
                    1: { cellWidth: 14, halign: 'center' },
                    2: { cellWidth: 16, halign: 'center' },
                    3: { halign: 'right' }, 4: { halign: 'right' },
                    5: { halign: 'right' },
                },
                margin: { left: 14, right: 14 },
                theme: 'grid',
            })

            // Page 2
            doc.addPage()
            drawHeaderFooter(2, 2)

            let p2Y = 30

            if (anyTriggerCO2 || anyTriggerC2H4) {
                doc.setFillColor(254, 242, 242)
                doc.setFontSize(13); doc.setFont('helvetica', 'bold')
                const p2Title = '!! CRITICAL TRIGGER ALERTS DETECTED'
                const p2Lines: string[] = ['The following parameters exceeded safe thresholds during this reporting period:']
                if (anyTriggerCO2) p2Lines.push(`  - Carbon Dioxide (CO2): ${co2TriggerCount} triggered reading${co2TriggerCount > 1 ? 's' : ''} (shown in red on charts)`)
                if (anyTriggerC2H4) p2Lines.push(`  - Ethylene (C2H4): ${c2h4TriggerCount} triggered reading${c2h4TriggerCount > 1 ? 's' : ''} (shown in red on charts)`)
                const p2WrappedLines = p2Lines.flatMap(l => doc.splitTextToSize(l, PW - 44))
                const p2BoxH = 14 + p2WrappedLines.length * 6
                doc.setFillColor(254, 242, 242)
                doc.roundedRect(14, p2Y, PW - 28, p2BoxH, 2, 2, 'F')
                doc.setTextColor(220, 38, 38)
                doc.text(p2Title, 18, p2Y + 8)
                doc.setTextColor(153, 27, 27); doc.setFontSize(10); doc.setFont('helvetica', 'normal')
                doc.text(p2WrappedLines, 18, p2Y + 16)
                p2Y += p2BoxH + 8
            }

            doc.setTextColor(30, 58, 138); doc.setFontSize(14); doc.setFont('helvetica', 'bold')
            doc.text('Report Notes', 14, p2Y)
            doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.5); doc.line(14, p2Y + 4, PW - 14, p2Y + 4)

            doc.setTextColor(100, 116, 139); doc.setFontSize(10); doc.setFont('helvetica', 'normal')
            const lineH = 6.5
            const lines = [
                { text: 'This report was automatically generated by the Mech Air IoT Platform.', bold: false },
                { text: '', bold: false },
                { text: `Device ID:    ${deviceId}`, bold: false },
                { text: `Room:         ${roomLabel}`, bold: false },
                { text: `Report Range: ${rangeLabel}`, bold: false },
                { text: `Data Points:  ${previewData.labels.length}`, bold: false },
                { text: `CO2 Alert Readings:   ${co2TriggerCount}`, bold: false },
                { text: `C2H4 Alert Readings:  ${c2h4TriggerCount}`, bold: false },
                { text: `Generated:    ${generatedAt}`, bold: false },
                { text: '', bold: false },
                { text: 'Chart Color Key:', bold: true },
                { text: '  Normal readings are shown in the metric\'s standard color', bold: false },
                { text: '  Red dots and segments indicate triggered/alert readings', bold: false },
                { text: '  A red halo ring around a dot marks a triggered reading', bold: false },
                { text: '', bold: false },
                { text: 'Parameters monitored:', bold: true },
                { text: '  Temperature (degrees C)', bold: false },
                { text: '  Carbon Dioxide / CO2 (ppm)', bold: false },
                { text: '  Humidity (%)', bold: false },
                { text: '  Ethylene / C2H4 (ppm)', bold: false },
                { text: '', bold: false },
                { text: 'For questions or support, contact your Mech Air administrator.', bold: false },
            ]
            let noteY = p2Y + 12
            lines.forEach(({ text, bold }) => {
                if (bold) {
                    doc.setFont('helvetica', 'bold')
                    doc.setTextColor(71, 85, 105)
                } else {
                    doc.setFont('helvetica', 'normal')
                    doc.setTextColor(100, 116, 139)
                }
                doc.text(text, 14, noteY)
                noteY += lineH
            })

            // doc.setTextColor(241, 245, 249); doc.setFontSize(55); doc.setFont('helvetica', 'bold')
            // doc.text('Mech Air', PW / 2, PH / 2, { align: 'center', angle: 90 })

            const fileName = `Mech Air_Report_Room${roomId}_${selectedRange}_${Date.now()}.pdf`
            doc.save(fileName)
        } catch (e) {
            console.error('PDF generation failed:', e)
            setError('Failed to generate PDF. Please try again.')
        } finally { setGenerating(false) }
    }, [previewData, selectedRange, deviceId, roomId])

    const [exportingXlsx, setExportingXlsx] = useState(false)

    const exportExcel = useCallback(async () => {
        if (!previewData) return
        setExportingXlsx(true)
        try {
            const { utils, writeFile } = await import('xlsx')
            const rangeLabel = RANGE_OPTIONS.find(o => o.key === selectedRange)?.label ?? 'Custom'
            const generatedAt = new Date().toLocaleString()

            // Format timestamp as "12 April 2026 12:45:26"
            const formatFullDate = (ts: string | number) => {
                const d = new Date(ts)
                const day = d.getDate()
                const month = d.toLocaleString('en-US', { month: 'long' })
                const year = d.getFullYear()
                const hours = d.getHours().toString().padStart(2, '0')
                const mins = d.getMinutes().toString().padStart(2, '0')
                const secs = d.getSeconds().toString().padStart(2, '0')
                return `${day} ${month} ${year} ${hours}:${mins}:${secs}`
            }

            // Build reading rows with full timestamps
            const readingRows = (previewData.rawTimestamps || previewData.labels).map((ts: string, i: number) => ({
                _ts: new Date(ts).getTime(),
                _type: 'reading' as const,
                'Date & Time': formatFullDate(ts),
                'Type': 'Reading',
                'Temperature (°C)': previewData.temp[i] ?? '',
                'CO₂ (ppm)': previewData.co2[i] ?? '',
                'Humidity (%)': previewData.o2[i] ?? '',
                'C₂H₄ / Ethylene (ppm)': previewData.c2h4[i] ?? '',
                'CO₂ Triggered': previewData.triggersCO2[i] ? 'EXH-ON' : '',
                'C₂H₄ Triggered': previewData.triggersC2H4[i] ? 'SOV-ON' : '',
                'Event': '',
            }))

            // Fetch events for this device in the same time range
            let eventRows: any[] = []
            try {
                const params = buildApiParams(selectedRange, customFrom, customTo)
                if (params) {
                    const eventsRes = await fetch(`${API_BASE}/devices/${deviceId}/events/range?${params.toString()}`)
                    if (eventsRes.ok) {
                        const eventsJson = await eventsRes.json()
                        const events = eventsJson.data?.events || eventsJson.data || []
                        // Filter events to only this room (or device-level events with no room metric)
                        const currentRoomId = `room-${roomId}`
                        const filteredEvents = events.filter((evt: any) =>
                            !evt.metric ||
                            evt.metric === currentRoomId ||
                            (!evt.metric.startsWith('room-')) // device-wide events like mode/pump
                        )
                        eventRows = filteredEvents.map((evt: any) => ({
                            _ts: typeof evt.timestamp === 'number' ? evt.timestamp : new Date(evt.timestamp).getTime(),
                            _type: 'event' as const,
                            'Date & Time': formatFullDate(typeof evt.timestamp === 'number' ? evt.timestamp : evt.timestamp),
                            'Type': evt.eventType || 'Event',
                            'Temperature (°C)': '',
                            'CO₂ (ppm)': '',
                            'Humidity (%)': '',
                            'C₂H₄ / Ethylene (ppm)': '',
                            'CO₂ Triggered': '',
                            'C₂H₄ Triggered': '',
                            'Event': `[${evt.source || 'system'}] ${evt.note || evt.eventType || ''}`,
                        }))
                    }
                }
            } catch (e) {
                console.log('Events fetch failed (non-critical):', e)
            }

            // Merge readings + events sorted by timestamp
            const allRows = [...readingRows, ...eventRows]
                .sort((a, b) => a._ts - b._ts)
                .map(({ _ts, _type, ...row }) => row)

            const wsData = utils.json_to_sheet(allRows)
            wsData['!cols'] = [
                { wch: 28 }, { wch: 16 }, { wch: 18 }, { wch: 14 }, { wch: 12 }, { wch: 24 }, { wch: 14 }, { wch: 14 }, { wch: 40 }
            ]

            const summaryRows = METRICS.map(m => {
                const vals = m.key === 'temp' ? previewData.temp
                    : m.key === 'CO2' ? previewData.co2
                        : m.key === 'O2' ? previewData.o2
                            : previewData.c2h4
                const triggers = m.key === 'CO2' ? previewData.triggersCO2
                    : m.key === 'C2H4' ? previewData.triggersC2H4
                        : vals.map(() => false)
                const { min, max, avg } = minMax(vals)
                return {
                    'Parameter': m.label,
                    'Unit': m.unit,
                    'Data Points': vals.length,
                    'Minimum': parseFloat(min.toFixed(m.decimals)),
                    'Maximum': parseFloat(max.toFixed(m.decimals)),
                    'Average': parseFloat(avg.toFixed(m.decimals)),
                    'Range': parseFloat((max - min).toFixed(m.decimals)),
                    'Triggered Readings': triggers.filter(Boolean).length,
                }
            })

            const wsSummary = utils.json_to_sheet(summaryRows)
            wsSummary['!cols'] = [
                { wch: 28 }, { wch: 8 }, { wch: 12 },
                { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 18 }
            ]

            const infoRows = [
                { 'Field': 'Device ID', 'Value': deviceId },
                { 'Field': 'Room', 'Value': `Room ${roomId}` },
                { 'Field': 'Report Range', 'Value': rangeLabel },
                { 'Field': 'Data Points', 'Value': previewData.labels.length },
                { 'Field': 'Events Logged', 'Value': eventRows.length },
                { 'Field': 'CO₂ Triggered Readings', 'Value': previewData.triggersCO2.filter(Boolean).length },
                { 'Field': 'C₂H₄ Triggered Readings', 'Value': previewData.triggersC2H4.filter(Boolean).length },
                { 'Field': 'Generated', 'Value': formatFullDate(new Date().toISOString()) },
                { 'Field': 'Platform', 'Value': 'Mech Air IoT Platform' },
            ]
            const wsInfo = utils.json_to_sheet(infoRows)
            wsInfo['!cols'] = [{ wch: 22 }, { wch: 36 }]

            const wb = utils.book_new()
            utils.book_append_sheet(wb, wsData, 'Data')
            utils.book_append_sheet(wb, wsSummary, 'Summary')
            utils.book_append_sheet(wb, wsInfo, 'Info')

            const fileName = `Mech_Air_Room${roomId}_${selectedRange}_${Date.now()}.xlsx`
            writeFile(wb, fileName)
        } catch (e) {
            console.error('Excel export failed:', e)
            setError('Failed to export Excel. Please try again.')
        } finally { setExportingXlsx(false) }
    }, [previewData, selectedRange, deviceId, roomId, customFrom, customTo])

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-[#EBF5FB] flex items-center justify-center">
                            <svg className="w-5 h-5 text-[#2B8DB8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-gray-800">Generate Report</h2>
                            <p className="text-xs text-gray-400">Room {roomId} · PDF with charts &amp; statistics</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                    <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-widest block mb-3">Select Report Period</label>
                        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                            {RANGE_OPTIONS.map(opt => (
                                <button key={opt.key} onClick={() => setSelectedRange(opt.key)}
                                    className={`px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 border
                                    ${selectedRange === opt.key
                                            ? 'bg-[#2B8DB8] border-[#2B8DB8] text-white shadow-md'
                                            : 'bg-white border-gray-200 text-gray-600 hover:border-[#2B8DB8] hover:text-[#2B8DB8]'}`}>
                                    {opt.label}
                                </button>
                            ))}
                        </div>

                        {selectedRange === 'custom' && (
                            <div className="mt-3 grid grid-cols-2 gap-3 p-4 bg-gray-50 rounded-xl border border-gray-200">
                                <div>
                                    <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">From</label>
                                    <input type="datetime-local" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#2B8DB8] bg-white" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">To</label>
                                    <input type="datetime-local" value={customTo} onChange={e => setCustomTo(e.target.value)}
                                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#2B8DB8] bg-white" />
                                </div>
                            </div>
                        )}
                    </div>

                    {error && (
                        <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 flex items-center gap-2">
                            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {error}
                        </div>
                    )}

                    <button onClick={fetchData} disabled={loading}
                        className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#EBF5FB] border border-[#2B8DB8]/30 text-[#2B8DB8] font-semibold text-sm hover:bg-[#2B8DB8] hover:text-white transition-all duration-200 disabled:opacity-60">
                        {loading ? (
                            <><div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />Fetching data…</>
                        ) : (
                            <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>Fetch Data for Preview</>
                        )}
                    </button>

                    {previewData && (
                        <>
                            {/* Trigger summary banner */}
                            {(previewData.triggersCO2.some(Boolean) || previewData.triggersC2H4.some(Boolean)) && (
                                <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-xs font-bold text-red-700 uppercase tracking-wider">⚠ Triggered Readings Detected</span>
                                    </div>
                                    <div className="text-xs text-red-600 space-y-0.5">
                                        {previewData.triggersCO2.some(Boolean) && (
                                            <div>CO₂: <strong>{previewData.triggersCO2.filter(Boolean).length}</strong> triggered reading{previewData.triggersCO2.filter(Boolean).length > 1 ? 's' : ''}</div>
                                        )}
                                        {previewData.triggersC2H4.some(Boolean) && (
                                            <div>C₂H₄: <strong>{previewData.triggersC2H4.filter(Boolean).length}</strong> triggered reading{previewData.triggersC2H4.filter(Boolean).length > 1 ? 's' : ''}</div>
                                        )}
                                        <div className="text-red-400 mt-1">Red dots on charts indicate triggered readings.</div>
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {METRICS.map(m => {
                                    const vals = m.key === 'temp' ? previewData.temp : m.key === 'CO2' ? previewData.co2 : m.key === 'O2' ? previewData.o2 : previewData.c2h4
                                    const triggers = m.key === 'CO2' ? previewData.triggersCO2 : m.key === 'C2H4' ? previewData.triggersC2H4 : []
                                    const { min, max } = minMax(vals)
                                    const hasTrigger = triggers.some(Boolean)
                                    return (
                                        <div key={m.key} className={`rounded-xl p-3 border text-center ${hasTrigger ? 'border-red-200 bg-red-50' : 'border-gray-100 bg-gray-50'}`}>
                                            <div className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${hasTrigger ? 'text-red-400' : 'text-gray-400'}`}>{m.label.split(' ')[0]}</div>
                                            <div className="text-sm font-bold" style={{ color: hasTrigger ? '#EF4444' : m.color }}>{min.toFixed(m.decimals)} – {max.toFixed(m.decimals)}</div>
                                            <div className="text-[9px] text-gray-400 mt-0.5">{m.unit} · {vals.length} pts</div>
                                            {hasTrigger && <div className="text-[9px] text-red-500 font-semibold mt-0.5">⚠ {triggers.filter(Boolean).length} alert{triggers.filter(Boolean).length > 1 ? 's' : ''}</div>}
                                        </div>
                                    )
                                })}
                            </div>

                            <div>
                                <label className="text-xs font-semibold text-gray-500 uppercase tracking-widest block mb-2">
                                    Chart Preview <span className="text-red-400 font-normal normal-case">· red = triggered reading</span>
                                </label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {(['temp', 'CO2', 'O2', 'C2H4'] as MetricKey[]).map(key => (
                                        <div key={key} className="rounded-xl overflow-hidden border border-gray-100 shadow-sm">
                                            <canvas ref={canvasRefs[key]} width={480} height={200}
                                                style={{ width: '100%', height: 'auto', display: 'block' }} />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <div className="px-4 sm:px-6 py-4 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <p className="text-xs text-gray-400">
                        {previewData ? `${previewData.labels.length} data points ready` : 'Fetch data first to generate PDF'}
                    </p>
                    <div className="flex gap-2 sm:gap-3 flex-wrap">
                        <button onClick={onClose} className="px-4 sm:px-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors">
                            Cancel
                        </button>
                        <button onClick={exportExcel} disabled={!previewData || exportingXlsx}
                            className="flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-all duration-200 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
                            {exportingXlsx ? (
                                <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Exporting…</>
                            ) : (
                                <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>Export Excel</>
                            )}
                        </button>
                        <button onClick={generatePDF} disabled={!previewData || generating}
                            className="flex items-center gap-2 px-4 sm:px-6 py-2.5 rounded-xl bg-[#2B8DB8] text-white text-sm font-semibold transition-all duration-200 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
                            {generating ? (
                                <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Generating…</>
                            ) : (
                                <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>Download PDF</>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

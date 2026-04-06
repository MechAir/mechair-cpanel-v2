'use client'

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
}

interface RoomCardProps {
  room: RoomData
  onToggleSov?: (e: React.MouseEvent) => void
  onToggleExh?: (e: React.MouseEvent) => void
  isManualMode?: boolean
  hasPendingSov?: boolean    // manual mode: SOV change staged
  hasPendingExh?: boolean    // manual mode: Exh change staged
  hasPendingChange?: boolean // auto mode: any change staged via Reset
}

export default function RoomCard({
  room,
  onToggleSov,
  onToggleExh,
  isManualMode = false,
  hasPendingSov = false,
  hasPendingExh = false,
  hasPendingChange = false,
}: RoomCardProps) {
  const bgColor = isManualMode
    ? 'bg-[#2B5F75] opacity-90'
    : room.isOn
      ? 'bg-[#4185B8]'
      : 'bg-[#2B5F75]'

  return (
    <div className={`${bgColor} rounded-xl shadow-lg p-5 w-full text-white transition-all duration-300 hover:scale-[1.02] relative`}>

      {/* Pending change indicator (auto mode, staged via Reset) */}
      {hasPendingChange && (
        <span className="absolute top-3 right-3 h-2 w-2 rounded-full bg-amber-400 shadow" />
      )}

      {/* Room Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="text-left">
          <h3 className="text-white text-xl font-medium tracking-wide">{room.name}</h3>
          <p className="text-white/80 text-sm mt-1">
            {isManualMode
              ? <span className="text-amber-300 text-xs font-medium">Manual mode</span>
              : room.isOn ? 'On' : 'Off'
            }
          </p>
        </div>
        <div className={`w-3 h-3 rounded-full shadow-sm ${isManualMode ? 'bg-white/30' : room.isOn ? 'bg-green-400' : 'bg-red-400'
          }`} />
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-y-2.5 gap-x-4 mb-5 text-[14px] bg-white/10 rounded-lg p-3">
        <div className="text-left">
          <span className="text-white/70 text-xs block">Temp</span>
          <span className="font-semibold">{room.temp != null ? `${room.temp.toFixed(1)}°C` : '—'}</span>
        </div>
        <div className="text-right">
          <span className="text-white/70 text-xs block">Humid</span>
          <span className="font-semibold">{room.humid != null ? `${room.humid.toFixed(1)}%` : '—'}</span>
        </div>
        <div className="text-left">
          <span className="text-white/70 text-xs block">CO2</span>
          <span className="font-semibold">{room.co2 != null ? `${room.co2.toFixed(1)} ppm` : '—'}</span>
        </div>
        <div className="text-right">
          <span className="text-white/70 text-xs block">C2H4</span>
          <span className="font-semibold">{room.c2h4 != null ? `${room.c2h4.toFixed(2)} ppm` : '—'}</span>
        </div>
      </div>

      {/* SOV / Exh Buttons */}
      {isManualMode && (
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={onToggleSov}
            className={`py-2 px-3 rounded-lg text-sm font-medium transition-all shadow-sm
            flex items-center justify-center gap-2 border
            ${hasPendingSov
                ? 'bg-amber-500/30 border-amber-400/60 ring-1 ring-amber-400'
                : 'bg-white/15 hover:bg-white/25 border-white/20'
              }`}
          >
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${room.sovOn ? 'bg-green-400' : 'bg-red-400'}`} />
            SOV {room.sovOn ? 'ON' : 'OFF'}
            {hasPendingSov && <span className="ml-0.5 text-amber-300 text-[10px] font-bold">●</span>}
          </button>

          <button
            onClick={onToggleExh}
            className={`py-2 px-3 rounded-lg text-sm font-medium transition-all shadow-sm
            flex items-center justify-center gap-2 border
            ${hasPendingExh
                ? 'bg-amber-500/30 border-amber-400/60 ring-1 ring-amber-400'
                : 'bg-white/15 hover:bg-white/25 border-white/20'
              }`}
          >
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${room.exhOn ? 'bg-green-400' : 'bg-red-400'}`} />
            Exh {room.exhOn ? 'ON' : 'OFF'}
            {hasPendingExh && <span className="ml-0.5 text-amber-300 text-[10px] font-bold">●</span>}
          </button>
        </div>
      )}
    </div>
  )
}
// ==================== DEVICE TYPE REGISTRY ====================
// Room count is parsed from the deviceId: first 3 chars = type, next 2 = room count
// Example: EMS04260101 → type=ems, rooms=4 | MLH06250101 → type=mlh, rooms=6
//
// Only add new types here for sensors, relays, colors, and settings tabs.
// Room count is always auto-detected from the deviceId itself.

export interface DeviceTypeConfig {
  prefix: string
  rooms: number
  label: string
  shortLabel: string
  color: string
  badgeBg: string
  sensors: ('temp' | 'humidity' | 'co2' | 'o2' | 'c2h4')[]
  relays: ('sov' | 'exhaust' | 'compressor')[]
  settingsTabs: ('timings' | 'manual' | 'pump' | 'recipes' | 'limits' | 'enabled-rooms')[]
}

// Base configs — rooms is a fallback; actual room count comes from deviceId
export const DEVICE_TYPES: Record<string, DeviceTypeConfig> = {
  ems: {
    prefix: 'ems',
    rooms: 4, // fallback if digits missing
    label: 'Ethylene Management System',
    shortLabel: 'EMS',
    color: '#2B8DB8',
    badgeBg: 'bg-[#2B8DB8]',
    sensors: ['temp', 'co2', 'o2', 'c2h4'],
    relays: ['sov', 'exhaust'],
    settingsTabs: ['timings', 'manual', 'pump', 'recipes', 'limits'],
  },
  mlh: {
    prefix: 'mlh',
    rooms: 6, // fallback if digits missing
    label: 'Cold Room Management System',
    shortLabel: 'MLH',
    color: '#2D7D46',
    badgeBg: 'bg-emerald-700',
    sensors: ['temp', 'humidity'],
    relays: ['compressor', 'sov'],
    settingsTabs: ['timings', 'manual', 'enabled-rooms'],
  },
  // ── Add future device types below ──────────────────────────────
  // xyz: {
  //   prefix: 'xyz',
  //   rooms: 8, // fallback
  //   label: 'My New System',
  //   shortLabel: 'XYZ',
  //   color: '#7C3AED',
  //   badgeBg: 'bg-violet-700',
  //   sensors: ['temp', 'humidity', 'co2'],
  //   relays: ['sov', 'compressor'],
  //   settingsTabs: ['timings', 'manual', 'enabled-rooms'],
  // },
}

/**
 * Parse room count from deviceId characters 4-5 (zero-indexed 3-4).
 * EMS04260101 → 04 → 4 rooms
 * MLH06250101 → 06 → 6 rooms
 * XYZ08250101 → 08 → 8 rooms
 * Returns null if digits can't be parsed.
 */
function parseRoomCount(deviceId: string): number | null {
  if (!deviceId || deviceId.length < 5) return null
  const digits = deviceId.slice(3, 5)
  const num = parseInt(digits, 10)
  return isNaN(num) || num <= 0 ? null : num
}

// Detect device type from deviceId prefix + parse room count from digits
export function getDeviceType(deviceId: string): DeviceTypeConfig {
  const prefix = deviceId.toLowerCase().slice(0, 3)
  const base = DEVICE_TYPES[prefix] ?? DEVICE_TYPES['ems']
  const roomCount = parseRoomCount(deviceId)
  return {
    ...base,
    rooms: roomCount ?? base.rooms,
  }
}

// Check if a deviceId belongs to a specific type
export function isDeviceType(deviceId: string, type: string): boolean {
  return deviceId.toLowerCase().startsWith(type.toLowerCase())
}

// Get room labels for a device type
export function getRoomLabels(deviceType: DeviceTypeConfig): string[] {
  return Array.from({ length: deviceType.rooms }, (_, i) => `Room ${i + 1}`)
}

// Get room IDs for a device type (backend format)
export function getRoomIds(deviceType: DeviceTypeConfig): string[] {
  return Array.from({ length: deviceType.rooms }, (_, i) => `room-${i + 1}`)
}

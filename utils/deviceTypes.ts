// ==================== DEVICE TYPE REGISTRY ====================
// Add new device types here. That's the only place you need to touch
// when adding a new device family in the future.
//
// prefix     : first 3 letters of deviceId (lowercase) used for detection
// rooms      : number of rooms this device type has
// label      : human-readable name shown in UI
// shortLabel : short name shown on badges/cards
// color      : accent color for this device type (Tailwind hex)
// sensors    : which sensors each room has
// settingsTabs: which settings tabs to show for this device type

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

export const DEVICE_TYPES: Record<string, DeviceTypeConfig> = {
  ems: {
    prefix: 'ems',
    rooms: 4,
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
    rooms: 6,
    label: 'Cold Room Management System',
    shortLabel: 'MLH',
    color: '#2D7D46',
    badgeBg: 'bg-emerald-700',
    sensors: ['temp', 'humidity'],
    relays: ['compressor', 'sov'],
    settingsTabs: ['timings', 'manual', 'enabled-rooms'],
  },
  // ── Add future device types below ──────────────────────────────
  // abs: {
  //   prefix: 'abs',
  //   rooms: 8,
  //   label: 'Advanced Biosensor System',
  //   shortLabel: 'ABS',
  //   color: '#7C3AED',
  //   badgeBg: 'bg-violet-700',
  //   sensors: ['temp', 'humidity', 'co2'],
  //   relays: ['sov', 'compressor'],
  //   settingsTabs: ['timings', 'manual', 'enabled-rooms'],
  // },
}

// Detect device type from deviceId prefix
export function getDeviceType(deviceId: string): DeviceTypeConfig {
  const prefix = deviceId.toLowerCase().slice(0, 3)
  return DEVICE_TYPES[prefix] ?? DEVICE_TYPES['ems'] // default to EMS if unknown
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

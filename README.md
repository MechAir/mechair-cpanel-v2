# Mech Air Control Panel — Clone v2.0

Multi-device-type frontend for EMS and MLH IoT devices.

## Setup

```bash
npm install
cp .env.example .env.local
# Edit .env.local with your API URL
npm run dev
```

## Device Types

| Prefix | Type | Rooms | Sensors |
|--------|------|-------|---------|
| EMS | Ethylene Management System | 4 | Temp, CO2, O2, C2H4 |
| MLH | Cold Room Management System | 6 | Temp, Humidity |

Add new device types in `utils/deviceTypes.ts`.

## Build for production

```bash
npm run build
npm start
```

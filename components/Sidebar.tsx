'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useParams } from 'next/navigation'
import { isAdmin } from '@/utils/auth'
import { getDeviceType } from '@/utils/deviceTypes'

export default function Sidebar() {
  const pathname = usePathname()
  const params = useParams()
  const deviceId = params?.deviceId as string | undefined

  const [admin, setAdmin] = useState(false)

  useEffect(() => {
    setAdmin(isAdmin()) // isAdmin() returns true for both 'owner' and 'admin'
  }, [])

  const deviceType = deviceId ? getDeviceType(deviceId) : null

  let menuItems = deviceId ? [
    { name: 'Devices', icon: 'device', href: '/dashboard' },
    { name: 'Rooms', icon: 'room', href: `/device/${deviceId}/rooms` },
    { name: 'Graphs', icon: 'chart', href: `/device/${deviceId}/graphs` },
    { name: 'Settings', icon: 'settings', href: `/device/${deviceId}/settings` },
  ] : [
    { name: 'Devices', icon: 'device', href: '/dashboard' },
  ]

  if (!admin) {
    menuItems = menuItems.filter(item => item.name !== 'Devices')
  }

  const isActive = (href: string) => {
    if (href.endsWith('/rooms')) return pathname.includes('/rooms')
    if (href.endsWith('/graphs')) return pathname.includes('/graphs')
    return pathname === href
  }

  return (
    <aside className="w-64 bg-[#5A7C8C] min-h-screen flex flex-col">
      {/* Logo */}
      <div className="p-6 bg-[#4A6C7C]">
        <div className="bg-white rounded-lg p-3 flex items-center justify-center">
          <div className="flex items-center gap-2">
            <Image
              src="/logo.png"
              alt="Mech Air"
              width={60}
              height={40}
              className="w-20 h-20 object-contain"
            />
          </div>
        </div>
      </div>

      {/* Device type badge */}
      {deviceType && (
        <div className="mx-4 mt-3 px-3 py-2 rounded-lg bg-white/10 flex items-center gap-2">
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
            style={{ backgroundColor: deviceType.color }}
          >
            {deviceType.shortLabel}
          </span>
          <span className="text-white/70 text-xs truncate">{deviceId}</span>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6">
        <ul className="space-y-2">
          {menuItems.map((item) => (
            <li key={item.name}>
              <Link
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive(item.href)
                    ? 'bg-[#7DBFDD] text-white'
                    : 'text-white/80 hover:bg-[#4A6C7C]'
                }`}
              >
                {item.icon === 'device' && (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M3 5a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2h-2.22l.123.489.804.804A1 1 0 0113 18H7a1 1 0 01-.707-1.707l.804-.804L7.22 15H5a2 2 0 01-2-2V5zm5.771 7H5V5h10v7H8.771z" clipRule="evenodd" />
                  </svg>
                )}
                {item.icon === 'room' && (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM14 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2h-2z" />
                  </svg>
                )}
                {item.icon === 'chart' && (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
                  </svg>
                )}
                {item.icon === 'settings' && (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                  </svg>
                )}
                <span className="font-medium">{item.name}</span>
                {isActive(item.href) && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white opacity-80" />
                )}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* Footer */}
      <div className="px-4 pb-6">
        <div className="text-center text-white/30 text-[10px]">© 2026 Mech Air</div>
      </div>
    </aside>
  )
}

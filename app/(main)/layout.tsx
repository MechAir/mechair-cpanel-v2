'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import Header from '@/components/Header'
import { Poppins } from 'next/font/google'

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
})

export default function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()
  const isDashboard = pathname === '/dashboard'

  return (
    <div className={`${poppins.className} flex h-screen bg-gray-100`}>
      {/* Sidebar — hidden on dashboard */}
      {!isDashboard && (
  <>
    {/* Mobile overlay backdrop */}
    {sidebarOpen && (
      <div
        className="fixed inset-0 bg-black/40 z-20 md:hidden"
        onClick={() => setSidebarOpen(false)}
      />
    )}
    {/* Sidebar — overlay on mobile, push on desktop */}
    <div className={`
      fixed md:relative inset-y-0 left-0 z-30
      flex-shrink-0 transition-all duration-300
      ${sidebarOpen ? 'w-64 translate-x-0' : 'w-64 -translate-x-full md:w-0 md:translate-x-0'}
      overflow-hidden
    `}>
      <Sidebar />
    </div>
  </>
)}

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Header
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          sidebarOpen={sidebarOpen}
          showToggle={!isDashboard}
        />
<main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-100 p-3 sm:p-6">
{children}
        </main>
      </div>
    </div>
  )
}
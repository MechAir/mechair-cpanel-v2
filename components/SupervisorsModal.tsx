'use client'

import { useEffect, useState } from 'react'
import { authHeaders } from '@/utils/auth'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://cpanel.backend.mechair.co.in/api'

interface Supervisor {
  _id: string
  username: string
  plainPassword: string | null
  createdAt: string
}

export default function SupervisorsModal({ onClose }: { onClose: () => void }) {
  const [supervisors, setSupervisors] = useState<Supervisor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const fetch_ = async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/my-supervisors`, { headers: authHeaders() })
        const data = await res.json()
        if (data.success) setSupervisors(data.data)
        else setError(data.message || 'Failed to load')
      } catch {
        setError('Network error')
      } finally {
        setLoading(false)
      }
    }
    fetch_()
  }, [])

  const togglePassword = (id: string) =>
    setVisiblePasswords(prev => ({ ...prev, [id]: !prev[id] }))

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-800">My Supervisors</h2>
            <p className="text-xs text-gray-400 mt-0.5">{supervisors.length} supervisor{supervisors.length !== 1 ? 's' : ''} found</p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-5 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-8 h-8 border-2 border-[#5A7C8C] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error ? (
            <p className="text-sm text-red-500 text-center py-6">{error}</p>
          ) : supervisors.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-gray-500 text-sm">No supervisors added yet</p>
            </div>
          ) : (
            supervisors.map(sv => (
              <div key={sv._id} className="border border-gray-100 rounded-xl p-4 bg-white hover:border-[#5A7C8C]/30 transition-all">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center font-semibold text-sm shrink-0">
                    {sv.username.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-purple-50 text-purple-600 border border-purple-200">
                      Supervisor
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 ml-auto">
                    {new Date(sv.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 rounded-xl px-4 py-2.5">
                    <p className="text-xs text-gray-400 mb-0.5">Username</p>
                    <p className="text-sm font-semibold text-gray-800 font-mono">{sv.username}</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl px-4 py-2.5">
                    <div className="flex items-center justify-between mb-0.5">
                      <p className="text-xs text-gray-400">Password</p>
                      <button
                        onClick={() => togglePassword(sv._id)}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        {visiblePasswords[sv._id] ? (
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                          </svg>
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        )}
                      </button>
                    </div>
                    <p className="text-sm font-semibold text-gray-800 font-mono">
                      {visiblePasswords[sv._id] ? (sv.plainPassword ?? '—') : '••••••••'}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
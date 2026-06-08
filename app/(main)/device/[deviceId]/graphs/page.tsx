'use client'
import { useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'

// Redirects /device/[deviceId]/graphs → the correct room graphs page (room 1 as default)
export default function DeviceGraphsRedirect() {
  const router = useRouter()
  const params = useParams()
  const deviceId = params?.deviceId as string

  useEffect(() => {
    router.replace(`/device/${deviceId}/${deviceId.toLowerCase().startsWith('mlh') ? 'machine/s7' : deviceId.toLowerCase().startsWith('csm') ? '' : 'room/1/'}graphs/detailed`)
  }, [router, deviceId])

  return (
    <div className="h-full flex items-center justify-center">
      <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-[#2B8DB8]" />
    </div>
  )
}

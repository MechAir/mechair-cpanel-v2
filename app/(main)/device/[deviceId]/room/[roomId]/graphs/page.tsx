'use client'
import { useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'

// Redirects to the correct detailed graphs page
export default function RoomGraphsRedirect() {
  const router = useRouter()
  const params = useParams()
  const deviceId = params?.deviceId as string
  const roomId = params?.roomId as string

  useEffect(() => {
    router.replace(`/device/${deviceId}/${deviceId.toLowerCase().startsWith('mlh') ? 'machine' : 'room'}/${roomId}/graphs/detailed`)
  }, [router, deviceId, roomId])

  return (
    <div className="h-full flex items-center justify-center">
      <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-[#2B8DB8]" />
    </div>
  )
}

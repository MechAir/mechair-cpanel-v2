'use client'

import dynamic from 'next/dynamic'

const DetailedGraphsPage = dynamic(
  () => import('../../../room/[roomId]/graphs/detailed/page'),
  { ssr: false, loading: () => (
    <div className="h-full flex items-center justify-center">
      <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-[#2B8DB8]" />
    </div>
  )}
)

export default function MachineDetailedGraphsPage() {
  return <DetailedGraphsPage />
}

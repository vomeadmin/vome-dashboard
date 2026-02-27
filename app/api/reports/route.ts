import { NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import { type Report } from '@/lib/report-template'

function getRedis(): Redis {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    throw new Error('Upstash Redis environment variables are not configured')
  }
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  })
}

export async function GET() {
  try {
    const redis = getRedis()
    const ids = await redis.smembers('reports:index')

    if (!ids.length) return NextResponse.json({ reports: [] })

    const reports = await Promise.all(
      ids.map((id) => redis.get<Report>(`report:${id}`))
    )

    const sorted = reports
      .filter((r): r is Report => r !== null)
      .sort((a, b) => b.id.localeCompare(a.id)) // newest first

    return NextResponse.json({ reports: sorted })
  } catch (error) {
    console.error('[GET /api/reports]', error)
    return NextResponse.json({ error: 'Storage unavailable' }, { status: 503 })
  }
}

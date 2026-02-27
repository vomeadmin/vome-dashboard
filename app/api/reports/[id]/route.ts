import { NextRequest, NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import { type Report, createDefaultReport, makeReportId } from '@/lib/report-template'

function getRedis(): Redis {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    throw new Error('Upstash Redis environment variables are not configured')
  }
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  })
}

function reportKey(id: string): string {
  return `report:${id}`
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  try {
    const redis = getRedis()
    const existing = await redis.get<Report>(reportKey(id))

    if (existing) {
      return NextResponse.json(existing)
    }

    // Auto-create from template if it looks like a valid quarter ID (e.g. 2026-Q1)
    const match = id.match(/^(\d{4})-Q([1-4])$/)
    if (match) {
      const year = parseInt(match[1])
      const quarter = parseInt(match[2])
      const newReport = createDefaultReport(year, quarter)
      await redis.set(reportKey(id), newReport)
      await redis.sadd('reports:index', id)
      return NextResponse.json(newReport)
    }

    return NextResponse.json({ error: 'Report not found' }, { status: 404 })
  } catch (error) {
    console.error('[GET /api/reports]', error)
    // Redis not configured — serve a default in-memory report so the page doesn't crash
    const match = id.match(/^(\d{4})-Q([1-4])$/)
    if (match) {
      const defaultReport = createDefaultReport(parseInt(match[1]), parseInt(match[2]))
      return NextResponse.json({ ...defaultReport, _storageUnavailable: true })
    }
    return NextResponse.json({ error: 'Report not found' }, { status: 404 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  try {
    const body = await req.json() as Partial<Report>
    const redis = getRedis()

    const existing = await redis.get<Report>(reportKey(id))
    if (!existing) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    const updated: Report = {
      ...existing,
      ...body,
      id,
      updatedAt: new Date().toISOString(),
    }

    await redis.set(reportKey(id), updated)
    return NextResponse.json(updated)
  } catch (error) {
    console.error('[PUT /api/reports]', error)
    return NextResponse.json({ error: 'Failed to save report' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  try {
    const match = id.match(/^(\d{4})-Q([1-4])$/)
    if (!match) {
      return NextResponse.json({ error: 'Invalid report ID format. Use YYYY-QN' }, { status: 400 })
    }

    const year = parseInt(match[1])
    const quarter = parseInt(match[2])
    const redis = getRedis()

    const newReport = createDefaultReport(year, quarter)
    await redis.set(reportKey(id), newReport)
    await redis.sadd('reports:index', id)

    return NextResponse.json(newReport, { status: 201 })
  } catch (error) {
    console.error('[POST /api/reports]', error)
    return NextResponse.json({ error: 'Failed to create report' }, { status: 500 })
  }
}

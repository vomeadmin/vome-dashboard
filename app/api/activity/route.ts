import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Proxy to the Django activity API endpoint.
 * Keeps the Django secret server-side; exposes a clean JSON response to the client.
 *
 * Usage: GET /api/activity?period=2026-02
 */
export async function GET(req: NextRequest) {
  const url = process.env.DJANGO_ACTIVITY_URL
  const secret = process.env.DJANGO_ACTIVITY_SECRET

  if (!url || !secret) {
    return NextResponse.json({ error: 'Django activity API not configured' }, { status: 503 })
  }

  const period = req.nextUrl.searchParams.get('period') ?? undefined
  const targetUrl = period ? `${url}?period=${period}` : url

  try {
    const res = await fetch(targetUrl, {
      headers: { Authorization: `Bearer ${secret}` },
      next: { revalidate: 300 }, // cache 5 minutes
    })

    if (!res.ok) {
      return NextResponse.json(
        { error: `Django API returned ${res.status}` },
        { status: res.status }
      )
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('[/api/activity]', error)
    return NextResponse.json({ error: 'Failed to reach activity API' }, { status: 502 })
  }
}

import { NextRequest, NextResponse } from 'next/server'

function unauthorized(realm: string): NextResponse {
  return new NextResponse('Unauthorized', {
    status: 401,
    headers: { 'WWW-Authenticate': `Basic realm="${realm}"` },
  })
}

function checkBasicAuth(req: NextRequest, password: string, realm: string): NextResponse | null {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Basic ')) return unauthorized(realm)
  const decoded = Buffer.from(auth.slice(6), 'base64').toString()
  // username:password — password may itself contain colons
  const colonIndex = decoded.indexOf(':')
  const pass = decoded.slice(colonIndex + 1)
  if (pass !== password) return unauthorized(realm)
  return null
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (pathname.startsWith('/dashboard')) {
    const fail = checkBasicAuth(req, process.env.INTERNAL_PASSWORD ?? '', 'Vome Internal')
    if (fail) return fail
  }

  if (pathname.startsWith('/investor')) {
    const fail = checkBasicAuth(req, process.env.INVESTOR_PASSWORD ?? '', 'Vome Investor Report')
    if (fail) return fail
  }

  // Protect internal Stripe API routes (debug endpoints, raw data)
  if (pathname.startsWith('/api/stripe')) {
    const fail = checkBasicAuth(req, process.env.INTERNAL_PASSWORD ?? '', 'Vome Internal')
    if (fail) return fail
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/investor/:path*', '/api/stripe/:path*'],
}

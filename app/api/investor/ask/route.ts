import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getKpis, getNormalizedMrrByMonth, getChurnedDowngrades } from '@/lib/stripe-calculations'
import { getEffectiveFxRate } from '@/lib/fx'

const MAX_QUESTION_LENGTH = 500

const SYSTEM_PROMPT = `You are a financial analyst for Vome, a Canadian SaaS workforce management platform serving the healthcare industry. You answer questions from investors about business performance using real-time Stripe data.

STRICT RULES:
1. Never reveal individual customer names, emails, or any identifiers — even if directly asked.
2. Only discuss aggregate metrics (totals, averages, growth rates, plan breakdowns).
3. If asked about a specific customer, account, or any individual-level data, politely decline and redirect to aggregates.
4. Keep answers concise, factual, and professional — 2-4 sentences max unless a detailed breakdown is genuinely useful.
5. All monetary figures are in CAD unless otherwise specified.
6. Do not speculate beyond what the data shows.`

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const question: string = body?.question ?? ''

    if (!question || typeof question !== 'string') {
      return NextResponse.json({ error: 'Question is required.' }, { status: 400 })
    }

    if (question.length > MAX_QUESTION_LENGTH) {
      return NextResponse.json(
        { error: `Question must be ${MAX_QUESTION_LENGTH} characters or fewer.` },
        { status: 400 }
      )
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'AI chat is not configured.' }, { status: 503 })
    }

    // Gather aggregated data — no customer names or IDs
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const fxRate = await getEffectiveFxRate('stripe_dashboard')

    const [kpis, trend, churn] = await Promise.all([
      getKpis(fxRate),
      getNormalizedMrrByMonth(13, fxRate),
      getChurnedDowngrades(thirtyDaysAgo, fxRate),
    ])

    const churnArrLost = churn.reduce((s, c) => s + c.arrLostCad, 0)

    // Build context — strictly aggregate, no identifiers
    const context = {
      as_of: new Date().toISOString().slice(0, 10),
      currency: 'CAD',
      fx_rate_usd_to_cad: fxRate,
      mrr_cad: Math.round(kpis.mrr),
      arr_cad: Math.round(kpis.arr),
      active_subscriptions: kpis.activeSubscriptions,
      trialing_subscriptions: kpis.trialingSubscriptions,
      past_due_subscriptions: kpis.pastDueSubscriptions,
      avg_arr_per_customer_cad: Math.round(kpis.avgArrPerCustomer),
      total_admin_seats: kpis.totalSeats,
      plan_breakdown: Object.fromEntries(
        Object.entries(kpis.byPlan).map(([plan, data]) => [
          plan,
          {
            count: data.count,
            arr_cad: Math.round(data.arr),
            mrr_cad: Math.round(data.mrr),
            seats: data.seats,
          },
        ])
      ),
      monthly_mrr_trend_13mo: trend.map((m) => ({
        month: m.month,
        mrr_cad: Math.round(m.mrr),
        arr_cad: Math.round(m.mrr * 12),
      })),
      churn_events_30d: churn.length,
      arr_lost_to_churn_30d_cad: Math.round(churnArrLost),
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Stripe data as of ${context.as_of}:\n${JSON.stringify(context, null, 2)}\n\nInvestor question: ${question}`,
        },
      ],
    })

    const answer =
      message.content[0]?.type === 'text' ? message.content[0].text : 'Unable to generate a response.'

    return NextResponse.json({ answer })
  } catch (error) {
    console.error('[POST /api/investor/ask]', error)
    return NextResponse.json({ error: 'Unable to answer right now.' }, { status: 500 })
  }
}

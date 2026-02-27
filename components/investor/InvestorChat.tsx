'use client'

import { useState, useRef } from 'react'

const MAX_CHARS = 500

export default function InvestorChat() {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<string | null>(null)
  const [lastQuestion, setLastQuestion] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const q = question.trim()
    if (!q || loading) return

    setLoading(true)
    setError(null)
    setAnswer(null)
    setLastQuestion(q)

    try {
      const res = await fetch('/api/investor/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error ?? 'Unable to answer right now.')
      } else {
        setAnswer(data.answer)
        setQuestion('')
      }
    } catch {
      setError('Unable to answer right now.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
      {/* Header toggle */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-800/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-indigo-400 text-base">✦</span>
          <span className="text-sm font-semibold text-slate-300">Ask about performance</span>
          <span className="text-xs text-slate-500 ml-1">— Powered by Claude</span>
        </div>
        <span className="text-slate-600 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-slate-800 px-5 py-4 flex flex-col gap-4">
          {/* Last Q&A */}
          {lastQuestion && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-slate-500">
                <span className="font-medium text-slate-400">Q:</span> {lastQuestion}
              </p>
              {loading && (
                <p className="text-xs text-indigo-400 animate-pulse">Analyzing Stripe data...</p>
              )}
              {error && !loading && (
                <p className="text-xs text-rose-400">{error}</p>
              )}
              {answer && !loading && (
                <p className="text-sm text-slate-300 leading-relaxed">{answer}</p>
              )}
            </div>
          )}

          {/* Input form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-2">
            <div className="relative">
              <textarea
                ref={textareaRef}
                value={question}
                onChange={(e) => setQuestion(e.target.value.slice(0, MAX_CHARS))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSubmit(e as unknown as React.FormEvent)
                  }
                }}
                placeholder="e.g. What is our current ARR? How is churn trending?"
                rows={2}
                disabled={loading}
                className="w-full resize-none rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
              />
              <span className="absolute bottom-2 right-3 text-xs text-slate-600">
                {question.length}/{MAX_CHARS}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-600">Only aggregate data is shared · No customer identifiers</p>
              <button
                type="submit"
                disabled={!question.trim() || loading}
                className="rounded-md bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Thinking...' : 'Ask'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { useCallback, useEffect, useRef } from 'react'
import type { Report, ReportSection } from '@/lib/report-template'
import { DataBlock } from './DataBlock'
import type { KpiData, CustomerData } from '@/lib/stripe-calculations'

interface SectionEditorProps {
  section: ReportSection
  onUpdate: (id: string, content: string) => void
}

function SectionEditor({ section, onUpdate }: SectionEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Start writing...' }),
    ],
    content: section.content,
    onUpdate({ editor }) {
      onUpdate(section.id, editor.getHTML())
    },
    editorProps: {
      attributes: { class: 'tiptap-editor' },
    },
  })

  return (
    <div className="min-h-[100px] rounded-lg border border-slate-700 bg-slate-800/30 p-4 focus-within:border-indigo-500/50 transition-colors">
      {editor && (
        <div className="tiptap-editor">
          <EditorContent editor={editor} className="text-slate-200 text-sm leading-relaxed print:text-gray-800" />
        </div>
      )}
    </div>
  )
}

interface ReportEditorProps {
  report: Report
  kpis: KpiData
  topCustomers: CustomerData[]
  churnCount: number
  arrLostToChurn: number
  onSave: (updates: Partial<Report>) => Promise<void>
}

export function ReportEditor({
  report,
  kpis,
  topCustomers,
  churnCount,
  arrLostToChurn,
  onSave,
}: ReportEditorProps) {
  const sectionsRef = useRef<Map<string, string>>(new Map())
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Initialize from existing content
  useEffect(() => {
    for (const s of report.sections) {
      if (s.type === 'editor') {
        sectionsRef.current.set(s.id, s.content)
      }
    }
  }, [report.sections])

  const handleSectionUpdate = useCallback(
    (id: string, content: string) => {
      sectionsRef.current.set(id, content)
      // Debounced auto-save
      if (saveTimeout.current) clearTimeout(saveTimeout.current)
      saveTimeout.current = setTimeout(() => {
        const updatedSections = report.sections.map((s) =>
          s.type === 'editor' ? { ...s, content: sectionsRef.current.get(s.id) ?? s.content } : s
        )
        onSave({ sections: updatedSections })
      }, 1500)
    },
    [report.sections, onSave]
  )

  return (
    <div className="flex flex-col gap-8 print-page">
      {report.sections.map((section) => (
        <div key={section.id}>
          <h2 className="text-base font-semibold text-slate-200 print:text-gray-900 mb-3">
            {section.title}
          </h2>

          {section.type === 'editor' && (
            <SectionEditor section={section} onUpdate={handleSectionUpdate} />
          )}

          {section.type === 'data' && section.dataKey && (
            <DataBlock
              dataKey={section.dataKey}
              kpis={kpis}
              topCustomers={topCustomers}
              churnCount={churnCount}
              arrLostToChurn={arrLostToChurn}
            />
          )}
        </div>
      ))}
    </div>
  )
}

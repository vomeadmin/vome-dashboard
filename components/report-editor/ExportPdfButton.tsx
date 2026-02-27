'use client'

interface ExportPdfButtonProps {
  reportTitle: string
}

export function ExportPdfButton({ reportTitle }: ExportPdfButtonProps) {
  function handleExport() {
    const title = document.title
    document.title = reportTitle
    window.print()
    document.title = title
  }

  return (
    <button
      onClick={handleExport}
      className="no-print inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
    >
      <span>↓</span>
      Export PDF
    </button>
  )
}

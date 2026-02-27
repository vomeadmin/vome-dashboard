export type DataBlockKey =
  | 'kpi_summary'
  | 'arr_by_plan'
  | 'top_customers'
  | 'cash_flow_quarter'
  | 'churn_summary'

export interface ReportSection {
  id: string
  type: 'data' | 'editor'
  title: string
  dataKey?: DataBlockKey
  content: string // HTML for editor sections; empty string for data blocks
}

export interface Report {
  id: string           // e.g. '2026-Q1'
  quarter: string      // e.g. 'Q1 2026'
  year: number
  quarterNumber: number // 1–4
  createdAt: string
  updatedAt: string
  publishedToInvestors: boolean
  sections: ReportSection[]
}

export function getQuarterFromDate(date: Date = new Date()): { year: number; quarter: number } {
  return {
    year: date.getFullYear(),
    quarter: Math.floor(date.getMonth() / 3) + 1,
  }
}

export function makeReportId(year: number, quarter: number): string {
  return `${year}-Q${quarter}`
}

export function createDefaultReport(year: number, quarter: number): Report {
  return {
    id: makeReportId(year, quarter),
    quarter: `Q${quarter} ${year}`,
    year,
    quarterNumber: quarter,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    publishedToInvestors: false,
    sections: [
      {
        id: 'executive-summary',
        type: 'editor',
        title: 'Executive Summary',
        content: '<p>Write a brief executive summary of the quarter here. Highlight the most significant developments, wins, and challenges.</p>',
      },
      {
        id: 'kpi-metrics',
        type: 'data',
        title: 'Key Financial Metrics',
        dataKey: 'kpi_summary',
        content: '',
      },
      {
        id: 'highlights',
        type: 'editor',
        title: 'Quarter Highlights',
        content: '<p><strong>Key wins this quarter:</strong></p><ul><li>Add highlight here</li></ul>',
      },
      {
        id: 'revenue-by-plan',
        type: 'data',
        title: 'Revenue by Plan',
        dataKey: 'arr_by_plan',
        content: '',
      },
      {
        id: 'top-customers',
        type: 'data',
        title: 'Top Customers by ARR',
        dataKey: 'top_customers',
        content: '',
      },
      {
        id: 'churn',
        type: 'data',
        title: 'Churn & Downgrades',
        dataKey: 'churn_summary',
        content: '',
      },
      {
        id: 'outlook',
        type: 'editor',
        title: 'Outlook & Next Quarter Priorities',
        content: '<p>Outline the key priorities and goals for the next quarter.</p><ul><li></li></ul>',
      },
    ],
  }
}

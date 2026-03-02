/**
 * Historical MRR from Stripe's official "Ending MRR" monthly export.
 * Source: Subscription_metrics__monthly_2021-01-01_to_2026-03-01.csv
 *
 * Values are in CAD — Stripe applies its own FX rate at time of reporting,
 * so these figures are the authoritative published numbers.
 *
 * To update: re-export "Subscription metrics (monthly)" from your Stripe dashboard,
 * find the "Ending MRR" row, and paste the new month values below.
 */
export const STRIPE_MRR_HISTORY: Record<string, number> = {
  '2022-03':    90.00,
  '2022-04':   315.00,
  '2022-05':   315.00,
  '2022-06':   660.00,
  '2022-07':   660.00,
  '2022-08':   645.00,
  '2022-09':   765.00,
  '2022-10':   855.00,
  '2022-11':   900.00,
  '2022-12':  1080.00,
  '2023-01':  1290.00,
  '2023-02':  1365.00,
  '2023-03':  1455.00,
  '2023-04':  1530.00,
  '2023-05':  1770.00,
  '2023-06':  1950.00,
  '2023-07':  2520.00,
  '2023-08':  2640.00,
  '2023-09':  2745.00,
  '2023-10':  2730.00,
  '2023-11':  2775.00,
  '2023-12':  2655.00,
  '2024-01':  2820.00,
  '2024-02':  2895.00,
  '2024-03':  3577.50,
  '2024-04':  3903.98,
  '2024-05':  6818.21,
  '2024-06':  8750.45,
  '2024-07':  8866.08,
  '2024-08':  9162.86,
  '2024-09': 10899.17,
  '2024-10': 11729.05,
  '2024-11': 12134.25,
  '2024-12': 12648.35,
  '2025-01': 13794.64,
  '2025-02': 14394.64,
  '2025-03': 15142.59,
  '2025-04': 17559.89,
  '2025-05': 19680.87,
  '2025-06': 20163.55,
  '2025-07': 21019.50,
  '2025-08': 21786.68,
  '2025-09': 22237.49,
  '2025-10': 22399.62,
  '2025-11': 23051.25,
  '2025-12': 23591.84,
  '2026-01': 24041.03,
  '2026-02': 26150.57,
  // 2026-03 omitted intentionally: the live kpis.mrr override in pages uses the real-time value
}

export interface QuarterlyMrrMetrics {
  quarter: string
  nrr: number          // net revenue retention, e.g. 95.0 means 95%
  startMrr: number     // CAD, beginning of first month
  newMrr: number       // new logo MRR added during quarter
  expansionMrr: number
  reactivationMrr: number
  contractionMrr: number
  churnedMrr: number
  partial?: boolean    // true for the current in-progress quarter
}

/**
 * Pre-computed quarterly NRR metrics from Stripe's monthly CSV roll-forward data.
 * Source: Subscription_metrics__monthly_YYYY-MM-DD_to_YYYY-MM-DD.csv
 *
 * NRR = (startMrr + expansion + reactivation + contraction + churn) / startMrr × 100
 * All values in CAD.
 *
 * To update: re-export CSV, sum the 3 monthly values for each roll-forward row per quarter,
 * then add a new entry (and mark the previous Q1 entry as non-partial).
 */
export const QUARTERLY_MRR_METRICS: QuarterlyMrrMetrics[] = [
  {
    quarter: 'Q1 2024',
    nrr: 110.7,
    startMrr: 2655.00,
    newMrr: 637.50,
    expansionMrr: 135.00,
    reactivationMrr: 585.00,
    contractionMrr: -45.00,
    churnedMrr: -390.00,
  },
  {
    quarter: 'Q2 2024',
    nrr: 129.7,
    startMrr: 3577.50,
    newMrr: 4113.50,
    expansionMrr: 482.82,
    reactivationMrr: 3557.04,
    contractionMrr: -332.82,
    churnedMrr: -2642.38,
  },
  {
    quarter: 'Q3 2024',
    nrr: 95.0,
    startMrr: 8750.45,
    newMrr: 2633.15,
    expansionMrr: 200.00,
    reactivationMrr: 415.44,
    contractionMrr: -210.00,
    churnedMrr: -846.91,
  },
  {
    quarter: 'Q4 2024',
    nrr: 91.2,
    startMrr: 10899.17,
    newMrr: 2336.55,
    expansionMrr: 452.03,
    reactivationMrr: 770.00,
    contractionMrr: -45.00,
    churnedMrr: -2133.09,
  },
  {
    quarter: 'Q1 2025',
    nrr: 92.1,
    startMrr: 12648.35,
    newMrr: 3497.74,
    expansionMrr: 680.00,
    reactivationMrr: 1142.03,
    contractionMrr: -435.42,
    churnedMrr: -2388.26,
  },
  {
    quarter: 'Q2 2025',
    nrr: 109.4,
    startMrr: 15142.59,
    newMrr: 4154.91,
    expansionMrr: 3433.40,
    reactivationMrr: 387.80,
    contractionMrr: -986.94,
    churnedMrr: -1410.97,
  },
  {
    quarter: 'Q3 2025',
    nrr: 95.8,
    startMrr: 20163.55,
    newMrr: 2663.00,
    expansionMrr: 1088.60,
    reactivationMrr: 824.11,
    contractionMrr: -1107.04,
    churnedMrr: -1653.14,
  },
  {
    quarter: 'Q4 2025',
    nrr: 96.9,
    startMrr: 22237.49,
    newMrr: 2209.11,
    expansionMrr: 968.12,
    reactivationMrr: 1172.01,
    contractionMrr: -579.01,
    churnedMrr: -2247.45,
  },
  {
    quarter: 'Q1 2026',
    nrr: 104.0,
    startMrr: 23591.84,
    newMrr: 1682.97,
    expansionMrr: 3351.69,
    reactivationMrr: 317.56,
    contractionMrr: -1862.21,
    churnedMrr: -867.72,
    partial: true,
  },
]

/**
 * Historical beginning-of-month subscriber counts from Stripe's "Beginning Subscribers" CSV row.
 * Used as the denominator for quarterly retention rate calculations.
 * Key = 'YYYY-MM' of the first month of the quarter (e.g. '2024-01' for Q1 2024).
 *
 * To update: re-export "Subscription metrics (monthly)" from your Stripe dashboard,
 * find the "Beginning Subscribers" row, and paste the values for each quarter-start month.
 */
export const STRIPE_SUBSCRIBERS_HISTORY: Record<string, number> = {
  '2022-03':   0,
  '2022-06':   4,
  '2022-09':   9,
  '2022-12':  15,
  '2023-01':  19,
  '2023-04':  26,
  '2023-07':  38,
  '2023-10':  51,
  '2024-01':  50,
  '2024-04':  64,
  '2024-07': 105,
  '2024-10': 119,
  '2025-01': 127,
  '2025-04': 148,
  '2025-07': 172,
  '2025-10': 182,
  '2026-01': 189,
}

/**
 * Stripe customer IDs for internal / demo accounts.
 *
 * These accounts have active subscriptions in Stripe but are NOT included in Stripe's own
 * "MRR per subscriber" CSV export — meaning Stripe itself excludes them from reported MRR.
 * We mirror that behaviour by filtering them out of all MRR/ARR calculations.
 *
 * To add a new internal account: paste the Stripe customer ID (cus_xxx) from the Stripe dashboard.
 * To remove one (if a demo account converts to a paying customer): delete the entry.
 */
export const INTERNAL_CUSTOMER_IDS = new Set<string>([
  'cus_N3SpXsM35AWI42', // Sammy's Place           (sam.debby@mailinator.com)
  'cus_N3TNW4jYeNyHhc', // Saully's place           (saul.mcgee@mailinator.com)
  'cus_LERRQROJ8REHxO', // [TEST] Your Organization (vometestaccount1@mailinator.com)
  'cus_OnHCgEDaRaiuyX', // Montreal Toundra         (gassytch@gmail.com)
  'cus_Me1OEFKDTJ6pT0', // Salmon Arm Folk Music Society (volunteer@rootsandblues.ca)
  'cus_TP9Z4EGAPfd9Dl', // Fair Systems That Work   (kryssie@fairsystemsthatwork.com)
])

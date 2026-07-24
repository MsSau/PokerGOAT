const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Formats a date as dd-mmm (e.g. "21-Jul"), locale-independent.
 */
export function formatDayMonth(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const day = String(d.getDate()).padStart(2, '0');
  return `${day}-${MONTH_ABBR[d.getMonth()]}`;
}

/**
 * Formats a number as Indian Rupees (INR) using Indian numbering convention.
 * Example: 100000 becomes ₹1,00,000
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Extracts a displayable message from a caught value of unknown shape
 * (thrown values are never guaranteed to be an Error instance — notably,
 * supabase-js's postgrest-js throws a plain { message, details, hint, code }
 * object, not a PostgrestError, when a request fails at the network level
 * rather than getting a structured HTTP error response from PostgREST).
 */
export function getErrorMessage(err: unknown, fallback = 'An unexpected error occurred.'): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && typeof (err as { message?: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

// Shared Gold/Silver/Bronze/None color mapping for every medal glyph (Prep, Execution, Outcome).
export function medalColorClass(tier: string | null | undefined): string {
  switch (tier) {
    case 'GOLD': return 'text-medal-gold';
    case 'SILVER': return 'text-medal-silver';
    case 'BRONZE': return 'text-medal-bronze';
    default: return 'text-text-faint';
  }
}

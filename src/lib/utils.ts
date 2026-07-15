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

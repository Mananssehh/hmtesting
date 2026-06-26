// Shared Decks brand styles for app emails. Keep in sync with the auth
// templates in _shared/email-templates/.

export const SITE_URL = 'https://linku99.com'
export const SUPPORT_EMAIL = 'support@linku99.com'
export const BRAND = 'Decks'

export const main = {
  backgroundColor: '#ffffff',
  fontFamily:
    'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',
}
export const container = { padding: '24px 28px', maxWidth: '560px' }
export const h1 = {
  fontSize: '24px',
  fontWeight: 'bold' as const,
  color: '#111111',
  margin: '0 0 8px',
}
export const h2 = {
  fontSize: '15px',
  fontWeight: '600' as const,
  color: '#111111',
  margin: '20px 0 6px',
}
export const lead = { fontSize: '15px', color: '#111111', margin: '0 0 16px' }
export const text = {
  fontSize: '14px',
  color: '#4B5563',
  lineHeight: '1.6',
  margin: '0 0 16px',
}
export const textMuted = {
  fontSize: '13px',
  color: '#6B7280',
  lineHeight: '1.6',
  margin: '0 0 12px',
}
export const detailRow = {
  fontSize: '14px',
  color: '#111111',
  margin: '4px 0',
}
export const detailLabel = {
  fontSize: '12px',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.06em',
  color: '#6B7280',
  margin: '12px 0 2px',
}
export const amountBox = {
  background: '#FDF2F8',
  border: '1px solid #FBCFE8',
  borderRadius: '12px',
  padding: '16px 20px',
  margin: '20px 0',
  textAlign: 'center' as const,
}
export const amountLabel = {
  fontSize: '12px',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.06em',
  color: '#9D174D',
  margin: '0 0 4px',
}
export const amountNumber = {
  fontSize: '26px',
  fontWeight: 'bold' as const,
  color: 'hsl(322, 70%, 45%)',
  margin: 0,
}
export const hr = { borderColor: '#E5E7EB', margin: '24px 0' }
export const link = { color: 'hsl(322, 70%, 50%)', textDecoration: 'underline' }
export const button = {
  backgroundColor: 'hsl(322, 70%, 55%)',
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: '600' as const,
  borderRadius: '14px',
  padding: '12px 24px',
  textDecoration: 'none',
}
export const footer = { fontSize: '12px', color: '#6B7280', margin: '8px 0 4px' }
export const footerLink = { color: '#6B7280', textDecoration: 'underline' }
export const footerTiny = { fontSize: '11px', color: '#9CA3AF', margin: '8px 0 0' }

export function formatUSD(cents: number | null | undefined): string {
  const n = typeof cents === 'number' ? cents : 0
  return `$${(n / 100).toFixed(2)}`
}

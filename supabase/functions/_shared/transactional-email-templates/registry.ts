/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'

import { template as djTipNotification } from './dj-tip-notification.tsx'
import { template as guestTipThankYou } from './guest-tip-thank-you.tsx'
import { template as refundDj } from './refund-dj.tsx'
import { template as refundGuest } from './refund-guest.tsx'
import { template as weeklySummary } from './weekly-summary.tsx'
import { template as guestWelcome } from './guest-welcome.tsx'
import { template as djWelcome } from './dj-welcome.tsx'
import { template as djStripeConnected } from './dj-stripe-connected.tsx'
import { template as securityPasswordChanged } from './security-password-changed.tsx'

export interface TemplateEntry {
  // deno-lint-ignore no-explicit-any
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, unknown>) => string)
  displayName?: string
  // deno-lint-ignore no-explicit-any
  previewData?: Record<string, any>
  to?: string | ((data: Record<string, unknown>) => string)
}

export const TEMPLATES: Record<string, TemplateEntry> = {
  'dj-tip-notification': djTipNotification,
  'guest-tip-thank-you': guestTipThankYou,
  'refund-dj': refundDj,
  'refund-guest': refundGuest,
  'weekly-summary': weeklySummary,
  'guest-welcome': guestWelcome,
  'dj-welcome': djWelcome,
  'dj-stripe-connected': djStripeConnected,
  'security-password-changed': securityPasswordChanged,
}

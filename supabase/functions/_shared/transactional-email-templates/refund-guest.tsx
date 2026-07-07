/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import {
  BRAND, SITE_URL, SUPPORT_EMAIL, container, detailLabel, detailRow, footer,
  footerLink, footerTiny, formatUSD, h1, hr, lead, link, main, text, textMuted,
} from './_styles.ts'

interface Props {
  djName?: string
  eventName?: string
  grossAmountCents?: number
  refundedAmountCents?: number
  fullyRefunded?: boolean
  receiptUrl?: string
}

const Email = ({
  djName = 'your DJ',
  eventName = 'the event',
  grossAmountCents = 0,
  refundedAmountCents = 0,
  fullyRefunded = true,
  receiptUrl,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`Your ${formatUSD(refundedAmountCents)} tip was refunded`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={{ textAlign: 'center', margin: '0 0 20px' }}>
          <Img src="https://linku99.com/brand/decks-logo.png?v=3" alt="Decks" width="72" height="72" style={{ display: 'block', margin: '0 auto', maxWidth: '100%', height: 'auto' }} />
        </Section>
        <Heading style={h1}>Your tip was refunded</Heading>
        <Text style={lead}>
          A tip you sent to DJ {djName} on Decks was {fullyRefunded ? 'fully' : 'partially'} refunded.
          The amount below will return to your original payment method (typically within 5–10 business days).
        </Text>

        <Text style={detailLabel}>Event</Text>
        <Text style={detailRow}>{eventName}</Text>

        <Text style={detailLabel}>Original tip</Text>
        <Text style={detailRow}>{formatUSD(grossAmountCents)}</Text>

        <Text style={detailLabel}>Refunded amount</Text>
        <Text style={detailRow}>{formatUSD(refundedAmountCents)}</Text>

        {receiptUrl ? (
          <>
            <Text style={detailLabel}>Original receipt</Text>
            <Text style={detailRow}>
              <Link href={receiptUrl} style={link}>View Stripe receipt</Link>
            </Text>
          </>
        ) : null}

        <Text style={textMuted}>
          If you have any questions about this refund, reply to this email and we'll help.
        </Text>

        <Hr style={hr} />
        <Text style={footer}>
          {BRAND} · <Link href={SITE_URL} style={footerLink}>linku99.com</Link> ·{' '}
          <Link href={`mailto:${SUPPORT_EMAIL}`} style={footerLink}>{SUPPORT_EMAIL}</Link>
        </Text>
        <Text style={footerTiny}>© {new Date().getFullYear()} Decks.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: 'Your tip was refunded',
  displayName: 'Refund notification (guest)',
  previewData: {
    djName: 'Nova',
    eventName: 'Friday Night Set',
    grossAmountCents: 500,
    refundedAmountCents: 500,
    fullyRefunded: true,
    receiptUrl: 'https://pay.stripe.com/receipts/example',
  },
} satisfies TemplateEntry

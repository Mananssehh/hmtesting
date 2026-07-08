/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body,
  Button,
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
  BRAND, SITE_URL, SUPPORT_EMAIL, button, container, detailLabel, detailRow,
  footer, footerLink, footerTiny, formatUSD, h1, hr, lead, link, main, text,
  textMuted,
} from './_styles.ts'

interface Props {
  djName?: string
  guestName?: string
  eventName?: string
  grossAmountCents?: number
  refundedAmountCents?: number
  fullyRefunded?: boolean
}

const Email = ({
  djName = 'there',
  guestName = 'A guest',
  eventName = 'your event',
  grossAmountCents = 0,
  refundedAmountCents = 0,
  fullyRefunded = true,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`A ${formatUSD(refundedAmountCents)} tip was refunded`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={{ textAlign: 'center', margin: '0 0 20px' }}>
          <Img src="https://linku99.com/brand/decks-logo-mark-transparent.png?v=1" alt="Decks" width="48" height="48" style={{ display: 'block', margin: '0 auto', maxWidth: '100%', height: 'auto' }} />
        </Section>
        <Heading style={h1}>A tip was refunded</Heading>
        <Text style={lead}>
          Hey {djName}, a tip on Decks was {fullyRefunded ? 'fully' : 'partially'} refunded.
          Your earnings have been adjusted automatically.
        </Text>

        <Text style={detailLabel}>Guest</Text>
        <Text style={detailRow}>{guestName}</Text>

        <Text style={detailLabel}>Event</Text>
        <Text style={detailRow}>{eventName}</Text>

        <Text style={detailLabel}>Original tip</Text>
        <Text style={detailRow}>{formatUSD(grossAmountCents)}</Text>

        <Text style={detailLabel}>Refunded</Text>
        <Text style={detailRow}>{formatUSD(refundedAmountCents)}</Text>

        <Section style={{ textAlign: 'center', margin: '28px 0' }}>
          <Button style={button} href={`${SITE_URL}/dj/earnings`}>
            View earnings
          </Button>
        </Section>

        <Text style={textMuted}>
          Stripe also handles the refund to the guest's original payment method.
          If you have any questions, reply to this email.
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
  subject: 'A tip on Decks was refunded',
  displayName: 'Refund notification (DJ)',
  previewData: {
    djName: 'Nova',
    guestName: 'Sam',
    eventName: 'Friday Night Set',
    grossAmountCents: 500,
    refundedAmountCents: 500,
    fullyRefunded: true,
  },
} satisfies TemplateEntry

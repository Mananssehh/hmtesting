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
  BRAND, SITE_URL, SUPPORT_EMAIL, amountBox, amountLabel, amountNumber, button,
  container, detailLabel, detailRow, footer, footerLink, footerTiny, formatUSD,
  h1, hr, lead, link, main, text, textMuted,
} from './_styles.ts'

interface Props {
  djName?: string
  guestName?: string
  eventName?: string
  songTitle?: string
  grossAmountCents?: number
  netAmountCents?: number
}

const Email = ({
  djName = 'there',
  guestName = 'Anonymous',
  eventName = 'your event',
  songTitle,
  grossAmountCents = 0,
  netAmountCents = 0,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`${guestName} tipped you ${formatUSD(grossAmountCents)} on Decks`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={{ textAlign: 'center', margin: '0 0 20px' }}>
          <Img src="https://linku99.com/brand/decks-logo-mark-transparent.png?v=1" alt="Decks" width="48" height="48" style={{ display: 'block', margin: '0 auto', maxWidth: '100%', height: 'auto' }} />
        </Section>
        <Heading style={h1}>🎉 You received a new tip</Heading>
        <Text style={lead}>Hey {djName}, someone just tipped you on Decks.</Text>

        <Section style={amountBox}>
          <Text style={amountLabel}>Tip amount</Text>
          <Text style={amountNumber}>{formatUSD(grossAmountCents)}</Text>
        </Section>

        <Text style={detailLabel}>Guest</Text>
        <Text style={detailRow}>{guestName || 'Anonymous'}</Text>

        {songTitle ? (
          <>
            <Text style={detailLabel}>Requested song</Text>
            <Text style={detailRow}>{songTitle}</Text>
          </>
        ) : null}

        <Text style={detailLabel}>Event</Text>
        <Text style={detailRow}>{eventName}</Text>

        <Text style={detailLabel}>Your share (70%)</Text>
        <Text style={detailRow}>{formatUSD(netAmountCents)}</Text>

        <Section style={{ textAlign: 'center', margin: '28px 0' }}>
          <Button style={button} href={`${SITE_URL}/dj/earnings`}>
            View earnings
          </Button>
        </Section>

        <Text style={textMuted}>
          Funds settle to your connected payout account on your Stripe schedule.
        </Text>

        <Hr style={hr} />
        <Text style={footer}>
          {BRAND} · <Link href={SITE_URL} style={footerLink}>linku99.com</Link> ·{' '}
          <Link href={`mailto:${SUPPORT_EMAIL}`} style={footerLink}>{SUPPORT_EMAIL}</Link>
        </Text>
        <Text style={footerTiny}>
          © {new Date().getFullYear()} Decks. You're receiving this because you accept tips on Decks.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: '🎉 You received a new tip on Decks',
  displayName: 'DJ tip notification',
  previewData: {
    djName: 'Nova',
    guestName: 'Sam',
    eventName: 'Friday Night Set',
    songTitle: 'One More Time — Daft Punk',
    grossAmountCents: 500,
    netAmountCents: 350,
  },
} satisfies TemplateEntry

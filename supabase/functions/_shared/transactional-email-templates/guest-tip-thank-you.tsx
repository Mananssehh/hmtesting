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
  eventName?: string
  songTitle?: string
  amountCents?: number
  receiptUrl?: string
  roomCode?: string
}

const Email = ({
  djName = 'your DJ',
  eventName = 'the event',
  songTitle,
  amountCents = 0,
  receiptUrl,
  roomCode,
}: Props) => {
  const roomUrl = roomCode ? `${SITE_URL}/event/${roomCode}` : SITE_URL
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{`Thanks for tipping DJ ${djName} on Decks ❤️`}</Preview>
      <Body style={main}>
        <Container style={container}>
        <Section style={{ textAlign: 'center', margin: '0 0 20px' }}>
          <Img src="https://linku99.com/brand/decks-logo-mark-transparent.png?v=1" alt="Decks" width="48" height="48" style={{ display: 'block', margin: '0 auto', maxWidth: '100%', height: 'auto' }} />
        </Section>
          <Heading style={h1}>Thanks for supporting your DJ ❤️</Heading>
          <Text style={lead}>You tipped DJ {djName}. They felt it.</Text>

          <Section style={amountBox}>
            <Text style={amountLabel}>Your tip</Text>
            <Text style={amountNumber}>{formatUSD(amountCents)}</Text>
          </Section>

          <Text style={detailLabel}>Event</Text>
          <Text style={detailRow}>{eventName}</Text>

          {songTitle ? (
            <>
              <Text style={detailLabel}>Requested song</Text>
              <Text style={detailRow}>{songTitle}</Text>
            </>
          ) : null}

          {receiptUrl ? (
            <>
              <Text style={detailLabel}>Receipt</Text>
              <Text style={detailRow}>
                <Link href={receiptUrl} style={link}>View your Stripe receipt</Link>
              </Text>
            </>
          ) : null}

          <Section style={{ textAlign: 'center', margin: '28px 0' }}>
            <Button style={button} href={roomUrl}>
              See what's playing
            </Button>
          </Section>

          <Text style={textMuted}>
            Tips support the DJ and do not affect song placement or guarantee playback.
          </Text>

          <Hr style={hr} />
          <Text style={footer}>
            {BRAND} · <Link href={SITE_URL} style={footerLink}>linku99.com</Link> ·{' '}
            <Link href={`mailto:${SUPPORT_EMAIL}`} style={footerLink}>{SUPPORT_EMAIL}</Link>
          </Text>
          <Text style={footerTiny}>
            © {new Date().getFullYear()} Decks. You're receiving this because you tipped through Decks.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: Email,
  subject: 'Thanks for supporting your DJ ❤️',
  displayName: 'Guest tip thank-you',
  previewData: {
    djName: 'Nova',
    eventName: 'Friday Night Set',
    songTitle: 'One More Time — Daft Punk',
    amountCents: 500,
    receiptUrl: 'https://pay.stripe.com/receipts/example',
    roomCode: 'NOVA01',
  },
} satisfies TemplateEntry

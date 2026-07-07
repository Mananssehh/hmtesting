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

// Infrastructure-only template for the future weekly DJ summary.
// Not wired to any cron yet — register here so we can flip it on later
// without another deploy cycle for templates.

interface TopSong { title: string; count: number }
interface TopTipper { nickname: string; amountCents: number }

interface Props {
  djName?: string
  weekStart?: string
  weekEnd?: string
  grossCents?: number
  netCents?: number
  guestCount?: number
  upcomingPayoutCents?: number
  topSongs?: TopSong[]
  topTippers?: TopTipper[]
}

const Email = ({
  djName = 'there',
  weekStart = '',
  weekEnd = '',
  grossCents = 0,
  netCents = 0,
  guestCount = 0,
  upcomingPayoutCents = 0,
  topSongs = [],
  topTippers = [],
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your Decks week in review</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={{ textAlign: 'center', margin: '0 0 20px' }}>
          <Img src="https://linku99.com/brand/decks-logo.png?v=3" alt="Decks" width="72" height="72" style={{ display: 'block', margin: '0 auto', maxWidth: '100%', height: 'auto' }} />
        </Section>
        <Heading style={h1}>Your week on Decks</Heading>
        <Text style={lead}>Hey {djName}, here's your set summary{weekStart && weekEnd ? ` for ${weekStart} – ${weekEnd}` : ''}.</Text>

        <Text style={detailLabel}>Gross tips</Text>
        <Text style={detailRow}>{formatUSD(grossCents)}</Text>

        <Text style={detailLabel}>Net earnings (70%)</Text>
        <Text style={detailRow}>{formatUSD(netCents)}</Text>

        <Text style={detailLabel}>Guests who tipped</Text>
        <Text style={detailRow}>{guestCount}</Text>

        <Text style={detailLabel}>Upcoming payout</Text>
        <Text style={detailRow}>{formatUSD(upcomingPayoutCents)}</Text>

        {topSongs.length > 0 ? (
          <>
            <Text style={detailLabel}>Most requested songs</Text>
            {topSongs.map((s, i) => (
              <Text key={i} style={detailRow}>• {s.title} ({s.count})</Text>
            ))}
          </>
        ) : null}

        {topTippers.length > 0 ? (
          <>
            <Text style={detailLabel}>Top tippers</Text>
            {topTippers.map((t, i) => (
              <Text key={i} style={detailRow}>• {t.nickname} — {formatUSD(t.amountCents)}</Text>
            ))}
          </>
        ) : null}

        <Section style={{ textAlign: 'center', margin: '28px 0' }}>
          <Button style={button} href={`${SITE_URL}/dj/earnings`}>
            Open earnings
          </Button>
        </Section>

        <Text style={textMuted}>
          You're receiving this weekly summary because you're an active DJ on Decks.
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
  subject: 'Your Decks week in review',
  displayName: 'Weekly DJ summary',
  previewData: {
    djName: 'Nova',
    weekStart: 'Jun 16',
    weekEnd: 'Jun 22',
    grossCents: 4200,
    netCents: 2940,
    guestCount: 8,
    upcomingPayoutCents: 2940,
    topSongs: [
      { title: 'One More Time — Daft Punk', count: 5 },
      { title: 'Sicko Mode — Travis Scott', count: 3 },
    ],
    topTippers: [
      { nickname: 'Sam', amountCents: 1500 },
      { nickname: 'Alex', amountCents: 1000 },
    ],
  },
} satisfies TemplateEntry

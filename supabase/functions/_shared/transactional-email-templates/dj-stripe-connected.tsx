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
  BRAND, SITE_URL, SUPPORT_EMAIL, button, container, footer, footerLink,
  footerTiny, h1, h2, hr, lead, link, main, text, textMuted,
} from './_styles.ts'

interface Props {
  djName?: string
}

const Email = ({ djName = 'there' }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Payouts are enabled — you're ready to receive tips</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={{ textAlign: 'center', margin: '0 0 20px' }}>
          <Img src="https://linku99.com/brand/decks-logo-mark-transparent.png?v=1" alt="Decks" width="48" height="48" style={{ display: 'block', margin: '0 auto', maxWidth: '100%', height: 'auto' }} />
        </Section>
        <Heading style={h1}>Payouts are enabled ✅</Heading>
        <Text style={lead}>
          Nice work, DJ {djName} — your Stripe Express account is connected and ready
          to receive tips on Decks.
        </Text>

        <Text style={h2}>How payouts work</Text>
        <Text style={text}>
          Tips settle into your Stripe balance after each successful charge. Stripe
          then pays out to your bank on the schedule shown in your Stripe dashboard
          (usually every 2 business days).
        </Text>
        <Text style={text}>
          You keep 70% of every tip. Decks takes a 30% platform fee to keep the
          lights on. Refunds and disputes are reflected automatically on your
          earnings dashboard.
        </Text>

        <Section style={{ textAlign: 'center', margin: '28px 0' }}>
          <Button style={button} href={`${SITE_URL}/dj/earnings`}>Open earnings</Button>
        </Section>

        <Text style={textMuted}>
          Anything off? Reply here or email{' '}
          <Link href={`mailto:${SUPPORT_EMAIL}`} style={link}>{SUPPORT_EMAIL}</Link>.
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
  subject: 'Stripe connected — payouts are enabled on Decks ✅',
  displayName: 'DJ Stripe connected',
  previewData: { djName: 'Nova' },
} satisfies TemplateEntry

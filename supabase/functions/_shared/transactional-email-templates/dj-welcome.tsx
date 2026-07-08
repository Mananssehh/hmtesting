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
    <Preview>Welcome to Decks — let's get your first event live</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={{ textAlign: 'center', margin: '0 0 20px' }}>
          <Img src="https://linku99.com/brand/decks-logo-mark-transparent.png?v=1" alt="Decks" width="48" height="48" style={{ display: 'block', margin: '0 auto', maxWidth: '100%', height: 'auto' }} />
        </Section>
        <Heading style={h1}>Welcome to Decks, DJ {djName} 🎛️</Heading>
        <Text style={lead}>Your DJ access is active. Here's how to get going.</Text>

        <Text style={h2}>1. Connect Stripe to receive tips</Text>
        <Text style={text}>
          Decks uses Stripe Connect Express to pay you. You keep 70% of every tip and
          payouts go straight to your bank.
        </Text>

        <Text style={h2}>2. Create your first event</Text>
        <Text style={text}>
          From the DJ dashboard, tap “Create event”. We'll generate a 5-letter room
          code and a QR you can show on screen or print.
        </Text>

        <Text style={h2}>3. Share the room code</Text>
        <Text style={text}>
          Guests join from their phone — no app install. They vote, request songs,
          and can tip you live during the set.
        </Text>

        <Section style={{ textAlign: 'center', margin: '28px 0' }}>
          <Button style={button} href={`${SITE_URL}/dj`}>Open DJ dashboard</Button>
        </Section>

        <Text style={textMuted}>
          Need a hand? Reply to this email or write{' '}
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
  subject: "Welcome to Decks — let's get your first set live 🎛️",
  displayName: 'DJ welcome',
  previewData: { djName: 'Nova' },
} satisfies TemplateEntry

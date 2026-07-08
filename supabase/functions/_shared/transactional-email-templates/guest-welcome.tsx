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
  nickname?: string
}

const Email = ({ nickname = 'there' }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Welcome to Decks — request songs and tip the DJ live</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={{ textAlign: 'center', margin: '0 0 20px' }}>
          <Img src="https://linku99.com/brand/decks-logo-mark-transparent.png?v=1" alt="Decks" width="48" height="48" style={{ display: 'block', margin: '0 auto', maxWidth: '100%', height: 'auto' }} />
        </Section>
        <Heading style={h1}>Welcome to Decks 🎧</Heading>
        <Text style={lead}>Hey {nickname}, glad to have you on Decks.</Text>
        <Text style={text}>
          Decks lets you shape the night from your phone — vote on what plays next,
          request your favourite tracks, and tip the DJ when they nail the moment.
        </Text>

        <Text style={h2}>How to join a DJ room</Text>
        <Text style={text}>
          1. Get the 5-letter room code from the DJ (or scan the QR at the venue).<br />
          2. Open <Link href={`${SITE_URL}/join`} style={link}>linku99.com/join</Link> and enter the code.<br />
          3. Browse the queue, vote, request a song, or tip the DJ.
        </Text>

        <Section style={{ textAlign: 'center', margin: '28px 0' }}>
          <Button style={button} href={`${SITE_URL}/join`}>Join a room</Button>
        </Section>

        <Text style={textMuted}>
          Questions? Just reply to this email or write us at{' '}
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
  subject: 'Welcome to Decks 🎧',
  displayName: 'Guest welcome',
  previewData: { nickname: 'Sam' },
} satisfies TemplateEntry

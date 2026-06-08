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
  Link,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({
  siteName,
  siteUrl,
  recipient,
  confirmationUrl,
}: SignupEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Welcome to Decks — you've got 15 starter points</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Welcome to Decks.</Heading>
        <Text style={lead}>You're officially in.</Text>

        <Text style={text}>
          Decks connects DJs and guests in real time. Request songs, vote on what the crowd
          wants, and use your starter points to boost your favorite tracks higher in the queue.
        </Text>

        <Section style={pointsBox}>
          <Text style={pointsLabel}>You've been awarded</Text>
          <Text style={pointsNumber}>15 Starter Points</Text>
        </Section>

        <Heading as="h2" style={h2}>Ways to earn points</Heading>
        <Text style={listItem}>+1 Join an event</Text>
        <Text style={listItem}>+1 Request a song</Text>

        <Heading as="h2" style={h2}>Ways to use points</Heading>
        <Text style={listItem}>Boost songs to increase visibility in the DJ's queue</Text>

        <Hr style={hr} />

        <Text style={remember}>
          <strong>The crowd picks. The DJ decides.</strong>
        </Text>
        <Text style={textMuted}>
          Boosts increase visibility only. DJs stay in full control of what gets played.
        </Text>

        <Section style={{ textAlign: 'center', margin: '28px 0' }}>
          <Button style={button} href={confirmationUrl}>
            Confirm your email
          </Button>
        </Section>

        <Text style={textMuted}>
          Once confirmed, you can{' '}
          <Link href={`${siteUrl}/join`} style={link}>join an event</Link> or{' '}
          <Link href={`${siteUrl}/auth?role=dj`} style={link}>start as a DJ</Link>.
        </Text>

        <Hr style={hr} />

        <Text style={footer}>
          Decks · <Link href={siteUrl} style={footerLink}>linku99.com</Link> ·{' '}
          <Link href="mailto:support@linku99.com" style={footerLink}>support@linku99.com</Link>
        </Text>
        <Text style={footerTiny}>
          You're receiving this because someone signed up for Decks with {recipient}.
          If that wasn't you, you can ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail

const main = {
  backgroundColor: '#ffffff',
  fontFamily:
    'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',
}
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = {
  fontSize: '24px',
  fontWeight: 'bold' as const,
  color: '#111111',
  margin: '0 0 8px',
}
const h2 = {
  fontSize: '15px',
  fontWeight: '600' as const,
  color: '#111111',
  margin: '20px 0 6px',
}
const lead = {
  fontSize: '15px',
  color: '#111111',
  margin: '0 0 16px',
}
const text = {
  fontSize: '14px',
  color: '#4B5563',
  lineHeight: '1.6',
  margin: '0 0 16px',
}
const textMuted = {
  fontSize: '13px',
  color: '#6B7280',
  lineHeight: '1.6',
  margin: '0 0 12px',
}
const listItem = {
  fontSize: '14px',
  color: '#4B5563',
  margin: '2px 0',
}
const pointsBox = {
  background: '#FDF2F8',
  border: '1px solid #FBCFE8',
  borderRadius: '12px',
  padding: '16px 20px',
  margin: '20px 0',
  textAlign: 'center' as const,
}
const pointsLabel = {
  fontSize: '12px',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.06em',
  color: '#9D174D',
  margin: '0 0 4px',
}
const pointsNumber = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: 'hsl(322, 70%, 45%)',
  margin: 0,
}
const remember = { fontSize: '14px', color: '#111111', margin: '4px 0' }
const hr = { borderColor: '#E5E7EB', margin: '24px 0' }
const link = { color: 'hsl(322, 70%, 50%)', textDecoration: 'underline' }
const button = {
  backgroundColor: 'hsl(322, 70%, 55%)',
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: '600' as const,
  borderRadius: '14px',
  padding: '12px 24px',
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: '#6B7280', margin: '8px 0 4px' }
const footerLink = { color: '#6B7280', textDecoration: 'underline' }
const footerTiny = { fontSize: '11px', color: '#9CA3AF', margin: '8px 0 0' }

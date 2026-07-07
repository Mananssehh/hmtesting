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

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
  recipient?: string
}

const SUPPORT_EMAIL = 'support@linku99.com'
const SITE_URL = 'https://linku99.com'

const firstNameFrom = (email?: string) => {
  if (!email) return ''
  const local = email.split('@')[0] || ''
  const seg = local.split(/[._+-]/)[0] || ''
  if (!seg) return ''
  return seg.charAt(0).toUpperCase() + seg.slice(1).toLowerCase()
}

export const RecoveryEmail = ({
  siteName,
  confirmationUrl,
  recipient,
}: RecoveryEmailProps) => {
  const firstName = firstNameFrom(recipient)
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>Reset your {siteName} password</Preview>
      <Body style={main}>
        <Container style={outer}>
        <Section style={{ textAlign: 'center', margin: '0 0 20px' }}>
          <Img src="https://linku99.com/brand/decks-logo.png?v=3" alt="Decks" width="72" height="72" style={{ display: 'block', margin: '0 auto', maxWidth: '100%', height: 'auto' }} />
        </Section>
          <Section style={card}>
            <Heading style={brand}>🎧 Decks</Heading>
            <Heading style={h1}>Reset your password</Heading>
            <Text style={lead}>
              Hi {firstName || 'there'},
            </Text>
            <Text style={text}>
              We received a request to reset your {siteName} password. Click the
              button below to create a new password.
            </Text>
            <Section style={{ textAlign: 'center', margin: '28px 0' }}>
              <Button style={button} href={confirmationUrl}>
                Reset Password
              </Button>
            </Section>
            <Text style={textMuted}>
              If you didn't request this, you can safely ignore this email — your
              password will not change. For security, this link will expire
              automatically.
            </Text>
            <Hr style={hr} />
            <Text style={footer}>
              Need help? <Link href={`mailto:${SUPPORT_EMAIL}`} style={footerLink}>{SUPPORT_EMAIL}</Link>
            </Text>
            <Text style={footerTiny}>
              © {new Date().getFullYear()} {siteName} · <Link href={SITE_URL} style={footerLink}>linku99.com</Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export default RecoveryEmail

const main = {
  backgroundColor: '#ffffff',
  fontFamily:
    'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',
  margin: 0,
  padding: '24px 0',
}
const outer = { padding: '0 16px', maxWidth: '600px', margin: '0 auto' }
const card = {
  backgroundColor: '#0B0B12',
  borderRadius: '20px',
  padding: '32px 28px',
  color: '#F5F5F7',
}
const brand = {
  fontSize: '14px',
  fontWeight: '600' as const,
  letterSpacing: '0.04em',
  color: '#F5F5F7',
  margin: '0 0 18px',
}
const h1 = {
  fontSize: '24px',
  fontWeight: 'bold' as const,
  color: '#FFFFFF',
  margin: '0 0 14px',
}
const lead = {
  fontSize: '15px',
  color: '#F5F5F7',
  margin: '0 0 8px',
}
const text = {
  fontSize: '14px',
  color: '#C7C7CC',
  lineHeight: '1.6',
  margin: '0 0 8px',
}
const textMuted = {
  fontSize: '13px',
  color: '#8E8E93',
  lineHeight: '1.6',
  margin: '0',
}
const button = {
  backgroundColor: 'hsl(322, 70%, 55%)',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: '600' as const,
  borderRadius: '14px',
  padding: '14px 28px',
  textDecoration: 'none',
  display: 'inline-block',
}
const hr = { borderColor: '#2A2A33', margin: '28px 0 18px' }
const footer = { fontSize: '12px', color: '#8E8E93', margin: '4px 0' }
const footerLink = { color: '#F5F5F7', textDecoration: 'underline' }
const footerTiny = { fontSize: '11px', color: '#6B6B70', margin: '6px 0 0' }

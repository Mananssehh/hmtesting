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
  footerLink, footerTiny, h1, hr, lead, link, main, text,
} from './_styles.ts'

interface Props {
  nickname?: string
  changedAt?: string
}

const Email = ({ nickname = 'there', changedAt }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your Decks password was changed</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={{ textAlign: 'center', margin: '0 0 20px' }}>
          <Img src="https://linku99.com/brand/decks-logo.png?v=3" alt="Decks" width="72" height="72" style={{ display: 'block', margin: '0 auto', maxWidth: '100%', height: 'auto' }} />
        </Section>
        <Heading style={h1}>Your password was changed</Heading>
        <Text style={lead}>Hey {nickname}, this is a confirmation from Decks.</Text>
        <Text style={text}>
          The password on your Decks account was just updated. If this was you, no
          action is needed.
        </Text>

        {changedAt ? (
          <>
            <Text style={detailLabel}>When</Text>
            <Text style={detailRow}>{changedAt}</Text>
          </>
        ) : null}

        <Text style={text}>
          <strong>Didn't change your password?</strong> Reset it immediately at{' '}
          <Link href={`${SITE_URL}/auth`} style={link}>linku99.com/auth</Link>{' '}
          and email <Link href={`mailto:${SUPPORT_EMAIL}`} style={link}>{SUPPORT_EMAIL}</Link>{' '}
          so we can help secure your account.
        </Text>

        <Hr style={hr} />
        <Text style={footer}>
          {BRAND} · <Link href={SITE_URL} style={footerLink}>linku99.com</Link> ·{' '}
          <Link href={`mailto:${SUPPORT_EMAIL}`} style={footerLink}>{SUPPORT_EMAIL}</Link>
        </Text>
        <Text style={footerTiny}>
          © {new Date().getFullYear()} Decks. Security notifications are always sent and can't be unsubscribed.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: 'Your Decks password was changed',
  displayName: 'Security: password changed',
  previewData: { nickname: 'Sam', changedAt: new Date().toUTCString() },
} satisfies TemplateEntry

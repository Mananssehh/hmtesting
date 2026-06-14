/**
 * Feature flags for the Decks monetization stack.
 *
 * Tips (real-money $ contributions to the DJ) are the launch model.
 * Boosts (points-based queue-visibility purchases) are paused but the
 * underlying code path is kept behind ENABLE_BOOSTS so it can be flipped
 * back on without refactoring.
 *
 * IMPORTANT: tips MUST NOT affect queue ordering. The queue is sorted by
 * votes, request time, and DJ actions only. See EventPage.tsx.
 */
export const ENABLE_TIPS = true;
export const ENABLE_BOOSTS = false;

/**
 * When false, the TipDialog will gate at the consent step and show a
 * "Tips launching soon" toast instead of opening Stripe Checkout.
 * Flip to true only after a live Stripe Connect integration ships.
 */
export const ENABLE_LIVE_STRIPE = true;

# Checkout Typography & UI Polish — Design

Date: 2026-06-10
Status: Approved (user confirmed: Baloo 2 + Nunito, site-wide; remove Contact Us; yellow accents toned down)

## Goal

Make the customer-facing site (Meta Ads → Checkout → Order → Payment funnel) feel
premium and playful, referencing the Melissa & Doug rounded-font look, while
removing conversion leaks from the checkout header.

## Changes

### 1. Typography — site-wide (`client/src/styles/tokens.css`)
- Google Fonts import switches to **Baloo 2** (600/700/800) + **Nunito** (400/600/700).
- `--font-heading: "Baloo 2"` (chunky rounded, closest free match to Melissa &
  Doug's Filson Soft headings).
- `--font-body: "Nunito"` (soft rounded, highly readable).
- Nunito renders lighter than Inter, so UI text previously at weight 500 moves
  to 600 where it must stay crisp (labels, buttons).

### 2. Checkout header cleanup (`client/src/pages/CheckoutPage.jsx`)
- Remove the "Contact Us" link (desktop nav + mobile side panel). It pointed to
  `/` and is a conversion leak for paid traffic.
- With one nav item left, the mobile hamburger + side panel are removed
  entirely; the **WhatsApp Us** pill shows on all screen sizes as the single
  support/trust action.

### 3. Checkout UI polish (`client/src/pages/CheckoutPage.css`)
- Page heading in Baloo 2 brand blue with one small, subtle accent underline
  (yellow toned down — this is the only new yellow element; no yellow card
  borders).
- Cards: 20px radius, slightly warmer shadow.
- Inputs: 12px radius, 2px borders, tuned blue focus ring.
- Primary CTA: pill shape, Baloo 2, subtle hover lift.
- Remove now-dead hamburger / side-panel / overlay styles.

## Out of scope
- Backend, tests logic, admin panel styling, landing-page header (keeps its
  Contact Us — only checkout is in the paid funnel).

## Verification
- `npm test` in `client/` — existing CheckoutPage tests pass (none reference
  the removed header links).
- Visual check on localhost:5173/checkout/car.

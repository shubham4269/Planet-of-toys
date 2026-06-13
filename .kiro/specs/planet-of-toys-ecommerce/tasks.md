# Implementation Plan: Planet of Toys Ecommerce

## Overview

This plan implements the Planet of Toys platform incrementally: a monorepo with a Node.js/Express API and a React (Vite) SPA backed by self-hosted MongoDB. Work proceeds from project scaffolding and shared infrastructure (config, security middleware, error handling) through data models and backend services (auth, products, orders, payments, shipping, OTP, WhatsApp, media, settings, webhooks), then the customer storefront and admin panel, and finally end-to-end wiring.

The implementation language is **JavaScript (Node.js + React/Vite)**, matching the design's technology choices. Property-based tests use **fast-check** integrated with **Vitest**, each running a minimum of 100 iterations and tagged with the design property reference. External dependencies (Razorpay, Shiprocket, WhatsApp) are mocked, and MongoDB-dependent properties run against an in-memory MongoDB.

## Tasks

- [x] 1. Set up project structure and configuration
  - [x] 1.1 Scaffold monorepo (client + server) and tooling
    - Create `client/` (Vite + React) and `server/` (Node.js + Express) workspaces with package manifests
    - Configure Vitest and install `fast-check` for both workspaces; set up shared scripts and directory layout (routers/controllers/services/models on the server; pages/components/lib on the client)
    - Establish the layered backend folder structure and a `/server/media` directory
    - _Requirements: 19.1, 29.1_

  - [x] 1.2 Implement environment configuration and startup validation
    - Define the required environment variable schema (encryption key, JWT secret, DB connection string, session expiration, allowed origins, rate-limit and upload settings)
    - On boot, validate presence of all required variables and fail fast (process exit) when any are missing; load bootstrap secrets only from environment variables
    - _Requirements: 29.1, 29.3, 29.4, 29.5_

  - [x]* 1.3 Write property test for startup environment validation
    - **Property 42: Startup requires all mandatory environment variables**
    - **Validates: Requirements 29.5**

- [x] 2. Implement backend core infrastructure and security middleware
  - [x] 2.1 Implement MongoDB connection and Express app bootstrap
    - Connect to MongoDB via Mongoose and create the Express application factory with router mounting points
    - _Requirements: 19.2_

  - [x] 2.2 Implement HTTP security and input-sanitization middleware
    - Apply `helmet` security headers and CORS restricted to configured allowed origins
    - Apply `express-mongo-sanitize` and XSS input sanitization that strips/neutralizes `$`-prefixed and dotted keys and escapes HTML while preserving safe content
    - _Requirements: 19.3, 19.4_

  - [x]* 2.3 Write property test for input sanitization
    - **Property 34: Input sanitization neutralizes injection payloads**
    - **Validates: Requirements 19.4**

  - [x] 2.4 Implement tiered rate limiters
    - Configure `express-rate-limit` instances for global public API, OTP, payment creation, order creation, and login endpoints; excess requests receive a rate-limit response
    - _Requirements: 19.3, 28.1, 28.2, 28.3, 28.4, 28.5_

  - [x]* 2.5 Write property test for rate-limited endpoints
    - **Property 41: Rate-limited endpoints reject excess requests**
    - **Validates: Requirements 28.1, 28.3, 28.4, 28.5**

  - [x] 2.6 Implement central error handler and server-side logger
    - Add a single error-handling middleware that returns a generic message and appropriate status, never serializing stack traces, schema, filesystem paths, secrets, tokens, or internal detail; write full detail only to the server-side log
    - _Requirements: 27.1, 27.2, 27.3, 27.4, 27.5_

  - [x]* 2.7 Write property test for error disclosure
    - **Property 40: Error responses disclose no internal detail**
    - **Validates: Requirements 27.1, 27.2, 27.3, 27.4**

- [x] 3. Implement data models
  - [x] 3.1 Create Mongoose schemas for all entities
    - Define Product, Order, Counter, Admin, AuditLog, SystemSettings, and UnmatchedWebhookEvent schemas with enumerations enforced at the schema level and password hashes/secrets excluded from serialized output
    - _Requirements: 9.2, 9.3, 16.1, 22.4, 26.5_

  - [x]* 3.2 Write property test for order enumeration constraints
    - **Property 18: Status and payment values stay within their enumerations**
    - **Validates: Requirements 9.2, 9.3**

- [x] 4. Implement Counter Service and sequential order identifiers
  - [x] 4.1 Implement atomic order-id generation
    - Implement `nextOrderId(date)` using atomic `findOneAndUpdate` with `$inc` and upsert, formatting `POT-YYMMDD-XXXX` with a zero-padded sequence
    - _Requirements: 8.1, 8.2, 8.3_

  - [x]* 4.2 Write property test for order identifier format
    - **Property 15: Order identifier format is well-formed**
    - **Validates: Requirements 8.1**

  - [x]* 4.3 Write property test for order identifier uniqueness
    - **Property 16: Order identifiers are unique**
    - **Validates: Requirements 8.2, 8.3**

- [x] 5. Implement credential encryption and System Settings
  - [x] 5.1 Implement AES-256-GCM credential encryption and resolution
    - Implement `encrypt`/`decrypt` using an env-sourced key and `getCredential(section, key)` that returns the encrypted System_Settings value when present and falls back to environment variables
    - _Requirements: 29.2, 30.7, 30.10, 30.11_

  - [x]* 5.2 Write property test for credential encryption round-trip
    - **Property 45: Credential encryption round-trip**
    - **Validates: Requirements 30.7**

  - [x]* 5.3 Write property test for credential resolution precedence
    - **Property 43: Integration credential resolution follows precedence**
    - **Validates: Requirements 29.2**

  - [x] 5.4 Implement System Settings service and routes
    - Implement get (masked), update (validate format → encrypt → persist with audit), and verify (live connection test) for Razorpay, Shiprocket, WhatsApp, and Meta Pixel sections; reject invalid formats without persisting; exclude secrets/tokens from all responses
    - _Requirements: 30.1, 30.2, 30.3, 30.4, 30.5, 30.6, 30.8, 30.9, 30.13, 30.14, 30.19, 30.20_

  - [x]* 5.5 Write property test for masked credential display
    - **Property 46: Stored credentials are displayed masked**
    - **Validates: Requirements 30.9**

  - [x]* 5.6 Write property test for invalid credential rejection
    - **Property 47: Invalid credential formats are rejected without persistence**
    - **Validates: Requirements 30.14**

- [x] 6. Implement Auth Service and Audit Log
  - [x] 6.1 Implement bcrypt password hashing and verification
    - Implement `hashPassword` and `verifyPassword` using bcrypt; store only bcrypt hashes, never plaintext
    - _Requirements: 14.4, 22.1, 22.2, 22.3_

  - [x]* 6.2 Write property test for bcrypt password storage
    - **Property 44: bcrypt password storage round-trip**
    - **Validates: Requirements 14.4, 22.1, 22.2, 22.3**

  - [x] 6.3 Implement JWT issuance and the requireAuth guard
    - Implement `issueToken` with configured `SESSION_EXPIRATION` and `requireAuth` middleware that validates signature and expiry, rejecting missing/expired/tampered tokens on admin and settings routes
    - _Requirements: 14.1, 14.3, 19.5, 21.1, 21.2, 21.4_

  - [x]* 6.4 Write property test for JWT round-trip and route guard
    - **Property 26: JWT login round-trip and guard**
    - **Validates: Requirements 14.1, 14.3, 19.5, 21.1, 21.2, 21.4, 30.1, 30.13**

  - [x] 6.5 Implement login endpoint with generic failures and brute-force protection
    - Implement `POST /api/admin/login` returning a token or a single generic authentication-failure response for wrong passwords and unregistered emails; apply login rate limiting and temporary source blocking past the configured threshold
    - _Requirements: 14.2, 25.1, 25.2, 25.3, 25.4_

  - [ ]* 6.6 Write property test for indistinguishable authentication failures
    - **Property 27: Authentication failures are indistinguishable**
    - **Validates: Requirements 14.2, 25.3, 25.4**

  - [ ]* 6.7 Write property test for login rate limiting
    - **Property 38: Login endpoint rate-limits abusive sources**
    - **Validates: Requirements 25.1, 25.2**

  - [x] 6.8 Implement Audit Log service and integrate auditable actions
    - Record an audit entry (action type, acting administrator, timestamp) for successful login, product create/update/delete, order cancellation, manual shipment retry, and settings create/update/delete; store server-side only
    - _Requirements: 26.1, 26.2, 26.3, 26.4, 26.5, 30.12_

  - [ ]* 6.9 Write property test for audit logging
    - **Property 39: Auditable administrator actions produce audit entries**
    - **Validates: Requirements 26.1, 26.2, 26.3, 26.4, 30.12**

- [x] 7. Implement Media Service
  - [x] 7.1 Implement upload validation, WebP processing, and static serving
    - Validate file type against the allowed set and reject executables/unsupported formats and oversized files; assign unique filenames; transcode images to WebP via Sharp; store under `/server/media`; serve media as static, non-executing content
    - _Requirements: 18.1, 18.2, 18.3, 23.1, 23.2, 23.3, 23.4, 23.5_

  - [x]* 7.2 Write property test for upload type/size validation
    - **Property 35: Upload validation enforces type and size**
    - **Validates: Requirements 23.1, 23.3**

  - [x]* 7.3 Write property test for unique upload filenames
    - **Property 36: Accepted uploads receive unique filenames**
    - **Validates: Requirements 23.4**

  - [x]* 7.4 Write property test for WebP image storage
    - **Property 33: Uploaded images are stored as WebP**
    - **Validates: Requirements 18.2**

  - [x]* 7.5 Write integration test for media storage and serving
    - Verify media is stored under `/server/media` and served as static, non-executing content
    - _Requirements: 18.1, 23.5_

- [x] 8. Implement Product Service
  - [x] 8.1 Implement product CRUD, slug generation, and projections
    - Implement create/update/delete, unique slug generation from name, active/stock state toggle, computed discount percentage, public active-product projection without internal fields, and media association
    - _Requirements: 1.1, 1.6, 16.1, 16.2, 16.3, 16.4, 16.5_

  - [x]* 8.2 Write property test for product persistence round-trip
    - **Property 29: Product persistence round-trip**
    - **Validates: Requirements 16.1, 16.4**

  - [x]* 8.3 Write property test for slug uniqueness
    - **Property 30: Generated slugs are URL-safe and unique**
    - **Validates: Requirements 16.2**

  - [x]* 8.4 Write property test for active-product resolution
    - **Property 4: Only active products resolve**
    - **Validates: Requirements 1.6**

  - [x]* 8.5 Write property test for discount computation
    - **Property 1: Discount percentage is correctly computed and bounded**
    - **Validates: Requirements 1.1**

  - [x]* 8.6 Write unit tests for product delete and media association
    - Test product deletion removal and media-to-product association
    - _Requirements: 16.3, 16.5_

- [x] 9. Implement OTP Manager and WhatsApp Service
  - [x] 9.1 Implement in-memory OTP generation, verification, and rate limiting
    - Generate six-digit codes with a 5-minute TTL; verify matching unexpired codes; reject mismatched/expired codes; rate-limit to three requests per phone number per ten-minute window
    - _Requirements: 6.3, 6.4, 7.1, 7.2, 7.3, 7.4_

  - [x]* 9.2 Write property test for OTP generation format and TTL
    - **Property 13: Generated OTP is six numeric digits with a five-minute TTL**
    - **Validates: Requirements 7.1, 7.2**

  - [x]* 9.3 Write property test for OTP rate limiting
    - **Property 14: OTP issuance is rate-limited per phone number**
    - **Validates: Requirements 7.4, 28.2**

  - [x] 9.4 Implement WhatsApp Service for OTP and order notifications
    - Implement `sendOtp` and `sendNotification` for order-confirmed, shipment-created, order-shipped, out-for-delivery, delivered, and cancelled templates via the WhatsApp Cloud API; send failures are logged and non-blocking
    - _Requirements: 6.1, 13.1, 13.2, 13.3, 13.4, 13.5_

  - [x]* 9.5 Write property test for status-to-template dispatch
    - **Property 25: Status transitions dispatch the correct WhatsApp templates**
    - **Validates: Requirements 13.2, 13.3, 13.4, 13.5**

  - [x]* 9.6 Write integration test for WhatsApp order-confirmed send
    - Verify the order-confirmed notification is dispatched on order creation
    - _Requirements: 6.1, 13.1_

- [x] 10. Implement Payment Service (Razorpay)
  - [x] 10.1 Implement Razorpay order creation and signature verification
    - Implement `POST /api/payment/razorpay-order` returning the Razorpay order id and amount without secrets, and server-side `verifySignature` using HMAC-SHA256 over `order_id + "|" + payment_id` with the key secret
    - _Requirements: 5.1, 5.2, 5.5_

  - [x]* 10.2 Write property test for signature verification
    - **Property 9: Razorpay signature verification is sound and tamper-evident**
    - **Validates: Requirements 5.2**

  - [x]* 10.3 Write property test for payment status outcome
    - **Property 10: Payment status follows signature verification result**
    - **Validates: Requirements 5.3, 5.4**

  - [x]* 10.4 Write integration test for Razorpay order creation
    - Verify a Razorpay order is created for the order total
    - _Requirements: 5.1_

- [x] 11. Implement Shipping Service (Shiprocket)
  - [x] 11.1 Implement token caching, refresh, and serviceability
    - Implement `getToken` (authenticate on missing token, reuse valid cached token, re-authenticate and retry on expiry) and `checkServiceability(pincode)`; exclude credentials/tokens from responses
    - _Requirements: 4.3, 10.1, 10.2, 10.3, 10.4_

  - [x]* 11.2 Write property test for cached token reuse
    - **Property 20: A valid cached Shiprocket token is reused**
    - **Validates: Requirements 10.2**

  - [x] 11.3 Implement shipment creation, failure handling, and retry sweep
    - Implement `createShipment` (create SR order → assign courier → generate AWB) storing AWB/courier and setting `shipmentStatus = CREATED` on success; on failure or unavailability, log the reason, keep `shipmentStatus = PENDING`, never throw to the caller; implement the background `retryPendingShipments` sweep
    - _Requirements: 11.1, 11.2, 11.3, 11.5, 11.6, 11.7, 17.5, 17.6_

  - [x]* 11.4 Write property test for successful fulfilment transition
    - **Property 21: Successful Shiprocket fulfilment transitions to CREATED**
    - **Validates: Requirements 11.3, 17.5**

  - [ ]* 11.5 Write unit tests for token refresh, retry sweep, and manual trigger
    - Test token refresh-on-401, background retry sweep behavior, and presence of the admin manual-trigger control
    - _Requirements: 10.3, 11.7, 11.8_

  - [ ]* 11.6 Write integration test for serviceability and shipment happy path
    - Verify pincode serviceability and the Shiprocket auth + create/assign/AWB happy path
    - _Requirements: 4.3, 10.1, 11.1, 11.2_

- [x] 12. Implement Order Service and lifecycle
  - [x] 12.1 Implement order creation and decoupled fulfilment trigger
    - Implement `createOrder` setting `Order_Status = CONFIRMED`, `Shipment_Status = PENDING`, seeding status history, assigning the sequential id, persisting captured UTM, dispatching the order-confirmed WhatsApp notification, and triggering out-of-band Shiprocket fulfilment; verified online payments are PAID and verification failures are FAILED without creating a confirmed order; the customer success response carries no shipping/technical detail
    - _Requirements: 2.2, 5.3, 5.4, 9.1, 11.4, 11.9, 13.1_

  - [x]* 12.2 Write property test for initial order state
    - **Property 17: Orders are created with correct initial state**
    - **Validates: Requirements 9.1, 11.4**

  - [x]* 12.3 Write property test for UTM capture and persistence round-trip
    - **Property 5: UTM capture and persistence round-trip**
    - **Validates: Requirements 2.1, 2.2, 2.3**

  - [x]* 12.4 Write property test for COD OTP verification and order creation
    - **Property 12: OTP verification succeeds only for the matching, unexpired code**
    - **Validates: Requirements 6.2, 6.3, 6.4, 6.5, 7.3**

  - [x]* 12.5 Write property test for shipping-failure isolation
    - **Property 22: Shipping-provider failure never blocks or leaks to the customer order**
    - **Validates: Requirements 11.5, 11.9, 17.6**

  - [x] 12.6 Implement status changes, history, and cancellation
    - Implement `applyStatusChange` appending one status-history entry per change and dispatching the mapped WhatsApp template; implement administrator cancellation setting `CANCELLED` with a history entry and audit log
    - _Requirements: 9.4, 12.2, 17.3_

  - [ ]* 12.7 Write property test for status-history append invariant
    - **Property 19: Every status change appends one history entry**
    - **Validates: Requirements 9.4, 12.2, 17.3**

  - [ ]* 12.8 Write property test for administrator cancellation
    - **Property 32: Administrator cancellation sets CANCELLED with history**
    - **Validates: Requirements 17.3**

  - [x] 12.9 Implement order listing and detail
    - Implement filtered/searchable/paginated order listing and order detail with customer, payment, shipment, shipment status, and the status-history timeline
    - _Requirements: 17.1, 17.2_

  - [ ]* 12.10 Write property test for order listing and pagination
    - **Property 31: Order listing filters and paginates correctly**
    - **Validates: Requirements 17.1**

  - [x] 12.11 Implement dashboard statistics aggregation
    - Implement order count, revenue, and status-breakdown aggregation over the order set
    - _Requirements: 15.1_

  - [ ]* 12.12 Write property test for dashboard aggregates
    - **Property 28: Dashboard aggregates match the order set**
    - **Validates: Requirements 15.1**

- [ ] 13. Implement Webhook Handler
  - [x] 13.1 Implement Shiprocket webhook processing with authenticity verification
    - Verify webhook authenticity first; map recognized statuses to `Order_Status` and update the matching order with a history entry; reject and record unmatched orders; reject and log failed authenticity verification; never expose a manual shipping-status control
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 24.1, 24.2, 24.3, 24.4_

  - [ ]* 13.2 Write property test for webhook status mapping
    - **Property 23: Webhook status mapping updates the matching order**
    - **Validates: Requirements 12.1**

  - [ ]* 13.3 Write property test for unmatched webhook handling
    - **Property 24: Unmatched webhooks are rejected and recorded without mutation**
    - **Validates: Requirements 12.4**

  - [ ]* 13.4 Write property test for webhook authenticity gating
    - **Property 37: Only authentic webhooks are processed**
    - **Validates: Requirements 24.1, 24.2, 24.4**

  - [ ]* 13.5 Write unit test for absence of manual status control
    - Verify no manual shipping-status update control is exposed to the administrator
    - _Requirements: 12.3_

- [ ] 14. Checkpoint - backend
  - Ensure all tests pass, ask the user if questions arise.

- [x] 15. Implement frontend foundation and Pixel tracking
  - [x] 15.1 Implement SPA shell, routing, design tokens, and API client
    - Set up React Router, the customer/admin route split, shared design tokens (color/typography/spacing/radii CSS custom properties), and an API client
    - _Requirements: 20.2_

  - [x] 15.2 Implement Pixel Tracker and UTM capture
    - Implement an `fbq` wrapper exposing `pageView`, `viewContent`, `initiateCheckout`, `purchase(value)` reading `VITE_META_PIXEL_ID` at build time; implement UTM capture into sessionStorage (empty record when absent)
    - _Requirements: 2.1, 2.3, 3.1, 3.2, 3.3, 3.4_

  - [x]* 15.3 Write unit test for Pixel event firing
    - Test `PageView`/`ViewContent`/`InitiateCheckout` firing with a mocked `fbq`
    - _Requirements: 3.1, 3.2_

  - [x]* 15.4 Write property test for Purchase event value
    - **Property 6: Purchase event carries the order value**
    - **Validates: Requirements 3.3**

- [x] 16. Implement Landing Page
  - [x] 16.1 Implement the landing page sections and behaviors
    - Render the ten conversion-ordered sections, image gallery, video, name/price/compare-at/discount, reactive quantity total, trust badges, FAQ accordion, sticky buy-now CTA, out-of-stock indicator with disabled buy-now, and the not-found view; fire `PageView` + `ViewContent` and capture UTM on mount
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 3.1_

  - [ ]* 16.2 Write property test for quantity-scaled total
    - **Property 2: Quantity scales the displayed total**
    - **Validates: Requirements 1.4**

  - [ ]* 16.3 Write property test for out-of-stock control state
    - **Property 3: Out-of-stock disables purchase exactly when stock is zero**
    - **Validates: Requirements 1.5**

  - [ ]* 16.4 Write unit tests for page rendering and section presence
    - Test landing, checkout, and success page rendering and section presence
    - _Requirements: 1.2, 1.3, 4.1, 4.2, 4.6, 20.1_

- [x] 17. Implement Checkout Page
  - [x] 17.1 Implement checkout summary, form, serviceability, and payment flows
    - Render the order summary; implement the customer form with per-field validation; call pincode serviceability and block submission when non-serviceable; provide the Online/COD payment selector; implement the Razorpay checkout-and-verify flow and the COD OTP request/entry flow; fire `InitiateCheckout` on entry
    - _Requirements: 4.1, 4.2, 4.4, 4.5, 4.6, 5.1, 6.1, 6.2, 6.3_

  - [ ]* 17.2 Write property test for non-serviceable submission blocking
    - **Property 7: Non-serviceable pincodes block submission**
    - **Validates: Requirements 4.4**

  - [ ]* 17.3 Write property test for checkout form validation
    - **Property 8: Invalid checkout forms are rejected with field identification**
    - **Validates: Requirements 4.5**

- [x] 18. Implement Order Success and legal pages
  - [x] 18.1 Implement order success and policy pages
    - Render the order identifier and summary and fire the `Purchase` event with the order value; add privacy policy, terms of service, shipping policy, and refund policy pages with footer links
    - _Requirements: 3.3, 20.1, 20.2_

- [x] 19. Implement Admin Panel
  - [x] 19.1 Implement admin shell, dark theme, route guard, and login
    - Implement the dark-theme admin shell, the client-side route guard checking JWT presence/validity, the login page, and redirect to login on expired sessions
    - _Requirements: 15.2, 21.3_

  - [ ]* 19.2 Write unit test for admin dark theme
    - Verify the admin interface renders using the dark theme
    - _Requirements: 15.2_

  - [x] 19.3 Implement the dashboard view
    - Display order count, revenue, and status-breakdown statistics
    - _Requirements: 15.1_

  - [x] 19.4 Implement product management UI
    - Implement product create/update/delete, media upload, and active/stock toggles
    - _Requirements: 16.1, 16.3, 16.4, 16.5_

  - [x] 19.5 Implement order management UI
    - Implement the order list with filter/search/pagination, order detail with timeline, cancellation, and the manual courier-assignment/AWB-generation trigger for PENDING shipments
    - _Requirements: 11.8, 17.1, 17.2, 17.3, 17.4_

  - [x] 19.6 Implement System Settings module UI
    - Implement the four configuration sections with masked credential display, format validation feedback, and the Test-Connection/Verify action
    - _Requirements: 30.1, 30.2, 30.3, 30.4, 30.5, 30.6, 30.9, 30.15_

  - [ ]* 19.7 Write unit test for settings sections and test-connection
    - Verify the settings sections/fields and the Test-Connection action are present
    - _Requirements: 30.2, 30.3, 30.4, 30.5, 30.6, 30.15_

  - [ ]* 19.8 Write integration test for live credential verification
    - Verify live credential verification succeeds/fails without leaking secrets
    - _Requirements: 30.16, 30.17, 30.18_

- [ ] 20. Integration and wiring
  - [x] 20.1 Wire routers, middleware, and the end-to-end conversion flow
    - Mount all routers behind security middleware and rate limiters; connect the SPA to the API; wire the full Meta Ad → landing → checkout → payment/COD → order → fulfilment → notifications path; register the background retry sweep
    - _Requirements: 11.7, 19.3, 19.5_

  - [ ]* 20.2 Write property test for secret exclusion across responses
    - **Property 11: No secret appears in any frontend response**
    - **Validates: Requirements 5.5, 10.4, 19.1, 22.4, 26.5, 27.4, 30.8, 30.20**

  - [ ]* 20.3 Write smoke/configuration tests
    - Verify `VITE_META_PIXEL_ID` read at build time, no third-party object storage, security headers/CORS/rate limiters mounted, and bootstrap secrets sourced only from environment
    - _Requirements: 3.4, 18.3, 19.3, 29.1, 29.3, 30.11_

  - [ ]* 20.4 Write end-to-end integration tests for the conversion flow
    - Test the online-payment and COD order-creation paths end-to-end with mocked integrations
    - _Requirements: 4.3, 5.1, 6.1, 13.1_

- [ ] 21. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test tasks and can be skipped for a faster MVP; core implementation tasks are never optional.
- Each task references specific requirements (granular sub-requirement clauses) for traceability.
- Each property-based test implements exactly one design property at 100+ iterations using fast-check, tagged `// Feature: planet-of-toys-ecommerce, Property {number}: {property_text}`.
- Checkpoints ensure incremental validation at the backend and final boundaries.
- External integrations (Razorpay, Shiprocket, WhatsApp) are mocked in property tests; MongoDB-dependent properties use an in-memory MongoDB.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1", "3.1"] },
    { "id": 2, "tasks": ["1.3", "2.2", "2.4", "2.6", "3.2", "4.1", "5.1", "6.1", "7.1", "8.1", "9.1", "10.1", "11.1", "15.1", "15.2"] },
    { "id": 3, "tasks": ["2.3", "2.5", "2.7", "4.2", "4.3", "5.2", "5.3", "5.4", "6.2", "6.3", "7.2", "7.3", "7.4", "7.5", "8.2", "8.3", "8.4", "8.5", "8.6", "9.2", "9.3", "9.4", "10.2", "10.3", "10.4", "11.2", "11.3", "12.1", "15.3", "15.4", "16.1"] },
    { "id": 4, "tasks": ["5.5", "5.6", "6.4", "6.5", "6.8", "9.5", "9.6", "11.4", "11.5", "11.6", "12.2", "12.3", "12.4", "12.5", "12.6", "12.9", "12.11", "16.2", "16.3", "16.4", "17.1", "18.1", "19.1", "19.3", "19.4", "19.5", "19.6"] },
    { "id": 5, "tasks": ["6.6", "6.7", "6.9", "12.7", "12.8", "12.10", "12.12", "13.1", "17.2", "17.3", "19.2", "19.7", "19.8"] },
    { "id": 6, "tasks": ["13.2", "13.3", "13.4", "13.5", "20.1"] },
    { "id": 7, "tasks": ["20.2", "20.3", "20.4"] }
  ]
}
```

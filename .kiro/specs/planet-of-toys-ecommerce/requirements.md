# Requirements Document

## Introduction

Planet of Toys is a high-conversion ecommerce platform optimized for Meta Ads traffic. The platform guides a visitor from a Meta advertisement through a product landing page, checkout, payment (online via Razorpay or Cash on Delivery), order creation, automated shipping via Shiprocket, and WhatsApp notifications through delivery. The system includes a customer-facing storefront and a route-guarded admin panel within a single React Single Page Application, backed by a Node.js/Express API and a self-hosted MongoDB database.

The primary conversion flow is: Meta Ad → Product Landing Page → Checkout → Payment/COD → WhatsApp OTP (COD only) → Order Creation → Shiprocket Automation → WhatsApp Updates → Delivery.

This document defines the functional and non-functional requirements for the platform. Several third-party credentials (WhatsApp Cloud API, Razorpay, Shiprocket, Meta Pixel ID) are required at deployment time and are treated as configuration provided through environment variables.

## Glossary

- **System**: The complete Planet of Toys platform, comprising frontend SPA and backend API.
- **Backend**: The Node.js/Express server application that exposes the API and runs server-side logic.
- **Landing_Page**: The customer-facing product landing page optimized for ad-driven conversion.
- **Checkout_Page**: The customer-facing page where the customer enters order details and selects a payment method.
- **Order_Success_Page**: The page shown to the customer after an order is successfully created.
- **Product_Service**: The backend component responsible for product data retrieval and management.
- **Order_Service**: The backend component responsible for order creation, retrieval, and status management.
- **Counter_Service**: The backend component that generates sequential order identifiers using an atomic counter.
- **OTP_Manager**: The backend component that generates, stores, validates, and rate-limits one-time passwords.
- **Payment_Service**: The backend component that integrates with Razorpay to create payment orders and verify payment signatures.
- **Shipping_Service**: The backend component that integrates with Shiprocket for serviceability checks, order creation, AWB generation, and courier assignment.
- **Webhook_Handler**: The backend component that receives and processes Shiprocket status webhooks.
- **WhatsApp_Service**: The backend component that sends OTP and order-notification messages through the Meta WhatsApp Business Cloud API.
- **Pixel_Tracker**: The frontend component that sends standard Meta Pixel events for ad attribution.
- **Auth_Service**: The backend component that authenticates administrators and issues and validates JSON Web Tokens.
- **Admin_Panel**: The route-guarded administrative section of the SPA.
- **Media_Service**: The backend component that stores and processes media files on the local server filesystem.
- **OTP**: A six-digit numeric one-time password used to verify a customer phone number for Cash on Delivery orders.
- **COD**: Cash on Delivery, a payment method where payment is collected at delivery.
- **AWB**: Air Waybill, the tracking number assigned to a shipment by a courier.
- **UTM_Parameters**: Marketing attribution parameters (utm_source, utm_medium, utm_campaign, utm_term, utm_content) captured from the landing URL.
- **Order_Status**: The fulfilment state of an order, one of CONFIRMED, PACKED, SHIPPED, OUT_FOR_DELIVERY, DELIVERED, CANCELLED, or RTO.
- **Payment_Status**: The payment state of an order, one of PENDING, PAID, or FAILED.
- **Shipment_Status**: The shipment-creation sub-state of an order, distinct from Order_Status, one of PENDING or CREATED, where PENDING indicates Shiprocket courier assignment and AWB generation are not yet complete (including after a failed or unavailable Shiprocket attempt that is awaiting retry), and CREATED indicates a courier is assigned and an AWB is generated.
- **JWT**: JSON Web Token used for administrator session authentication.
- **Administrator**: A user authenticated through the Admin_Panel with management privileges.
- **Slug**: A URL-friendly unique identifier derived from a product name.
- **Audit_Log**: A server-side record of security-relevant Administrator actions, including the action type, the acting Administrator, and the action timestamp, retained on the Backend and inaccessible to customers.
- **System_Settings**: The admin-managed platform configuration store, persisted on the Backend, that holds integration configuration sections (Razorpay, Shiprocket, WhatsApp, Meta Pixel) with sensitive credentials stored in encrypted form.

## Requirements

### Requirement 1: Product Landing Page Display

**User Story:** As a customer arriving from a Meta ad, I want a rich product landing page, so that I can evaluate the product and decide to buy.

#### Acceptance Criteria

1. WHEN a customer opens a product Landing_Page for an active product, THE Landing_Page SHALL display the product image gallery, video player, name, price, compare-at price, and computed discount percentage.
2. THE Landing_Page SHALL display the product rich description, feature list, specifications, and a FAQ accordion.
3. THE Landing_Page SHALL display trust badges and a sticky buy-now control that remains visible while the customer scrolls.
4. WHEN a customer selects a product quantity, THE Landing_Page SHALL update the displayed total price to reflect the selected quantity.
5. WHILE a product stock quantity is zero, THE Landing_Page SHALL display an out-of-stock indicator and disable the buy-now control.
6. IF a requested product slug does not correspond to an active product, THEN THE Landing_Page SHALL display a not-found message.

### Requirement 2: UTM Attribution Capture

**User Story:** As a marketer, I want UTM parameters captured and persisted, so that I can attribute orders to ad campaigns.

#### Acceptance Criteria

1. WHEN a customer opens the Landing_Page with UTM_Parameters present in the page URL, THE Landing_Page SHALL store the UTM_Parameters in browser sessionStorage.
2. WHEN an order is created, THE Order_Service SHALL persist the UTM_Parameters captured for that customer session with the order record.
3. IF no UTM_Parameters are present in the page URL, THEN THE Landing_Page SHALL store an empty attribution record in browser sessionStorage.

### Requirement 3: Meta Pixel Event Tracking

**User Story:** As a marketer, I want standard Meta Pixel events fired, so that ad performance can be measured and optimized.

#### Acceptance Criteria

1. WHEN the Landing_Page loads, THE Pixel_Tracker SHALL send a PageView event and a ViewContent event to the configured Meta Pixel.
2. WHEN a customer begins checkout, THE Pixel_Tracker SHALL send an InitiateCheckout event.
3. WHEN an order is successfully created, THE Pixel_Tracker SHALL send a Purchase event that includes the order value.
4. THE Pixel_Tracker SHALL read the Meta Pixel identifier from the VITE_META_PIXEL_ID environment variable at build time.

### Requirement 4: Checkout and Pincode Serviceability

**User Story:** As a customer, I want to enter my delivery details and confirm serviceability, so that I can complete a valid order.

#### Acceptance Criteria

1. THE Checkout_Page SHALL display an order summary that includes the product, selected quantity, and total amount.
2. THE Checkout_Page SHALL provide a customer form that collects name, phone number, email, full address, city, state, and pincode.
3. WHEN a customer submits a pincode for serviceability validation, THE Shipping_Service SHALL query Shiprocket serviceability and return whether delivery is available for the pincode.
4. IF a submitted pincode is not serviceable, THEN THE Checkout_Page SHALL display a non-serviceable message and prevent order submission for that pincode.
5. IF a required checkout form field is missing or invalid, THEN THE Checkout_Page SHALL display a validation message identifying the affected field and prevent order submission.
6. THE Checkout_Page SHALL provide a payment method selector offering Online payment and Cash on Delivery.

### Requirement 5: Online Payment via Razorpay

**User Story:** As a customer, I want to pay online securely, so that my order is confirmed immediately.

#### Acceptance Criteria

1. WHEN a customer with a valid checkout form selects Online payment and proceeds, THE Payment_Service SHALL create a Razorpay order for the order total amount and return the Razorpay order identifier to the Checkout_Page.
2. WHEN the customer completes the Razorpay payment, THE Payment_Service SHALL verify the payment signature using HMAC SHA256 with the Razorpay key secret on the Backend.
3. WHEN payment signature verification succeeds, THE Order_Service SHALL create the order with Payment_Status set to PAID.
4. IF payment signature verification fails, THEN THE Order_Service SHALL set Payment_Status to FAILED and SHALL NOT create a confirmed order.
5. THE Payment_Service SHALL perform Razorpay order creation and signature verification only on the Backend and SHALL exclude the Razorpay key secret from all responses sent to the frontend.

### Requirement 6: Cash on Delivery OTP Verification

**User Story:** As a business owner, I want COD orders verified by WhatsApp OTP, so that I reduce fake orders.

#### Acceptance Criteria

1. WHEN a customer completes the full checkout form and selects Cash on Delivery, THE OTP_Manager SHALL generate an OTP and THE WhatsApp_Service SHALL send the OTP to the customer phone number using the WhatsApp OTP template.
2. WHEN a customer submits an OTP that matches the stored OTP for that phone number and is within the validity period, THE Order_Service SHALL create the order with payment method Cash on Delivery and Payment_Status set to PENDING.
3. IF a customer submits an OTP that does not match the stored OTP, THEN THE OTP_Manager SHALL reject the verification and THE Checkout_Page SHALL display a verification-failed message.
4. IF a customer submits an OTP after the OTP validity period has elapsed, THEN THE OTP_Manager SHALL reject the verification as expired.
5. THE Order_Service SHALL create a Cash on Delivery order only after OTP verification succeeds.

### Requirement 7: OTP Generation and Rate Limiting

**User Story:** As a business owner, I want OTP generation controlled and time-limited, so that the system resists abuse.

#### Acceptance Criteria

1. WHEN the OTP_Manager generates an OTP, THE OTP_Manager SHALL produce a six-digit numeric value.
2. THE OTP_Manager SHALL store each OTP in memory with a time-to-live of five minutes from generation.
3. WHEN five minutes have elapsed since an OTP was generated, THE OTP_Manager SHALL treat that OTP as expired and invalid for verification.
4. IF a phone number has been sent three OTPs within a ten-minute window, THEN THE OTP_Manager SHALL reject further OTP requests for that phone number until the window elapses.

### Requirement 8: Sequential Order Identifier Generation

**User Story:** As an operations user, I want human-readable sequential order IDs, so that orders are easy to reference.

#### Acceptance Criteria

1. WHEN an order is created, THE Counter_Service SHALL generate an order identifier in the format POT-YYMMDD-XXXX, where YYMMDD is the order creation date and XXXX is a zero-padded sequence number.
2. THE Counter_Service SHALL increment the sequence number using an atomic database operation so that each generated order identifier is unique.
3. WHEN two orders are created concurrently, THE Counter_Service SHALL assign distinct order identifiers to each order.

### Requirement 9: Order Status Lifecycle

**User Story:** As an operations user, I want a defined order lifecycle, so that order progress is tracked consistently.

#### Acceptance Criteria

1. WHEN an order is created, THE Order_Service SHALL set Order_Status to CONFIRMED.
2. THE Order_Service SHALL restrict Order_Status to one of CONFIRMED, PACKED, SHIPPED, OUT_FOR_DELIVERY, DELIVERED, CANCELLED, or RTO.
3. THE Order_Service SHALL restrict Payment_Status to one of PENDING, PAID, or FAILED.
4. WHEN the Order_Status of an order changes, THE Order_Service SHALL append a status-history entry recording the new status and the change timestamp.

### Requirement 10: Shiprocket Authentication Token Management

**User Story:** As a developer, I want Shiprocket tokens cached and refreshed automatically, so that shipping calls succeed without manual intervention.

#### Acceptance Criteria

1. WHEN the Shipping_Service requires a Shiprocket token and no valid cached token exists, THE Shipping_Service SHALL authenticate with Shiprocket using the configured Shiprocket user email and password and SHALL cache the returned token.
2. WHILE a cached Shiprocket token is valid, THE Shipping_Service SHALL reuse the cached token for Shiprocket requests.
3. IF a Shiprocket request fails because the cached token is expired, THEN THE Shipping_Service SHALL re-authenticate, refresh the cached token, and retry the request.
4. THE Shipping_Service SHALL exclude Shiprocket credentials and tokens from all responses sent to the frontend.

### Requirement 11: Automated Shipment Creation

**User Story:** As an operations user, I want shipments created automatically and resiliently, so that orders move to fulfilment without manual steps and a shipping-provider failure never blocks a customer order.

#### Acceptance Criteria

1. WHEN an order is created, THE Shipping_Service SHALL create a corresponding Shiprocket order automatically.
2. WHEN a Shiprocket order is created, THE Shipping_Service SHALL assign a courier and generate an AWB automatically.
3. WHEN a courier is assigned and an AWB is generated for an order, THE Order_Service SHALL store the AWB and courier details with the order record and SHALL set the Shipment_Status to CREATED.
4. WHEN an order is created, THE Order_Service SHALL set the Shipment_Status to PENDING until a courier is assigned and an AWB is generated.
5. IF Shiprocket returns an error or is temporarily unavailable during Shiprocket order creation, courier assignment, or AWB generation, THEN THE Order_Service SHALL retain the customer order as successfully created and SHALL set the Shipment_Status to PENDING.
6. IF Shiprocket returns an error or is temporarily unavailable during Shiprocket order creation, courier assignment, or AWB generation, THEN THE Shipping_Service SHALL record the failure reason in the server-side log.
7. WHILE an order has Shipment_Status set to PENDING, THE Shipping_Service SHALL automatically retry Shiprocket courier assignment and AWB generation.
8. WHERE an order has Shipment_Status set to PENDING, THE Admin_Panel SHALL provide an authenticated Administrator a control to manually trigger Shiprocket courier assignment and AWB generation for that order.
9. IF Shiprocket returns an error or is temporarily unavailable, THEN THE System SHALL present the customer an order-success outcome without shipping-provider error messages or technical failure details.

### Requirement 12: Shiprocket Status Webhook Processing

**User Story:** As an operations user, I want shipping status updated from Shiprocket webhooks, so that order status reflects real courier progress.

#### Acceptance Criteria

1. WHEN the Webhook_Handler receives a valid Shiprocket status webhook, THE Order_Service SHALL update the Order_Status of the matching order to the mapped status.
2. WHEN the Order_Status is updated from a webhook, THE Order_Service SHALL append a status-history entry recording the new status and the change timestamp.
3. THE Order_Service SHALL update shipping-derived Order_Status values only from Shiprocket webhooks and SHALL NOT expose a manual shipping-status update control to the Administrator, while still permitting the Administrator to manually trigger courier assignment and AWB generation for orders with Shipment_Status set to PENDING as defined in Requirement 11.
4. IF a received webhook does not match any existing order, THEN THE Webhook_Handler SHALL reject the webhook and record the unmatched event.

### Requirement 13: WhatsApp Order Notifications

**User Story:** As a customer, I want WhatsApp updates on my order, so that I know its status.

#### Acceptance Criteria

1. WHEN an order is created, THE WhatsApp_Service SHALL send an order-confirmed notification to the customer phone number using the order-confirmed template.
2. WHEN the Order_Status changes to SHIPPED, THE WhatsApp_Service SHALL send a shipment-created notification and an order-shipped notification to the customer phone number using the corresponding templates.
3. WHEN the Order_Status changes to OUT_FOR_DELIVERY, THE WhatsApp_Service SHALL send an out-for-delivery notification using the out-for-delivery template.
4. WHEN the Order_Status changes to DELIVERED, THE WhatsApp_Service SHALL send a delivered notification using the delivered template.
5. WHEN the Order_Status changes to CANCELLED, THE WhatsApp_Service SHALL send a cancelled notification using the cancelled template.

### Requirement 14: Administrator Authentication

**User Story:** As an administrator, I want secure email and password login, so that only authorized users access the admin panel.

#### Acceptance Criteria

1. WHEN an Administrator submits valid email and password credentials, THE Auth_Service SHALL issue a signed JWT to the Admin_Panel.
2. IF an Administrator submits invalid credentials, THEN THE Auth_Service SHALL reject the login and return an authentication-failed response without revealing which field was incorrect.
3. WHEN a request is made to an admin route, THE Auth_Service SHALL validate the JWT and SHALL reject the request if the JWT is missing, expired, or invalid.
4. THE Auth_Service SHALL store administrator passwords only as salted cryptographic hashes.

### Requirement 15: Administrator Dashboard

**User Story:** As an administrator, I want a dashboard with key statistics, so that I can monitor business performance.

#### Acceptance Criteria

1. WHILE an authenticated Administrator views the Admin_Panel dashboard, THE Admin_Panel SHALL display order count, revenue, and order-status breakdown statistics.
2. THE Admin_Panel SHALL render the administrative interface using a dark theme.

### Requirement 16: Product Management

**User Story:** As an administrator, I want full product management, so that I can maintain the catalog.

#### Acceptance Criteria

1. WHEN an authenticated Administrator creates or updates a product, THE Product_Service SHALL persist the product fields including name, price, compare-at price, description, features, specifications, FAQ entries, and stock quantity.
2. WHEN an Administrator saves a product, THE Product_Service SHALL generate a unique Slug derived from the product name.
3. WHEN an Administrator uploads product images or video, THE Media_Service SHALL store the media and associate it with the product.
4. WHEN an Administrator toggles the active state or stock state of a product, THE Product_Service SHALL persist the updated state.
5. WHEN an authenticated Administrator deletes a product, THE Product_Service SHALL remove the product from the catalog.

### Requirement 17: Order Management

**User Story:** As an administrator, I want to view and manage orders, so that I can fulfil and support them.

#### Acceptance Criteria

1. WHEN an authenticated Administrator opens the order list, THE Admin_Panel SHALL display orders with support for filtering, search, and pagination.
2. WHEN an Administrator opens an order detail, THE Admin_Panel SHALL display customer information, payment information, shipment information, Shipment_Status, and the status-history timeline.
3. WHEN an authenticated Administrator cancels an order, THE Order_Service SHALL set the Order_Status to CANCELLED and append a status-history entry.
4. WHEN an authenticated Administrator triggers courier assignment and AWB generation for an order with Shipment_Status set to PENDING, THE Shipping_Service SHALL attempt Shiprocket courier assignment and AWB generation for that order.
5. WHEN an Administrator-triggered courier assignment and AWB generation succeeds, THE Order_Service SHALL store the AWB and courier details with the order record and SHALL set the Shipment_Status to CREATED.
6. IF an Administrator-triggered courier assignment and AWB generation returns an error or Shiprocket is temporarily unavailable, THEN THE Shipping_Service SHALL record the failure reason in the server-side log and THE Order_Service SHALL retain the Shipment_Status as PENDING.

### Requirement 18: Local Media Storage and Processing

**User Story:** As an operator, I want media stored and optimized locally, so that the platform serves fast images without third-party storage.

#### Acceptance Criteria

1. WHEN media is uploaded, THE Media_Service SHALL store the media files on the local server filesystem under the /server/media directory.
2. WHEN an image is uploaded, THE Media_Service SHALL process the image into WebP format using Sharp before serving it.
3. THE Media_Service SHALL store product, video, banner, and category media on the local server filesystem and SHALL NOT use third-party object storage.

### Requirement 19: Security and Secret Protection

**User Story:** As a business owner, I want strong security controls, so that customer data and secrets stay protected.

#### Acceptance Criteria

1. THE Backend SHALL exclude API secrets, integration tokens, credentials, internal identifiers, webhook secrets, and database connection strings from all responses sent to the frontend.
2. THE Backend SHALL perform all operations that require secrets or credentials only on the server side.
3. THE Backend SHALL apply HTTP security headers, restrict cross-origin requests to the configured allowed origins, and apply request rate limiting.
4. WHEN the Backend receives request input, THE Backend SHALL validate and sanitize the input to prevent cross-site scripting and MongoDB operator injection.
5. WHEN an unauthenticated request targets an admin route, THE Auth_Service SHALL reject the request.

### Requirement 20: Order Success and Legal Pages

**User Story:** As a customer, I want order confirmation and access to policies, so that I trust the purchase.

#### Acceptance Criteria

1. WHEN an order is created successfully, THE Order_Success_Page SHALL display the order identifier and an order summary.
2. THE System SHALL provide privacy policy, terms of service, shipping policy, and refund policy pages accessible to the customer.

### Requirement 21: JWT Session Security

**User Story:** As a business owner, I want secure administrator sessions, so that unauthorized users cannot access the admin panel.

This requirement extends the JWT issuance and validation defined in Requirement 14 with session-expiration and signature-validation controls. The credential-rejection behavior in Requirement 14 remains in effect.

#### Acceptance Criteria

1. WHEN the Auth_Service issues a JWT, THE Auth_Service SHALL set a token expiration period read from the configured session-expiration environment variable.
2. WHEN the Auth_Service receives a JWT whose expiration period has elapsed, THE Auth_Service SHALL reject the JWT as expired.
3. WHEN the Admin_Panel receives a response indicating an expired JWT, THE Admin_Panel SHALL redirect the Administrator to the login page.
4. WHEN a request targets a protected route, THE Backend SHALL validate the JWT signature and SHALL reject the request if the signature is invalid.

### Requirement 22: Password Security

**User Story:** As a business owner, I want administrator credentials stored securely, so that account-compromise risk is minimized.

This requirement extends the salted-hash storage stated in Requirement 14 by specifying the hashing algorithm and verification behavior.

#### Acceptance Criteria

1. WHEN the Auth_Service stores an administrator password, THE Auth_Service SHALL store the password as a bcrypt hash.
2. THE Auth_Service SHALL store administrator passwords only as bcrypt hashes and SHALL exclude plaintext passwords from persistent storage.
3. WHEN the Auth_Service verifies an administrator password, THE Auth_Service SHALL compare the submitted password against the stored hash using bcrypt hash verification.
4. THE Backend SHALL exclude administrator password hashes from all API responses.

### Requirement 23: Upload Security

**User Story:** As a business owner, I want uploaded files validated, so that malicious files cannot be stored on the server.

#### Acceptance Criteria

1. WHEN a file is uploaded, THE Media_Service SHALL validate the file type against the configured set of allowed media types before accepting the file.
2. IF an uploaded file is an executable file or an unsupported format, THEN THE Media_Service SHALL reject the upload.
3. IF an uploaded file exceeds the configured maximum file size, THEN THE Media_Service SHALL reject the upload.
4. WHEN the Media_Service accepts an uploaded file, THE Media_Service SHALL assign a unique filename so that existing stored files are not overwritten.
5. WHEN the Backend serves uploaded media, THE Backend SHALL return the media content as static data without executing the uploaded content.

### Requirement 24: Webhook Security

**User Story:** As a business owner, I want external webhooks verified, so that unauthorized systems cannot modify order statuses.

This requirement extends the webhook processing defined in Requirement 12 with authenticity verification controls.

#### Acceptance Criteria

1. WHEN the Webhook_Handler receives a webhook request, THE Webhook_Handler SHALL verify the authenticity of the request before processing the webhook event.
2. IF webhook authenticity verification fails, THEN THE Webhook_Handler SHALL reject the request.
3. WHEN webhook authenticity verification fails, THE System SHALL record the failed verification attempt in the server-side log.
4. THE Webhook_Handler SHALL process only webhook events whose authenticity verification succeeds.

### Requirement 25: Admin Login Protection

**User Story:** As a business owner, I want protection against brute-force attacks, so that administrator accounts remain secure.

#### Acceptance Criteria

1. THE Auth_Service SHALL apply rate limiting to the administrator login endpoint.
2. IF the number of failed login attempts from a source exceeds the configured threshold within the configured time window, THEN THE System SHALL temporarily block further login attempts from that source until the window elapses.
3. WHEN an administrator login attempt fails, THE System SHALL return a generic authentication-failure message that does not identify which credential field was incorrect.
4. WHEN an administrator login attempt is made for an email address that is not registered, THE System SHALL return the same generic authentication-failure message used for registered email addresses.

### Requirement 26: Audit Logging

**User Story:** As a business owner, I want important administrator actions recorded, so that operational activity can be tracked.

#### Acceptance Criteria

1. WHEN an Administrator logs in successfully, THE System SHALL record an Audit_Log entry for the login.
2. WHEN an Administrator creates, updates, or deletes a product, THE System SHALL record an Audit_Log entry for the action.
3. WHEN an Administrator cancels an order, THE System SHALL record an Audit_Log entry for the cancellation.
4. WHEN an Administrator triggers a manual courier assignment or AWB generation as defined in Requirement 11 and Requirement 17, THE System SHALL record an Audit_Log entry for the shipment retry action.
5. THE System SHALL store Audit_Log entries on the Backend and SHALL exclude Audit_Log entries from responses sent to customers.

### Requirement 27: Error Handling and Information Disclosure

**User Story:** As a business owner, I want secure error handling, so that attackers cannot learn internal system details.

#### Acceptance Criteria

1. IF an error occurs while processing a customer request, THEN THE Backend SHALL return a generic error message to the customer.
2. THE Backend SHALL exclude stack traces from all responses sent to the frontend.
3. THE Backend SHALL exclude database schema information from all responses sent to the frontend.
4. THE Backend SHALL exclude filesystem paths, API secrets, access tokens, and internal server details from all responses sent to the frontend.
5. WHEN an error occurs, THE Backend SHALL record the detailed error information only in the server-side log.

### Requirement 28: API Abuse Protection

**User Story:** As a business owner, I want protection against automated abuse, so that system resources remain available.

This requirement extends the request rate limiting stated in Requirement 19 with endpoint-specific limits.

#### Acceptance Criteria

1. THE Backend SHALL apply rate limiting to the public API endpoints.
2. THE Backend SHALL apply a rate limit to OTP generation requests.
3. THE Backend SHALL apply a rate limit to payment creation requests.
4. THE Backend SHALL apply a rate limit to order creation requests.
5. IF a client exceeds a configured rate limit, THEN THE Backend SHALL reject the excess requests with a rate-limit response.

### Requirement 29: Environment and Secret Management

**User Story:** As a business owner, I want secure configuration management, so that credentials remain protected.

This requirement extends the secret-protection controls in Requirement 19 with configuration-source and startup-validation behavior. Integration credentials may also be sourced from encrypted System_Settings as defined in Requirement 30; this requirement governs the bootstrap secrets that remain environment-variable-only.

#### Acceptance Criteria

1. THE System SHALL read the credential-protection encryption key, the JWT secret, and the database connection string only from environment variables.
2. THE System SHALL read integration credentials for Razorpay, Shiprocket, WhatsApp, and Meta Pixel from either environment variables or encrypted System_Settings.
3. THE System SHALL exclude secrets from source control.
4. WHEN the application starts, THE System SHALL validate that all required environment variables, including the credential-protection encryption key, the JWT secret, and the database connection string, are present.
5. IF a required environment variable is missing at startup, THEN THE System SHALL fail to start.

### Requirement 30: System Settings Management

**User Story:** As an Administrator, I want to manage platform configuration from the Admin Panel, so that operational settings can be updated without modifying server files.

This requirement defines admin-managed configuration and complements Requirement 29; integration credentials configured here are the encrypted System_Settings source referenced in Requirement 29.

#### Acceptance Criteria

1. WHERE an authenticated Administrator accesses the Admin_Panel, THE Admin_Panel SHALL provide a System_Settings module, and THE Auth_Service SHALL restrict access to the System_Settings module to authenticated Administrators.
2. THE System_Settings module SHALL provide configuration sections for Razorpay Settings, Shiprocket Settings, WhatsApp Settings, and Meta Pixel Settings.
3. THE Razorpay Settings section SHALL allow configuring the Razorpay Key ID and the Razorpay Key Secret.
4. THE Shiprocket Settings section SHALL allow configuring the Shiprocket Email and the Shiprocket Password.
5. THE WhatsApp Settings section SHALL allow configuring the Phone Number ID, the Access Token, and the Verify Token.
6. THE Meta Pixel Settings section SHALL allow configuring the Meta Pixel ID.
7. WHEN an Administrator saves API credentials in the System_Settings module, THE Backend SHALL encrypt the credentials before storing them.
8. THE System SHALL exclude plaintext credentials from all responses sent to the frontend.
9. WHEN the Admin_Panel displays stored credentials, THE Admin_Panel SHALL display the credentials only in masked form.
10. WHILE a server-side integration requires a stored credential, THE Backend SHALL decrypt the credential only for that server-side integration use.
11. THE System SHALL read the encryption key used for credential protection only from environment variables.
12. WHEN settings are created, updated, or deleted in the System_Settings module, THE System SHALL record an Audit_Log entry for the action.
13. IF an unauthorized user attempts to access the System_Settings module, THEN THE Auth_Service SHALL deny access.
14. WHEN an Administrator submits credentials in the System_Settings module, THE Backend SHALL validate the credential format before saving, and IF the credential format is invalid, THEN THE System_Settings module SHALL display a configuration error and SHALL NOT save the credentials.
15. THE System_Settings module SHALL provide a "Test Connection" / "Verify Credentials" action for supported integrations before credentials are saved.
16. WHEN an Administrator requests credential verification, THE Backend SHALL attempt a live connection using the supplied credentials.
17. IF credential verification succeeds, THEN THE System SHALL indicate successful verification and SHALL permit the credentials to be saved.
18. IF credential verification fails, THEN THE System SHALL display a verification error and SHALL NOT save the credentials.
19. THE Backend SHALL perform credential verification only on the server side.
20. THE System SHALL exclude secrets, tokens, passwords, and credential values from verification responses sent to the frontend.

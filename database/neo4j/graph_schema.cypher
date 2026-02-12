// ============================================================================
// Mary Poppins -- Neo4j Graph Schema
// Digital Intelligence Platform: CSAM Prevention, OSINT, Crypto Tracing,
// Dark Web Investigation
//
// Database  : marypoppins (see MP_NEO4J_DATABASE in settings)
// Neo4j     : >= 5.x (Community or Enterprise)
// GDS Plugin: >= 2.x required for analytics procedures
//
// This file is idempotent. All CREATE statements use IF NOT EXISTS so the
// script can be re-run safely on an existing database.
//
// Sections:
//   1. Constraints (uniqueness + existence)
//   2. Indexes (composite, full-text, range)
//   3. Node definitions with property documentation
//   4. Relationship definitions with property documentation
//   5. Example investigation queries
//   6. Graph analytics procedures (GDS)
//   7. Maintenance utilities
// ============================================================================


// ============================================================================
// 1. CONSTRAINTS
// ============================================================================
// Uniqueness constraints also create backing indexes automatically.

// -- Person ------------------------------------------------------------------
CREATE CONSTRAINT person_id_unique IF NOT EXISTS
  FOR (p:Person) REQUIRE p.id IS UNIQUE;

CREATE CONSTRAINT person_id_not_null IF NOT EXISTS
  FOR (p:Person) REQUIRE p.id IS NOT NULL;

// -- Email -------------------------------------------------------------------
CREATE CONSTRAINT email_id_unique IF NOT EXISTS
  FOR (e:Email) REQUIRE e.id IS UNIQUE;

CREATE CONSTRAINT email_address_unique IF NOT EXISTS
  FOR (e:Email) REQUIRE e.address IS UNIQUE;

CREATE CONSTRAINT email_id_not_null IF NOT EXISTS
  FOR (e:Email) REQUIRE e.id IS NOT NULL;

CREATE CONSTRAINT email_address_not_null IF NOT EXISTS
  FOR (e:Email) REQUIRE e.address IS NOT NULL;

// -- Phone -------------------------------------------------------------------
CREATE CONSTRAINT phone_id_unique IF NOT EXISTS
  FOR (ph:Phone) REQUIRE ph.id IS UNIQUE;

CREATE CONSTRAINT phone_number_unique IF NOT EXISTS
  FOR (ph:Phone) REQUIRE ph.number IS UNIQUE;

CREATE CONSTRAINT phone_id_not_null IF NOT EXISTS
  FOR (ph:Phone) REQUIRE ph.id IS NOT NULL;

// -- Username ----------------------------------------------------------------
CREATE CONSTRAINT username_id_unique IF NOT EXISTS
  FOR (u:Username) REQUIRE u.id IS UNIQUE;

CREATE CONSTRAINT username_composite_unique IF NOT EXISTS
  FOR (u:Username) REQUIRE (u.platform, u.handle) IS UNIQUE;

CREATE CONSTRAINT username_id_not_null IF NOT EXISTS
  FOR (u:Username) REQUIRE u.id IS NOT NULL;

// -- IPAddress ---------------------------------------------------------------
CREATE CONSTRAINT ip_id_unique IF NOT EXISTS
  FOR (ip:IPAddress) REQUIRE ip.id IS UNIQUE;

CREATE CONSTRAINT ip_address_unique IF NOT EXISTS
  FOR (ip:IPAddress) REQUIRE ip.address IS UNIQUE;

CREATE CONSTRAINT ip_id_not_null IF NOT EXISTS
  FOR (ip:IPAddress) REQUIRE ip.id IS NOT NULL;

// -- Domain ------------------------------------------------------------------
CREATE CONSTRAINT domain_id_unique IF NOT EXISTS
  FOR (d:Domain) REQUIRE d.id IS UNIQUE;

CREATE CONSTRAINT domain_name_unique IF NOT EXISTS
  FOR (d:Domain) REQUIRE d.name IS UNIQUE;

CREATE CONSTRAINT domain_id_not_null IF NOT EXISTS
  FOR (d:Domain) REQUIRE d.id IS NOT NULL;

// -- CryptoWallet ------------------------------------------------------------
CREATE CONSTRAINT wallet_id_unique IF NOT EXISTS
  FOR (w:CryptoWallet) REQUIRE w.id IS UNIQUE;

CREATE CONSTRAINT wallet_address_unique IF NOT EXISTS
  FOR (w:CryptoWallet) REQUIRE w.address IS UNIQUE;

CREATE CONSTRAINT wallet_id_not_null IF NOT EXISTS
  FOR (w:CryptoWallet) REQUIRE w.id IS NOT NULL;

CREATE CONSTRAINT wallet_address_not_null IF NOT EXISTS
  FOR (w:CryptoWallet) REQUIRE w.address IS NOT NULL;

// -- ContentHash -------------------------------------------------------------
CREATE CONSTRAINT hash_id_unique IF NOT EXISTS
  FOR (h:ContentHash) REQUIRE h.id IS UNIQUE;

CREATE CONSTRAINT hash_sha256_unique IF NOT EXISTS
  FOR (h:ContentHash) REQUIRE h.sha256 IS UNIQUE;

CREATE CONSTRAINT hash_id_not_null IF NOT EXISTS
  FOR (h:ContentHash) REQUIRE h.id IS NOT NULL;

CREATE CONSTRAINT hash_sha256_not_null IF NOT EXISTS
  FOR (h:ContentHash) REQUIRE h.sha256 IS NOT NULL;

// -- ForumPost ---------------------------------------------------------------
CREATE CONSTRAINT post_id_unique IF NOT EXISTS
  FOR (fp:ForumPost) REQUIRE fp.id IS UNIQUE;

CREATE CONSTRAINT post_id_not_null IF NOT EXISTS
  FOR (fp:ForumPost) REQUIRE fp.id IS NOT NULL;

// -- OnionService ------------------------------------------------------------
CREATE CONSTRAINT onion_id_unique IF NOT EXISTS
  FOR (os:OnionService) REQUIRE os.id IS UNIQUE;

CREATE CONSTRAINT onion_url_unique IF NOT EXISTS
  FOR (os:OnionService) REQUIRE os.onion_url IS UNIQUE;

CREATE CONSTRAINT onion_id_not_null IF NOT EXISTS
  FOR (os:OnionService) REQUIRE os.id IS NOT NULL;

// -- ChatMessage -------------------------------------------------------------
CREATE CONSTRAINT chat_id_unique IF NOT EXISTS
  FOR (cm:ChatMessage) REQUIRE cm.id IS UNIQUE;

CREATE CONSTRAINT chat_id_not_null IF NOT EXISTS
  FOR (cm:ChatMessage) REQUIRE cm.id IS NOT NULL;

// -- SocialMediaProfile ------------------------------------------------------
CREATE CONSTRAINT social_id_unique IF NOT EXISTS
  FOR (sm:SocialMediaProfile) REQUIRE sm.id IS UNIQUE;

CREATE CONSTRAINT social_composite_unique IF NOT EXISTS
  FOR (sm:SocialMediaProfile) REQUIRE (sm.platform, sm.profile_id) IS UNIQUE;

CREATE CONSTRAINT social_id_not_null IF NOT EXISTS
  FOR (sm:SocialMediaProfile) REQUIRE sm.id IS NOT NULL;

// -- GeoLocation -------------------------------------------------------------
CREATE CONSTRAINT geo_id_unique IF NOT EXISTS
  FOR (g:GeoLocation) REQUIRE g.id IS UNIQUE;

CREATE CONSTRAINT geo_id_not_null IF NOT EXISTS
  FOR (g:GeoLocation) REQUIRE g.id IS NOT NULL;

// -- Organization ------------------------------------------------------------
CREATE CONSTRAINT org_id_unique IF NOT EXISTS
  FOR (o:Organization) REQUIRE o.id IS UNIQUE;

CREATE CONSTRAINT org_id_not_null IF NOT EXISTS
  FOR (o:Organization) REQUIRE o.id IS NOT NULL;


// ============================================================================
// 2. INDEXES
// ============================================================================

// -- Range indexes for timestamp-heavy queries --------------------------------
CREATE INDEX person_risk_score IF NOT EXISTS
  FOR (p:Person) ON (p.risk_score);

CREATE INDEX person_first_seen IF NOT EXISTS
  FOR (p:Person) ON (p.first_seen);

CREATE INDEX person_last_seen IF NOT EXISTS
  FOR (p:Person) ON (p.last_seen);

CREATE INDEX email_first_seen IF NOT EXISTS
  FOR (e:Email) ON (e.first_seen);

CREATE INDEX ip_first_seen IF NOT EXISTS
  FOR (ip:IPAddress) ON (ip.first_seen);

CREATE INDEX ip_last_seen IF NOT EXISTS
  FOR (ip:IPAddress) ON (ip.last_seen);

CREATE INDEX wallet_blockchain IF NOT EXISTS
  FOR (w:CryptoWallet) ON (w.blockchain);

CREATE INDEX wallet_risk_score IF NOT EXISTS
  FOR (w:CryptoWallet) ON (w.risk_score);

CREATE INDEX wallet_cluster_id IF NOT EXISTS
  FOR (w:CryptoWallet) ON (w.cluster_id);

CREATE INDEX wallet_first_tx IF NOT EXISTS
  FOR (w:CryptoWallet) ON (w.first_tx_at);

CREATE INDEX hash_classification IF NOT EXISTS
  FOR (h:ContentHash) ON (h.classification);

CREATE INDEX hash_csam_score IF NOT EXISTS
  FOR (h:ContentHash) ON (h.csam_score);

CREATE INDEX hash_phash IF NOT EXISTS
  FOR (h:ContentHash) ON (h.phash);

CREATE INDEX hash_pdq IF NOT EXISTS
  FOR (h:ContentHash) ON (h.pdq_hash);

CREATE INDEX hash_ingested_at IF NOT EXISTS
  FOR (h:ContentHash) ON (h.ingested_at);

CREATE INDEX post_posted_at IF NOT EXISTS
  FOR (fp:ForumPost) ON (fp.posted_at);

CREATE INDEX post_forum_name IF NOT EXISTS
  FOR (fp:ForumPost) ON (fp.forum_name);

CREATE INDEX onion_first_seen IF NOT EXISTS
  FOR (os:OnionService) ON (os.first_seen);

CREATE INDEX onion_last_seen IF NOT EXISTS
  FOR (os:OnionService) ON (os.last_seen);

CREATE INDEX onion_risk_score IF NOT EXISTS
  FOR (os:OnionService) ON (os.risk_score);

CREATE INDEX chat_sent_at IF NOT EXISTS
  FOR (cm:ChatMessage) ON (cm.sent_at);

CREATE INDEX chat_platform IF NOT EXISTS
  FOR (cm:ChatMessage) ON (cm.platform);

CREATE INDEX chat_grooming_score IF NOT EXISTS
  FOR (cm:ChatMessage) ON (cm.grooming_risk_score);

CREATE INDEX social_platform IF NOT EXISTS
  FOR (sm:SocialMediaProfile) ON (sm.platform);

CREATE INDEX geo_country IF NOT EXISTS
  FOR (g:GeoLocation) ON (g.country_code);

CREATE INDEX org_type IF NOT EXISTS
  FOR (o:Organization) ON (o.org_type);

CREATE INDEX domain_registrar IF NOT EXISTS
  FOR (d:Domain) ON (d.registrar);

CREATE INDEX domain_first_seen IF NOT EXISTS
  FOR (d:Domain) ON (d.first_seen);

// -- Composite indexes for common filter combinations -------------------------
CREATE INDEX person_type_risk IF NOT EXISTS
  FOR (p:Person) ON (p.entity_type, p.risk_score);

CREATE INDEX hash_class_csam IF NOT EXISTS
  FOR (h:ContentHash) ON (h.classification, h.csam_score);

CREATE INDEX wallet_chain_risk IF NOT EXISTS
  FOR (w:CryptoWallet) ON (w.blockchain, p.risk_score);

// -- Full-text indexes for investigative search -------------------------------
CREATE FULLTEXT INDEX person_fulltext IF NOT EXISTS
  FOR (p:Person)
  ON EACH [p.display_name, p.real_name, p.notes, p.aliases_text];

CREATE FULLTEXT INDEX post_fulltext IF NOT EXISTS
  FOR (fp:ForumPost)
  ON EACH [fp.title, fp.body, fp.forum_name];

CREATE FULLTEXT INDEX chat_fulltext IF NOT EXISTS
  FOR (cm:ChatMessage)
  ON EACH [cm.body, cm.platform, cm.channel];

CREATE FULLTEXT INDEX onion_fulltext IF NOT EXISTS
  FOR (os:OnionService)
  ON EACH [os.page_title, os.description, os.onion_url];

CREATE FULLTEXT INDEX org_fulltext IF NOT EXISTS
  FOR (o:Organization)
  ON EACH [o.name, o.description, o.known_aliases];

CREATE FULLTEXT INDEX domain_fulltext IF NOT EXISTS
  FOR (d:Domain)
  ON EACH [d.name, d.registrant_name, d.registrant_email];


// ============================================================================
// 3. NODE DEFINITIONS (with property documentation)
// ============================================================================
// Nodes are created at ingest time by the application layer. The block below
// documents every expected property, its Cypher type, and its purpose.
// Neo4j is schema-optional, but the application enforces these via the
// Python driver layer and the constraints above.

// ----------------------------------------------------------------------------
// Person
// ----------------------------------------------------------------------------
// Represents a person of interest (suspect, victim, witness, informant).
//
// Properties:
//   id               : STRING    -- UUID v4, primary key (from Postgres entity.id)
//   entity_type      : STRING    -- Enum: "suspect", "victim", "witness",
//                                   "informant", "associate", "unknown"
//   display_name     : STRING    -- Investigator-assigned label
//   real_name        : STRING?   -- Verified legal name (nullable)
//   aliases_text     : STRING?   -- Semicolon-delimited known aliases for search
//   date_of_birth    : DATE?     -- Known or estimated DOB
//   nationality      : STRING?   -- ISO 3166-1 alpha-2 country code
//   gender           : STRING?   -- Reported gender
//   risk_score       : FLOAT     -- 0.0 to 1.0, composite risk rating
//   confidence       : FLOAT     -- 0.0 to 1.0, identity confidence
//   notes            : STRING?   -- Free-form investigator notes
//   source           : STRING    -- Enum matching DataSourceType
//   source_reference : STRING?   -- URL or ID in originating system
//   is_verified      : BOOLEAN   -- Identity verified by analyst
//   first_seen       : DATETIME  -- Earliest appearance in data
//   last_seen        : DATETIME  -- Most recent appearance
//   created_at       : DATETIME  -- Record creation timestamp
//   created_by       : STRING    -- UUID of analyst who created the node
//   pg_entity_id     : STRING?   -- FK back to Postgres entities.id
//   tags             : LIST<STRING> -- Investigation tags
//   metadata         : MAP?      -- Arbitrary key-value metadata

// ----------------------------------------------------------------------------
// Email
// ----------------------------------------------------------------------------
// An email address observed in investigation data.
//
// Properties:
//   id               : STRING    -- UUID v4, primary key
//   address          : STRING    -- Normalized email (lowercase, trimmed)
//   provider         : STRING?   -- e.g. "gmail.com", "protonmail.com"
//   is_disposable    : BOOLEAN   -- True if known disposable/temp service
//   is_verified      : BOOLEAN   -- Ownership verified
//   breach_count     : INTEGER   -- Number of known data breaches containing it
//   breach_sources   : LIST<STRING> -- Names of breaches
//   risk_score       : FLOAT     -- 0.0 to 1.0
//   first_seen       : DATETIME  -- Earliest observation
//   last_seen        : DATETIME  -- Latest observation
//   source           : STRING    -- DataSourceType enum
//   source_reference : STRING?   -- Origin reference
//   created_at       : DATETIME  -- Record creation
//   created_by       : STRING    -- Analyst UUID
//   pg_entity_id     : STRING?   -- FK to Postgres
//   tags             : LIST<STRING>
//   metadata         : MAP?

// ----------------------------------------------------------------------------
// Phone
// ----------------------------------------------------------------------------
// A telephone number (mobile, landline, VoIP).
//
// Properties:
//   id               : STRING    -- UUID v4, primary key
//   number           : STRING    -- E.164 format (e.g. "+14155551234")
//   country_code     : STRING?   -- ISO 3166-1 alpha-2
//   carrier          : STRING?   -- Telecom carrier name
//   phone_type       : STRING?   -- "mobile", "landline", "voip", "satellite"
//   is_burner        : BOOLEAN   -- Suspected disposable/prepaid
//   risk_score       : FLOAT     -- 0.0 to 1.0
//   first_seen       : DATETIME
//   last_seen        : DATETIME
//   source           : STRING
//   source_reference : STRING?
//   created_at       : DATETIME
//   created_by       : STRING
//   pg_entity_id     : STRING?
//   tags             : LIST<STRING>
//   metadata         : MAP?

// ----------------------------------------------------------------------------
// Username
// ----------------------------------------------------------------------------
// A handle/alias on a platform (forum, marketplace, chat, social media).
//
// Properties:
//   id               : STRING    -- UUID v4, primary key
//   handle           : STRING    -- The username string
//   platform         : STRING    -- Platform name (e.g. "telegram", "wickr",
//                                   "breachforums", "dread")
//   profile_url      : STRING?   -- Direct link to the profile
//   display_name     : STRING?   -- Public display name on platform
//   bio              : STRING?   -- Profile bio/description
//   avatar_hash      : STRING?   -- SHA-256 of avatar image
//   account_created  : DATETIME? -- When the account was created on platform
//   follower_count   : INTEGER?  -- Number of followers/contacts
//   post_count       : INTEGER?  -- Number of posts/messages
//   reputation_score : FLOAT?    -- Platform-specific reputation
//   is_verified      : BOOLEAN   -- Platform-verified account
//   is_active        : BOOLEAN   -- Account currently active
//   risk_score       : FLOAT     -- 0.0 to 1.0
//   first_seen       : DATETIME
//   last_seen        : DATETIME
//   source           : STRING
//   source_reference : STRING?
//   created_at       : DATETIME
//   created_by       : STRING
//   pg_entity_id     : STRING?
//   tags             : LIST<STRING>
//   metadata         : MAP?

// ----------------------------------------------------------------------------
// IPAddress
// ----------------------------------------------------------------------------
// An IPv4 or IPv6 address observed in network traffic, logs, or metadata.
//
// Properties:
//   id               : STRING    -- UUID v4, primary key
//   address          : STRING    -- IPv4 or IPv6 in canonical form
//   version          : INTEGER   -- 4 or 6
//   asn              : INTEGER?  -- Autonomous System Number
//   asn_org          : STRING?   -- ASN organization name
//   isp              : STRING?   -- Internet service provider
//   is_tor_exit      : BOOLEAN   -- Known Tor exit node
//   is_vpn           : BOOLEAN   -- Known VPN endpoint
//   is_proxy         : BOOLEAN   -- Known proxy server
//   is_datacenter    : BOOLEAN   -- Datacenter/cloud IP
//   threat_score     : FLOAT     -- 0.0 to 1.0, threat intelligence score
//   abuse_reports    : INTEGER   -- Count of abuse reports
//   reverse_dns      : STRING?   -- PTR record
//   first_seen       : DATETIME
//   last_seen        : DATETIME
//   source           : STRING
//   source_reference : STRING?
//   created_at       : DATETIME
//   created_by       : STRING
//   pg_entity_id     : STRING?
//   tags             : LIST<STRING>
//   metadata         : MAP?

// ----------------------------------------------------------------------------
// Domain
// ----------------------------------------------------------------------------
// A DNS domain name (clearnet or dark web).
//
// Properties:
//   id               : STRING    -- UUID v4, primary key
//   name             : STRING    -- Fully qualified domain name
//   tld              : STRING    -- Top-level domain (e.g. "com", "onion")
//   registrar        : STRING?   -- Domain registrar name
//   registrant_name  : STRING?   -- WHOIS registrant name
//   registrant_email : STRING?   -- WHOIS registrant email
//   registered_at    : DATETIME? -- Domain registration date
//   expires_at       : DATETIME? -- Domain expiration date
//   nameservers      : LIST<STRING> -- Authoritative nameservers
//   mx_records       : LIST<STRING> -- Mail exchange records
//   is_parked        : BOOLEAN   -- Domain parked / sinkholed
//   is_malicious     : BOOLEAN   -- Flagged by threat intelligence
//   ssl_issuer       : STRING?   -- TLS certificate issuer
//   ssl_fingerprint  : STRING?   -- TLS certificate SHA-256 fingerprint
//   tech_stack       : LIST<STRING> -- Detected technologies
//   risk_score       : FLOAT     -- 0.0 to 1.0
//   first_seen       : DATETIME
//   last_seen        : DATETIME
//   source           : STRING
//   source_reference : STRING?
//   created_at       : DATETIME
//   created_by       : STRING
//   pg_entity_id     : STRING?
//   tags             : LIST<STRING>
//   metadata         : MAP?

// ----------------------------------------------------------------------------
// CryptoWallet
// ----------------------------------------------------------------------------
// A cryptocurrency wallet address.
//
// Properties:
//   id               : STRING    -- UUID v4, primary key
//   address          : STRING    -- Wallet address (base58, bech32, hex, etc.)
//   blockchain       : STRING    -- "bitcoin", "ethereum", "monero", "litecoin",
//                                   "bitcoin_cash", "tron", "zcash"
//   wallet_type      : STRING?   -- "personal", "exchange", "mixer", "marketplace",
//                                   "gambling", "ransomware", "unknown"
//   cluster_id       : STRING?   -- Wallet clustering group identifier
//   label            : STRING?   -- Human-readable label (e.g. "Binance hot wallet")
//   known_service    : STRING?   -- Exchange/service name if identified
//   owner_name       : STRING?   -- Attributed owner (if known)
//   is_mixer         : BOOLEAN   -- Part of a mixing/tumbling service
//   is_exchange      : BOOLEAN   -- Belongs to a known exchange
//   is_sanctioned    : BOOLEAN   -- On OFAC or similar sanctions list
//   total_received   : FLOAT     -- Total amount received (native units)
//   total_sent       : FLOAT     -- Total amount sent (native units)
//   balance          : FLOAT     -- Current balance (native units)
//   total_received_usd : FLOAT?  -- Estimated USD value of total received
//   total_sent_usd   : FLOAT?    -- Estimated USD value of total sent
//   tx_count         : INTEGER   -- Total transaction count
//   first_tx_at      : DATETIME? -- Timestamp of first transaction
//   last_tx_at       : DATETIME? -- Timestamp of last transaction
//   risk_score       : FLOAT     -- 0.0 to 1.0
//   risk_factors     : LIST<STRING> -- Reasons for risk score
//   source           : STRING
//   source_reference : STRING?
//   created_at       : DATETIME
//   created_by       : STRING
//   pg_entity_id     : STRING?   -- FK to Postgres crypto_wallets.id
//   tags             : LIST<STRING>
//   metadata         : MAP?

// ----------------------------------------------------------------------------
// ContentHash
// ----------------------------------------------------------------------------
// A media file identified by its cryptographic/perceptual hashes.
// WARNING: No actual content is stored in Neo4j. Only hashes and metadata.
//
// Properties:
//   id               : STRING    -- UUID v4, primary key
//   sha256           : STRING    -- SHA-256 hex digest (64 chars)
//   md5              : STRING?   -- MD5 hex digest (legacy matching)
//   phash            : STRING?   -- Perceptual hash (64-bit hex)
//   pdq_hash         : STRING?   -- PDQ hash (Meta's perceptual hash)
//   photodna_hash    : STRING?   -- PhotoDNA hash (base64 encoded)
//   file_size_bytes  : INTEGER   -- File size
//   mime_type        : STRING    -- MIME type (e.g. "image/jpeg")
//   classification   : STRING    -- Enum: "safe", "suggestive", "nsfw",
//                                   "nsfl", "csam_suspect", "csam_confirmed"
//   nsfw_score       : FLOAT     -- 0.0 to 1.0
//   csam_score       : FLOAT     -- 0.0 to 1.0
//   age_estimation   : FLOAT?    -- Estimated age of subject
//   known_db_match   : BOOLEAN   -- Matched NCMEC/ICSE/Project VIC database
//   matched_database : STRING?   -- Name of matched database
//   width            : INTEGER?  -- Image/video width in pixels
//   height           : INTEGER?  -- Image/video height in pixels
//   duration_seconds : FLOAT?    -- Video/audio duration
//   source           : STRING    -- DataSourceType enum
//   source_url       : STRING?   -- Where the content was found
//   ingested_at      : DATETIME  -- When ingested into the system
//   analyzed_at      : DATETIME? -- When AI analysis completed
//   reported_at      : DATETIME? -- When reported to NCMEC/IWF
//   report_id        : STRING?   -- NCMEC CyberTipline report ID
//   created_by       : STRING    -- Analyst UUID
//   pg_entity_id     : STRING?   -- FK to Postgres content_hashes.id
//   tags             : LIST<STRING>
//   metadata         : MAP?

// ----------------------------------------------------------------------------
// ForumPost
// ----------------------------------------------------------------------------
// A post or thread on a forum (dark web or clearnet).
//
// Properties:
//   id               : STRING    -- UUID v4, primary key
//   forum_name       : STRING    -- Name of the forum
//   forum_url        : STRING?   -- Base URL of the forum
//   thread_id        : STRING?   -- Forum-specific thread identifier
//   post_id_external : STRING?   -- Forum-specific post identifier
//   title            : STRING?   -- Thread/post title
//   body             : STRING    -- Post body text
//   body_hash        : STRING    -- SHA-256 of the body text
//   author_username  : STRING?   -- Author's username on the forum
//   is_thread_start  : BOOLEAN   -- True if this is the opening post
//   reply_to_id      : STRING?   -- ID of parent post (if reply)
//   posted_at        : DATETIME  -- When the post was made
//   language         : STRING    -- ISO 639-1 language code
//   sentiment_score  : FLOAT?    -- -1.0 to 1.0
//   risk_score       : FLOAT     -- 0.0 to 1.0
//   grooming_score   : FLOAT?    -- 0.0 to 1.0, grooming language detection
//   contains_links   : BOOLEAN   -- Contains URLs
//   extracted_links  : LIST<STRING> -- URLs found in post body
//   extracted_emails : LIST<STRING> -- Emails found in post body
//   extracted_wallets: LIST<STRING> -- Crypto addresses found in post body
//   source           : STRING
//   source_reference : STRING?
//   crawled_at       : DATETIME  -- When our crawler captured this
//   created_at       : DATETIME
//   created_by       : STRING
//   pg_entity_id     : STRING?
//   tags             : LIST<STRING>
//   metadata         : MAP?

// ----------------------------------------------------------------------------
// OnionService
// ----------------------------------------------------------------------------
// A Tor hidden service (.onion address).
//
// Properties:
//   id               : STRING    -- UUID v4, primary key
//   onion_url        : STRING    -- Full .onion URL (v2 or v3)
//   onion_version    : INTEGER   -- 2 or 3 (address version)
//   page_title       : STRING?   -- HTML title of landing page
//   description      : STRING?   -- Service description
//   service_type     : STRING?   -- "forum", "marketplace", "hosting",
//                                   "email", "chat", "wiki", "unknown"
//   status           : STRING    -- "active", "inactive", "seized", "defunct"
//   server_software  : STRING?   -- Detected server (nginx, Apache, etc.)
//   server_headers   : MAP?      -- Key HTTP response headers
//   ssl_fingerprint  : STRING?   -- TLS cert fingerprint (if HTTPS)
//   language         : STRING?   -- Primary language
//   mirror_of        : STRING?   -- Clearnet mirror domain (if known)
//   linked_clearnet  : LIST<STRING> -- Associated clearnet domains
//   risk_score       : FLOAT     -- 0.0 to 1.0
//   classification   : STRING?   -- Content classification
//   content_hash     : STRING?   -- SHA-256 of last crawled page
//   first_seen       : DATETIME
//   last_seen        : DATETIME
//   last_crawled     : DATETIME? -- Most recent successful crawl
//   crawl_count      : INTEGER   -- Number of successful crawls
//   source           : STRING
//   source_reference : STRING?
//   created_at       : DATETIME
//   created_by       : STRING
//   pg_entity_id     : STRING?
//   tags             : LIST<STRING>
//   metadata         : MAP?

// ----------------------------------------------------------------------------
// ChatMessage
// ----------------------------------------------------------------------------
// A message from a chat platform (Telegram, Wickr, Signal, Discord, etc.).
// Content is stored as a hash reference; full text only when legally authorized.
//
// Properties:
//   id               : STRING    -- UUID v4, primary key
//   platform         : STRING    -- "telegram", "wickr", "signal", "discord",
//                                   "whatsapp", "irc", "matrix", "other"
//   channel          : STRING?   -- Channel/group/room name or ID
//   channel_type     : STRING?   -- "group", "direct", "channel", "supergroup"
//   message_id_ext   : STRING?   -- Platform-specific message ID
//   sender_username  : STRING?   -- Sender's username on platform
//   sender_id_ext    : STRING?   -- Platform-specific sender ID
//   body             : STRING?   -- Message text (if retention authorized)
//   body_hash        : STRING    -- SHA-256 of message body
//   has_attachment    : BOOLEAN   -- Message contains file/media
//   attachment_hashes : LIST<STRING> -- SHA-256 of attached files
//   attachment_types : LIST<STRING> -- MIME types of attachments
//   sent_at          : DATETIME  -- When the message was sent
//   language         : STRING?   -- Detected language
//   sentiment_score  : FLOAT?    -- -1.0 to 1.0
//   grooming_risk_score : FLOAT? -- 0.0 to 1.0
//   grooming_stage   : STRING?   -- Detected grooming stage
//   risk_score       : FLOAT     -- 0.0 to 1.0
//   is_encrypted     : BOOLEAN   -- End-to-end encrypted platform
//   source           : STRING
//   source_reference : STRING?
//   created_at       : DATETIME
//   created_by       : STRING
//   pg_entity_id     : STRING?
//   tags             : LIST<STRING>
//   metadata         : MAP?

// ----------------------------------------------------------------------------
// SocialMediaProfile
// ----------------------------------------------------------------------------
// A profile on a social media platform.
//
// Properties:
//   id               : STRING    -- UUID v4, primary key
//   platform         : STRING    -- "facebook", "instagram", "twitter",
//                                   "tiktok", "snapchat", "reddit",
//                                   "youtube", "vk", "ok_ru", "other"
//   profile_id       : STRING    -- Platform-specific user/profile ID
//   username         : STRING?   -- Handle (@username)
//   display_name     : STRING?   -- Public display name
//   bio              : STRING?   -- Profile biography
//   profile_url      : STRING    -- Direct URL to profile
//   avatar_url       : STRING?   -- Profile picture URL
//   avatar_hash      : STRING?   -- SHA-256 of avatar image
//   follower_count   : INTEGER?  -- Followers
//   following_count  : INTEGER?  -- Following
//   post_count       : INTEGER?  -- Total posts
//   is_verified      : BOOLEAN   -- Platform-verified
//   is_private       : BOOLEAN   -- Private/locked account
//   is_active        : BOOLEAN   -- Account active
//   account_created  : DATETIME? -- Account creation date
//   last_active      : DATETIME? -- Last activity observed
//   location_text    : STRING?   -- Self-reported location
//   website_url      : STRING?   -- Listed website
//   linked_emails    : LIST<STRING> -- Associated email addresses
//   risk_score       : FLOAT     -- 0.0 to 1.0
//   source           : STRING
//   source_reference : STRING?
//   first_seen       : DATETIME
//   last_seen        : DATETIME
//   created_at       : DATETIME
//   created_by       : STRING
//   pg_entity_id     : STRING?
//   tags             : LIST<STRING>
//   metadata         : MAP?

// ----------------------------------------------------------------------------
// GeoLocation
// ----------------------------------------------------------------------------
// A physical location (point or region) associated with investigative data.
//
// Properties:
//   id               : STRING    -- UUID v4, primary key
//   latitude         : FLOAT     -- WGS84 latitude
//   longitude        : FLOAT     -- WGS84 longitude
//   accuracy_meters  : FLOAT?    -- Location accuracy radius
//   altitude_meters  : FLOAT?    -- Altitude above sea level
//   location_type    : STRING    -- "exact", "approximate", "city_level",
//                                   "region_level", "country_level"
//   address          : STRING?   -- Full street address
//   city             : STRING?   -- City/municipality
//   region           : STRING?   -- State/province/region
//   country          : STRING?   -- Country name
//   country_code     : STRING?   -- ISO 3166-1 alpha-2
//   postal_code      : STRING?   -- Postal/ZIP code
//   timezone         : STRING?   -- IANA timezone (e.g. "America/New_York")
//   geo_source       : STRING?   -- How location was determined:
//                                   "gps", "ip_geolocation", "cell_tower",
//                                   "wifi", "exif", "user_reported", "osint"
//   risk_score       : FLOAT     -- 0.0 to 1.0
//   source           : STRING
//   source_reference : STRING?
//   observed_at      : DATETIME? -- When entity was at this location
//   created_at       : DATETIME
//   created_by       : STRING
//   pg_entity_id     : STRING?
//   tags             : LIST<STRING>
//   metadata         : MAP?

// ----------------------------------------------------------------------------
// Organization
// ----------------------------------------------------------------------------
// A legal entity, informal group, or criminal organization.
//
// Properties:
//   id               : STRING    -- UUID v4, primary key
//   name             : STRING    -- Organization name
//   known_aliases    : STRING?   -- Semicolon-delimited aliases
//   org_type         : STRING    -- "company", "ngo", "government",
//                                   "criminal_group", "forum_admin_group",
//                                   "hosting_provider", "exchange", "other"
//   description      : STRING?   -- Description
//   jurisdiction     : STRING?   -- Country of legal jurisdiction (ISO alpha-2)
//   registration_id  : STRING?   -- Corporate registration number
//   website          : STRING?   -- Primary website
//   industry         : STRING?   -- Industry/sector
//   employee_count   : INTEGER?  -- Approximate employee count
//   is_sanctioned    : BOOLEAN   -- On OFAC/UN/EU sanctions list
//   sanction_lists   : LIST<STRING> -- Which sanctions lists
//   risk_score       : FLOAT     -- 0.0 to 1.0
//   source           : STRING
//   source_reference : STRING?
//   first_seen       : DATETIME
//   last_seen        : DATETIME
//   created_at       : DATETIME
//   created_by       : STRING
//   pg_entity_id     : STRING?
//   tags             : LIST<STRING>
//   metadata         : MAP?


// ============================================================================
// 4. RELATIONSHIP DEFINITIONS (with property documentation)
// ============================================================================
// Every relationship carries audit and provenance properties.
//
// Common relationship properties (present on ALL relationship types):
//   id               : STRING    -- UUID v4 for the relationship itself
//   confidence       : FLOAT     -- 0.0 to 1.0, how confident we are
//   source           : STRING    -- DataSourceType enum value
//   source_reference : STRING?   -- Origin reference
//   evidence_ids     : LIST<STRING> -- UUIDs of supporting evidence items
//   case_ids         : LIST<STRING> -- UUIDs of associated cases
//   created_at       : DATETIME  -- When relationship was established
//   created_by       : STRING    -- Analyst UUID who created it
//   verified_at      : DATETIME? -- When an analyst verified this link
//   verified_by      : STRING?   -- Analyst UUID who verified
//   notes            : STRING?   -- Investigator notes
//   metadata         : MAP?      -- Arbitrary key-value metadata

// ----------------------------------------------------------------------------
// USES_EMAIL
// (Person)-[:USES_EMAIL]->(Email)
// ----------------------------------------------------------------------------
// Additional properties:
//   is_primary       : BOOLEAN   -- Primary email for this person
//   usage_type       : STRING?   -- "personal", "work", "registration", "recovery"
//   first_seen       : DATETIME  -- First observation of this association
//   last_seen        : DATETIME  -- Most recent observation

// ----------------------------------------------------------------------------
// HAS_PHONE
// (Person)-[:HAS_PHONE]->(Phone)
// ----------------------------------------------------------------------------
// Additional properties:
//   is_primary       : BOOLEAN   -- Primary phone for this person
//   usage_type       : STRING?   -- "personal", "work", "burner", "registration"
//   first_seen       : DATETIME
//   last_seen        : DATETIME

// ----------------------------------------------------------------------------
// KNOWN_AS
// (Person)-[:KNOWN_AS]->(Username)
// (Person)-[:KNOWN_AS]->(SocialMediaProfile)
// ----------------------------------------------------------------------------
// Links a person to an alias, username, or social media identity.
// Additional properties:
//   is_primary       : BOOLEAN   -- Primary identity on this platform
//   alias_type       : STRING?   -- "username", "social_profile", "handle",
//                                   "nickname", "real_name"
//   platform         : STRING?   -- Platform name (denormalized for queries)
//   first_seen       : DATETIME
//   last_seen        : DATETIME

// ----------------------------------------------------------------------------
// CONNECTED_TO
// (IPAddress)-[:CONNECTED_TO]->(IPAddress)
// (Person)-[:CONNECTED_TO]->(Person)
// (Domain)-[:CONNECTED_TO]->(Domain)
// ----------------------------------------------------------------------------
// A generic observed connection between two entities of the same type.
// Additional properties:
//   connection_type  : STRING?   -- "network_traffic", "shared_session",
//                                   "mutual_contact", "co_occurrence",
//                                   "infrastructure_link"
//   direction        : STRING?   -- "outbound", "inbound", "bidirectional"
//   protocol         : STRING?   -- "tcp", "udp", "http", "https", "ssh"
//   port             : INTEGER?  -- Network port (if applicable)
//   bytes_transferred: INTEGER?  -- Data volume (if network traffic)
//   session_count    : INTEGER?  -- Number of observed sessions
//   first_seen       : DATETIME
//   last_seen        : DATETIME

// ----------------------------------------------------------------------------
// POSTED_ON
// (Username)-[:POSTED_ON]->(ForumPost)
// (Person)-[:POSTED_ON]->(ForumPost)
// ----------------------------------------------------------------------------
// Authorship of a forum post.
// Additional properties:
//   is_verified_author : BOOLEAN -- Authorship confirmed

// ----------------------------------------------------------------------------
// SENT_TO
// (ChatMessage)-[:SENT_TO]->(Username)
// (ChatMessage)-[:SENT_TO]->(Person)
// (Email)-[:SENT_TO]->(Email)
// ----------------------------------------------------------------------------
// Direction of a message (message -> recipient).
// Additional properties:
//   delivery_status  : STRING?   -- "delivered", "read", "failed", "unknown"
//   is_direct        : BOOLEAN   -- Direct/private message vs group

// ----------------------------------------------------------------------------
// RECEIVED_FROM
// (ChatMessage)-[:RECEIVED_FROM]->(Username)
// (ChatMessage)-[:RECEIVED_FROM]->(Person)
// ----------------------------------------------------------------------------
// Identifies the sender of a message (message -> sender).
// Additional properties:
//   is_forwarded     : BOOLEAN   -- Message was forwarded from elsewhere
//   original_sender  : STRING?   -- Original sender if forwarded

// ----------------------------------------------------------------------------
// HOSTED_ON
// (Domain)-[:HOSTED_ON]->(IPAddress)
// (OnionService)-[:HOSTED_ON]->(IPAddress)
// (OnionService)-[:HOSTED_ON]->(Domain)
// ----------------------------------------------------------------------------
// Hosting relationship between a service and infrastructure.
// Additional properties:
//   hosting_type     : STRING?   -- "dedicated", "shared", "cdn", "cloud",
//                                   "bulletproof"
//   hosting_provider : STRING?   -- Hosting company name
//   first_seen       : DATETIME
//   last_seen        : DATETIME

// ----------------------------------------------------------------------------
// RESOLVES_TO
// (Domain)-[:RESOLVES_TO]->(IPAddress)
// ----------------------------------------------------------------------------
// DNS resolution: a domain resolves to an IP address.
// Additional properties:
//   record_type      : STRING    -- "A", "AAAA", "CNAME", "MX", "NS"
//   ttl              : INTEGER?  -- DNS TTL in seconds
//   first_seen       : DATETIME
//   last_seen        : DATETIME
//   is_current       : BOOLEAN   -- Currently resolving to this IP

// ----------------------------------------------------------------------------
// OWNS_WALLET
// (Person)-[:OWNS_WALLET]->(CryptoWallet)
// (Organization)-[:OWNS_WALLET]->(CryptoWallet)
// ----------------------------------------------------------------------------
// Wallet attribution (person or org owns a crypto wallet).
// Additional properties:
//   attribution_type : STRING    -- "confirmed", "suspected", "cluster_inferred",
//                                   "self_reported", "exchange_identified"
//   attribution_method : STRING? -- How attribution was determined
//   first_seen       : DATETIME
//   last_seen        : DATETIME

// ----------------------------------------------------------------------------
// TRANSACTED_WITH
// (CryptoWallet)-[:TRANSACTED_WITH]->(CryptoWallet)
// ----------------------------------------------------------------------------
// A cryptocurrency transaction between two wallets.
// Additional properties:
//   tx_hash          : STRING    -- Blockchain transaction hash
//   blockchain       : STRING    -- "bitcoin", "ethereum", etc.
//   amount           : FLOAT     -- Amount in native currency units
//   amount_usd       : FLOAT?    -- USD equivalent at time of transaction
//   fee              : FLOAT?    -- Transaction fee
//   block_number     : INTEGER?  -- Block height
//   block_timestamp  : DATETIME? -- Block timestamp
//   tx_type          : STRING?   -- "standard", "mixing", "peel_chain",
//                                   "consolidation", "exchange_deposit",
//                                   "exchange_withdrawal"
//   is_mixer_tx      : BOOLEAN   -- Transaction involves a mixer
//   hop_distance     : INTEGER?  -- Hops from original suspicious wallet
//   risk_score       : FLOAT     -- 0.0 to 1.0

// ----------------------------------------------------------------------------
// LOCATED_AT
// (Person)-[:LOCATED_AT]->(GeoLocation)
// (IPAddress)-[:LOCATED_AT]->(GeoLocation)
// (Organization)-[:LOCATED_AT]->(GeoLocation)
// (Phone)-[:LOCATED_AT]->(GeoLocation)
// ----------------------------------------------------------------------------
// Places an entity at a physical location.
// Additional properties:
//   location_method  : STRING    -- "ip_geolocation", "gps", "cell_tower",
//                                   "exif", "user_reported", "osint", "manual"
//   observed_at      : DATETIME  -- When the entity was observed here
//   is_current       : BOOLEAN   -- Entity currently at this location
//   dwell_time_hours : FLOAT?    -- How long the entity was at this location
//   first_seen       : DATETIME
//   last_seen        : DATETIME

// ----------------------------------------------------------------------------
// MEMBER_OF
// (Person)-[:MEMBER_OF]->(Organization)
// (Username)-[:MEMBER_OF]->(OnionService)
// ----------------------------------------------------------------------------
// Membership in an organization or service community.
// Additional properties:
//   role             : STRING?   -- "admin", "moderator", "member", "vendor",
//                                   "buyer", "vip", "banned"
//   joined_at        : DATETIME? -- When membership started
//   left_at          : DATETIME? -- When membership ended (null = still active)
//   is_active        : BOOLEAN   -- Currently active member
//   first_seen       : DATETIME
//   last_seen        : DATETIME

// ----------------------------------------------------------------------------
// COMMUNICATES_WITH
// (Person)-[:COMMUNICATES_WITH]->(Person)
// (Username)-[:COMMUNICATES_WITH]->(Username)
// ----------------------------------------------------------------------------
// Observed communication between two entities.
// Additional properties:
//   platform         : STRING?   -- Communication platform
//   channel          : STRING?   -- Channel/group (if applicable)
//   message_count    : INTEGER   -- Number of messages exchanged
//   first_message_at : DATETIME  -- Earliest message
//   last_message_at  : DATETIME  -- Most recent message
//   avg_messages_per_day : FLOAT? -- Communication frequency
//   is_encrypted     : BOOLEAN   -- Encrypted channel
//   grooming_risk    : FLOAT?    -- 0.0 to 1.0, grooming risk in conversation
//   first_seen       : DATETIME
//   last_seen        : DATETIME

// ----------------------------------------------------------------------------
// SHARES_CONTENT
// (Person)-[:SHARES_CONTENT]->(ContentHash)
// (Username)-[:SHARES_CONTENT]->(ContentHash)
// (ForumPost)-[:SHARES_CONTENT]->(ContentHash)
// (ChatMessage)-[:SHARES_CONTENT]->(ContentHash)
// (OnionService)-[:SHARES_CONTENT]->(ContentHash)
// ----------------------------------------------------------------------------
// An entity shared or distributed a piece of content.
// Additional properties:
//   share_type       : STRING    -- "uploaded", "posted", "forwarded",
//                                   "linked", "embedded", "attached"
//   shared_at        : DATETIME  -- When the sharing occurred
//   platform         : STRING?   -- Where the sharing happened
//   context          : STRING?   -- Context of the share (message excerpt hash)
//   is_original      : BOOLEAN   -- First known share (original uploader)

// ----------------------------------------------------------------------------
// LINKED_TO
// (any)-[:LINKED_TO]->(any)
// ----------------------------------------------------------------------------
// Generic relationship for connections that do not fit other types.
// Additional properties:
//   link_type        : STRING    -- Describes the nature of the link:
//                                   "referenced_in", "associated_with",
//                                   "co_located", "temporal_correlation",
//                                   "behavioral_pattern", "manual_link"
//   link_description : STRING?   -- Human-readable explanation
//   strength         : FLOAT     -- 0.0 to 1.0, link strength/weight
//   is_bidirectional : BOOLEAN   -- Relationship applies in both directions
//   first_seen       : DATETIME
//   last_seen        : DATETIME

// ----------------------------------------------------------------------------
// INVESTIGATED_IN
// (any)-[:INVESTIGATED_IN]->(Case)
// (Case is a virtual node -- we reference case_id only)
// ----------------------------------------------------------------------------
// Since cases live in Postgres, we model this as a property on the node
// (case_ids list) AND as an explicit relationship to a lightweight Case node
// for graph traversal.
//
// Case node (lightweight reference):
//   id               : STRING    -- UUID matching Postgres cases.id
//   case_number      : STRING    -- e.g. "MP-2025-00142"
//   title            : STRING    -- Case title
//   status           : STRING    -- "open", "in_progress", "closed", "archived"
//   priority         : STRING    -- "critical", "high", "medium", "low"
//   classification   : INTEGER   -- Clearance level (1-5)
//   created_at       : DATETIME
//
// INVESTIGATED_IN additional properties:
//   role_in_case     : STRING    -- "subject", "evidence", "infrastructure",
//                                   "communication", "financial", "related"
//   added_at         : DATETIME  -- When entity was linked to case
//   added_by         : STRING    -- Analyst UUID
//   is_key_entity    : BOOLEAN   -- Flagged as key entity in case


// ============================================================================
// 5. EXAMPLE INVESTIGATION QUERIES
// ============================================================================

// ----------------------------------------------------------------------------
// 5.1 Find all paths between two persons (up to 6 hops)
// ----------------------------------------------------------------------------
// Use case: Discover how two suspects are connected through any intermediary
// entity (emails, phones, wallets, usernames, forums, etc.).
//
// MATCH path = shortestPath(
//   (a:Person {id: $person_id_1})-[*..6]-(b:Person {id: $person_id_2})
// )
// RETURN path;

// All paths (not just shortest) with relationship type filtering:
//
// MATCH path = (a:Person {id: $person_id_1})-[*..6]-(b:Person {id: $person_id_2})
// WHERE ALL(r IN relationships(path) WHERE
//   type(r) IN [
//     'USES_EMAIL', 'HAS_PHONE', 'KNOWN_AS', 'CONNECTED_TO',
//     'COMMUNICATES_WITH', 'OWNS_WALLET', 'TRANSACTED_WITH',
//     'SHARES_CONTENT', 'MEMBER_OF', 'LINKED_TO'
//   ]
// )
// RETURN path
// ORDER BY length(path)
// LIMIT 25;


// ----------------------------------------------------------------------------
// 5.2 Cluster wallets by common ownership or transaction patterns
// ----------------------------------------------------------------------------
// Use case: Identify all wallets controlled by the same entity through
// co-spending (common input heuristic) and transaction graph structure.
//
// -- Find all wallets in the same cluster as a target wallet:
//
// MATCH (target:CryptoWallet {address: $wallet_address})
// MATCH (w:CryptoWallet {cluster_id: target.cluster_id})
// RETURN w.address AS address,
//        w.blockchain AS blockchain,
//        w.balance AS balance,
//        w.total_received AS total_received,
//        w.risk_score AS risk_score,
//        w.label AS label
// ORDER BY w.total_received DESC;

// -- Expand cluster: find wallets 1-3 hops away via transactions,
//    excluding known exchanges:
//
// MATCH (target:CryptoWallet {address: $wallet_address})
// MATCH path = (target)-[:TRANSACTED_WITH*1..3]-(related:CryptoWallet)
// WHERE NOT related.is_exchange
//   AND ALL(r IN relationships(path) WHERE r.amount_usd > 10)
// WITH related, path,
//      REDUCE(total = 0.0, r IN relationships(path) | total + r.amount) AS flow
// RETURN DISTINCT
//   related.address AS address,
//   related.blockchain AS blockchain,
//   related.cluster_id AS cluster_id,
//   related.risk_score AS risk_score,
//   length(path) AS hops,
//   flow AS total_flow
// ORDER BY hops, flow DESC
// LIMIT 100;


// ----------------------------------------------------------------------------
// 5.3 Trace communication chains (grooming detection)
// ----------------------------------------------------------------------------
// Use case: Follow a conversation chain to identify grooming patterns,
// starting from a flagged message.
//
// -- Find all participants in conversations with grooming risk above threshold:
//
// MATCH (msg:ChatMessage)
// WHERE msg.grooming_risk_score >= 0.7
// MATCH (msg)-[:RECEIVED_FROM]->(sender)
// MATCH (msg)-[:SENT_TO]->(recipient)
// RETURN sender.handle AS sender,
//        recipient.handle AS recipient,
//        msg.platform AS platform,
//        msg.channel AS channel,
//        msg.grooming_risk_score AS risk,
//        msg.grooming_stage AS stage,
//        msg.sent_at AS timestamp
// ORDER BY msg.grooming_risk_score DESC, msg.sent_at;

// -- Full communication chain between two users on a platform:
//
// MATCH (u1:Username {handle: $username_1, platform: $platform})
// MATCH (u2:Username {handle: $username_2, platform: $platform})
// MATCH (msg:ChatMessage)-[:RECEIVED_FROM]->(u1)
// WHERE (msg)-[:SENT_TO]->(u2)
// RETURN msg.body_hash AS message_hash,
//        msg.sent_at AS sent_at,
//        msg.grooming_risk_score AS grooming_risk,
//        msg.grooming_stage AS stage,
//        msg.has_attachment AS has_attachment,
//        msg.attachment_types AS attachment_types
// ORDER BY msg.sent_at
// UNION
// MATCH (u1:Username {handle: $username_1, platform: $platform})
// MATCH (u2:Username {handle: $username_2, platform: $platform})
// MATCH (msg:ChatMessage)-[:RECEIVED_FROM]->(u2)
// WHERE (msg)-[:SENT_TO]->(u1)
// RETURN msg.body_hash AS message_hash,
//        msg.sent_at AS sent_at,
//        msg.grooming_risk_score AS grooming_risk,
//        msg.grooming_stage AS stage,
//        msg.has_attachment AS has_attachment,
//        msg.attachment_types AS attachment_types
// ORDER BY msg.sent_at;


// ----------------------------------------------------------------------------
// 5.4 Find shared infrastructure (domains, IPs, hosting)
// ----------------------------------------------------------------------------
// Use case: Identify onion services or domains sharing infrastructure,
// which may indicate common operators.
//
// -- Find onion services hosted on the same IP address:
//
// MATCH (os1:OnionService)-[:HOSTED_ON]->(ip:IPAddress)<-[:HOSTED_ON]-(os2:OnionService)
// WHERE os1.id < os2.id  // avoid duplicate pairs
// RETURN os1.onion_url AS service_1,
//        os2.onion_url AS service_2,
//        ip.address AS shared_ip,
//        ip.asn_org AS hosting_provider,
//        os1.risk_score + os2.risk_score AS combined_risk
// ORDER BY combined_risk DESC;

// -- Find domains resolving to the same IP as a target domain:
//
// MATCH (target:Domain {name: $domain_name})-[:RESOLVES_TO]->(ip:IPAddress)
// MATCH (other:Domain)-[:RESOLVES_TO]->(ip)
// WHERE other.name <> target.name
// RETURN other.name AS co_hosted_domain,
//        ip.address AS ip_address,
//        ip.asn_org AS asn_org,
//        other.risk_score AS risk_score,
//        other.ssl_fingerprint AS ssl_fingerprint
// ORDER BY other.risk_score DESC;

// -- Find shared SSL certificates across domains and onion services:
//
// MATCH (a)-[:HOSTED_ON|RESOLVES_TO*1..2]->(ip:IPAddress)
// WHERE (a:Domain OR a:OnionService)
//   AND a.ssl_fingerprint IS NOT NULL
// WITH a.ssl_fingerprint AS cert, COLLECT(DISTINCT a) AS services
// WHERE SIZE(services) > 1
// UNWIND services AS svc
// RETURN cert AS ssl_fingerprint,
//        labels(svc)[0] AS entity_type,
//        COALESCE(svc.name, svc.onion_url) AS identifier,
//        svc.risk_score AS risk_score
// ORDER BY cert, entity_type;


// ----------------------------------------------------------------------------
// 5.5 Identify persons sharing CSAM content
// ----------------------------------------------------------------------------
// Use case: Find all persons (directly or via usernames) who shared content
// classified as CSAM, and find commonalities between them.
//
// MATCH (h:ContentHash)
// WHERE h.classification IN ['csam_suspect', 'csam_confirmed']
//   AND h.csam_score >= 0.85
// MATCH (sharer)-[:SHARES_CONTENT]->(h)
// OPTIONAL MATCH (person:Person)-[:KNOWN_AS]->(sharer)
// WITH COALESCE(person, sharer) AS entity, h,
//      labels(sharer) AS sharer_labels
// RETURN entity.id AS entity_id,
//        COALESCE(entity.display_name, entity.handle) AS name,
//        sharer_labels AS entity_type,
//        COLLECT(DISTINCT h.sha256) AS content_hashes,
//        COUNT(DISTINCT h) AS content_count,
//        MAX(h.csam_score) AS max_csam_score
// ORDER BY content_count DESC
// LIMIT 50;


// ----------------------------------------------------------------------------
// 5.6 Expand entity neighborhood (ego graph for visualization)
// ----------------------------------------------------------------------------
// Use case: Retrieve the immediate neighborhood of any node for the
// investigation graph UI.
//
// MATCH (center {id: $entity_id})
// OPTIONAL MATCH (center)-[r]-(neighbor)
// RETURN center, r, neighbor
// LIMIT 200;

// -- With depth control and type filtering:
//
// MATCH path = (center {id: $entity_id})-[*1..2]-(neighbor)
// WHERE ALL(r IN relationships(path) WHERE
//   type(r) IN $allowed_relationship_types
// )
// WITH DISTINCT neighbor, path
// RETURN nodes(path) AS nodes,
//        relationships(path) AS relationships
// LIMIT 500;


// ----------------------------------------------------------------------------
// 5.7 Timeline query: activity of a suspect across all platforms
// ----------------------------------------------------------------------------
//
// MATCH (p:Person {id: $person_id})-[:KNOWN_AS]->(u:Username)
// OPTIONAL MATCH (u)-[:POSTED_ON]->(post:ForumPost)
// OPTIONAL MATCH (msg:ChatMessage)-[:RECEIVED_FROM]->(u)
// WITH p, u,
//      COLLECT(DISTINCT {
//        type: 'forum_post',
//        timestamp: post.posted_at,
//        platform: post.forum_name,
//        risk_score: post.risk_score
//      }) AS posts,
//      COLLECT(DISTINCT {
//        type: 'chat_message',
//        timestamp: msg.sent_at,
//        platform: msg.platform,
//        risk_score: msg.risk_score
//      }) AS messages
// UNWIND (posts + messages) AS event
// WHERE event.timestamp IS NOT NULL
// RETURN event.type AS event_type,
//        event.timestamp AS timestamp,
//        event.platform AS platform,
//        u.handle AS username,
//        event.risk_score AS risk_score
// ORDER BY event.timestamp DESC
// LIMIT 500;


// ----------------------------------------------------------------------------
// 5.8 Find wallets receiving funds from sanctioned addresses
// ----------------------------------------------------------------------------
//
// MATCH (sanctioned:CryptoWallet)
// WHERE sanctioned.is_sanctioned = true
// MATCH path = (sanctioned)-[:TRANSACTED_WITH*1..4]->(downstream:CryptoWallet)
// WHERE NOT downstream.is_exchange
//   AND NOT downstream.is_sanctioned
// WITH downstream, path,
//      [r IN relationships(path) | r.amount_usd] AS amounts,
//      [r IN relationships(path) | r.block_timestamp] AS timestamps
// RETURN downstream.address AS wallet_address,
//        downstream.blockchain AS blockchain,
//        downstream.label AS label,
//        length(path) AS hops_from_sanctioned,
//        REDUCE(min_amt = 999999999.0, a IN amounts |
//          CASE WHEN a < min_amt THEN a ELSE min_amt END
//        ) AS min_amount_usd,
//        timestamps[-1] AS last_tx_time
// ORDER BY hops_from_sanctioned, last_tx_time DESC
// LIMIT 100;


// ----------------------------------------------------------------------------
// 5.9 Cross-platform identity resolution
// ----------------------------------------------------------------------------
// Use case: Find persons who appear on multiple platforms via shared emails,
// phones, or avatar hashes.
//
// -- Via shared email:
// MATCH (p1:Person)-[:USES_EMAIL]->(e:Email)<-[:USES_EMAIL]-(p2:Person)
// WHERE p1.id < p2.id
// RETURN p1.display_name AS person_1,
//        p2.display_name AS person_2,
//        e.address AS shared_email,
//        p1.risk_score + p2.risk_score AS combined_risk
// ORDER BY combined_risk DESC;

// -- Via shared avatar hash across social profiles:
// MATCH (sm1:SocialMediaProfile)
// WHERE sm1.avatar_hash IS NOT NULL
// MATCH (sm2:SocialMediaProfile {avatar_hash: sm1.avatar_hash})
// WHERE sm1.id < sm2.id
//   AND sm1.platform <> sm2.platform
// OPTIONAL MATCH (p1:Person)-[:KNOWN_AS]->(sm1)
// OPTIONAL MATCH (p2:Person)-[:KNOWN_AS]->(sm2)
// RETURN sm1.platform AS platform_1,
//        sm1.username AS username_1,
//        sm2.platform AS platform_2,
//        sm2.username AS username_2,
//        sm1.avatar_hash AS shared_avatar_hash,
//        p1.display_name AS person_1,
//        p2.display_name AS person_2;


// ----------------------------------------------------------------------------
// 5.10 Dark web marketplace operator identification
// ----------------------------------------------------------------------------
// Use case: Link onion service operators by tracing from the service through
// its infrastructure, wallets, and associated identities.
//
// MATCH (os:OnionService)
// WHERE os.service_type = 'marketplace'
//   AND os.risk_score >= 0.8
// OPTIONAL MATCH (os)-[:HOSTED_ON]->(ip:IPAddress)
// OPTIONAL MATCH (os)<-[:MEMBER_OF {role: 'admin'}]-(admin_user:Username)
// OPTIONAL MATCH (admin_user)<-[:KNOWN_AS]-(admin_person:Person)
// OPTIONAL MATCH (admin_person)-[:OWNS_WALLET]->(wallet:CryptoWallet)
// RETURN os.onion_url AS marketplace,
//        os.page_title AS title,
//        COLLECT(DISTINCT ip.address) AS hosting_ips,
//        COLLECT(DISTINCT admin_user.handle) AS admin_usernames,
//        COLLECT(DISTINCT admin_person.display_name) AS admin_persons,
//        COLLECT(DISTINCT wallet.address) AS admin_wallets
// ORDER BY os.risk_score DESC;


// ============================================================================
// 6. GRAPH ANALYTICS PROCEDURES (Neo4j Graph Data Science)
// ============================================================================
// These procedures require the Neo4j GDS plugin (>= 2.x).
// Run CALL gds.list() to verify GDS is installed.

// ----------------------------------------------------------------------------
// 6.1 Community detection (Louvain) -- find clusters of related entities
// ----------------------------------------------------------------------------
// Projects a graph of persons, usernames, emails, and phones with their
// connecting relationships, then runs Louvain community detection.
//
// -- Step 1: Create a named graph projection
// CALL gds.graph.project(
//   'investigation-community-graph',
//   ['Person', 'Username', 'Email', 'Phone', 'CryptoWallet'],
//   {
//     USES_EMAIL:        {orientation: 'UNDIRECTED'},
//     HAS_PHONE:         {orientation: 'UNDIRECTED'},
//     KNOWN_AS:          {orientation: 'UNDIRECTED'},
//     COMMUNICATES_WITH: {orientation: 'UNDIRECTED'},
//     OWNS_WALLET:       {orientation: 'UNDIRECTED'},
//     TRANSACTED_WITH:   {orientation: 'UNDIRECTED'},
//     LINKED_TO:         {orientation: 'UNDIRECTED'}
//   }
// );
//
// -- Step 2: Run Louvain community detection
// CALL gds.louvain.stream('investigation-community-graph')
// YIELD nodeId, communityId
// WITH gds.util.asNode(nodeId) AS node, communityId
// RETURN communityId,
//        labels(node)[0] AS node_type,
//        node.id AS entity_id,
//        COALESCE(node.display_name, node.handle, node.address, node.number) AS label
// ORDER BY communityId, node_type;
//
// -- Step 3: Write community IDs back to nodes
// CALL gds.louvain.write('investigation-community-graph', {
//   writeProperty: 'community_id'
// })
// YIELD communityCount, modularity, ranLevels
// RETURN communityCount, modularity, ranLevels;
//
// -- Step 4: Clean up projection
// CALL gds.graph.drop('investigation-community-graph');


// ----------------------------------------------------------------------------
// 6.2 Centrality analysis -- find the most connected/important nodes
// ----------------------------------------------------------------------------
// Use PageRank to find the most influential entities in the investigation
// graph, and Betweenness Centrality to find critical bridge nodes.

// -- PageRank --
//
// CALL gds.graph.project(
//   'centrality-graph',
//   ['Person', 'Username', 'Email', 'Phone', 'CryptoWallet',
//    'Domain', 'IPAddress', 'OnionService'],
//   {
//     USES_EMAIL:        {orientation: 'UNDIRECTED'},
//     HAS_PHONE:         {orientation: 'UNDIRECTED'},
//     KNOWN_AS:          {orientation: 'UNDIRECTED'},
//     CONNECTED_TO:      {orientation: 'UNDIRECTED'},
//     COMMUNICATES_WITH: {orientation: 'UNDIRECTED'},
//     OWNS_WALLET:       {orientation: 'UNDIRECTED'},
//     TRANSACTED_WITH:   {orientation: 'NATURAL'},
//     HOSTED_ON:         {orientation: 'UNDIRECTED'},
//     RESOLVES_TO:       {orientation: 'UNDIRECTED'},
//     MEMBER_OF:         {orientation: 'UNDIRECTED'},
//     SHARES_CONTENT:    {orientation: 'UNDIRECTED'},
//     LINKED_TO:         {orientation: 'UNDIRECTED'}
//   }
// );
//
// CALL gds.pageRank.stream('centrality-graph', {
//   maxIterations: 50,
//   dampingFactor: 0.85
// })
// YIELD nodeId, score
// WITH gds.util.asNode(nodeId) AS node, score
// RETURN labels(node)[0] AS node_type,
//        node.id AS entity_id,
//        COALESCE(node.display_name, node.handle, node.address,
//                 node.name, node.number, node.onion_url) AS label,
//        round(score, 6) AS pagerank
// ORDER BY score DESC
// LIMIT 50;

// -- Betweenness Centrality (find bridge nodes) --
//
// CALL gds.betweenness.stream('centrality-graph')
// YIELD nodeId, score
// WITH gds.util.asNode(nodeId) AS node, score
// WHERE score > 0
// RETURN labels(node)[0] AS node_type,
//        node.id AS entity_id,
//        COALESCE(node.display_name, node.handle, node.address,
//                 node.name, node.number, node.onion_url) AS label,
//        round(score, 4) AS betweenness
// ORDER BY score DESC
// LIMIT 50;
//
// -- Clean up
// CALL gds.graph.drop('centrality-graph');


// ----------------------------------------------------------------------------
// 6.3 Wallet clustering via Label Propagation
// ----------------------------------------------------------------------------
// Groups crypto wallets into clusters based on transaction patterns.
//
// CALL gds.graph.project(
//   'wallet-cluster-graph',
//   'CryptoWallet',
//   {
//     TRANSACTED_WITH: {
//       orientation: 'UNDIRECTED',
//       properties: ['amount_usd']
//     }
//   }
// );
//
// CALL gds.labelPropagation.stream('wallet-cluster-graph', {
//   maxIterations: 100
// })
// YIELD nodeId, communityId
// WITH gds.util.asNode(nodeId) AS wallet, communityId
// RETURN communityId AS cluster,
//        COUNT(*) AS wallet_count,
//        COLLECT(wallet.address) AS addresses,
//        SUM(wallet.total_received) AS cluster_total_received,
//        MAX(wallet.risk_score) AS max_risk_score
// ORDER BY wallet_count DESC
// LIMIT 50;
//
// -- Write cluster assignments
// CALL gds.labelPropagation.write('wallet-cluster-graph', {
//   writeProperty: 'gds_cluster_id',
//   maxIterations: 100
// });
//
// CALL gds.graph.drop('wallet-cluster-graph');


// ----------------------------------------------------------------------------
// 6.4 Weakly Connected Components -- find isolated subgraphs
// ----------------------------------------------------------------------------
// Useful for finding distinct investigation threads that may not yet be linked.
//
// CALL gds.graph.project(
//   'wcc-graph',
//   ['Person', 'Username', 'Email', 'Phone', 'CryptoWallet',
//    'Domain', 'IPAddress', 'OnionService', 'ContentHash'],
//   {
//     USES_EMAIL:        {orientation: 'UNDIRECTED'},
//     HAS_PHONE:         {orientation: 'UNDIRECTED'},
//     KNOWN_AS:          {orientation: 'UNDIRECTED'},
//     CONNECTED_TO:      {orientation: 'UNDIRECTED'},
//     COMMUNICATES_WITH: {orientation: 'UNDIRECTED'},
//     OWNS_WALLET:       {orientation: 'UNDIRECTED'},
//     TRANSACTED_WITH:   {orientation: 'UNDIRECTED'},
//     HOSTED_ON:         {orientation: 'UNDIRECTED'},
//     RESOLVES_TO:       {orientation: 'UNDIRECTED'},
//     SHARES_CONTENT:    {orientation: 'UNDIRECTED'},
//     LINKED_TO:         {orientation: 'UNDIRECTED'}
//   }
// );
//
// CALL gds.wcc.stream('wcc-graph')
// YIELD nodeId, componentId
// WITH componentId, COLLECT(gds.util.asNode(nodeId)) AS members
// RETURN componentId,
//        SIZE(members) AS member_count,
//        [m IN members | labels(m)[0]] AS member_types
// ORDER BY member_count DESC
// LIMIT 25;
//
// CALL gds.graph.drop('wcc-graph');


// ----------------------------------------------------------------------------
// 6.5 Node Similarity -- find structurally similar entities
// ----------------------------------------------------------------------------
// Identify persons who interact with similar entities (emails, wallets, forums).
//
// CALL gds.graph.project(
//   'similarity-graph',
//   ['Person', 'Email', 'CryptoWallet', 'Username', 'OnionService'],
//   {
//     USES_EMAIL:   {orientation: 'NATURAL'},
//     OWNS_WALLET:  {orientation: 'NATURAL'},
//     KNOWN_AS:     {orientation: 'NATURAL'},
//     MEMBER_OF:    {orientation: 'NATURAL'}
//   }
// );
//
// CALL gds.nodeSimilarity.stream('similarity-graph', {
//   topK: 10,
//   similarityCutoff: 0.3
// })
// YIELD node1, node2, similarity
// WITH gds.util.asNode(node1) AS person1,
//      gds.util.asNode(node2) AS person2,
//      similarity
// WHERE 'Person' IN labels(person1)
//   AND 'Person' IN labels(person2)
// RETURN person1.display_name AS person_1,
//        person2.display_name AS person_2,
//        round(similarity, 4) AS similarity_score
// ORDER BY similarity DESC
// LIMIT 25;
//
// CALL gds.graph.drop('similarity-graph');


// ============================================================================
// 7. MAINTENANCE UTILITIES
// ============================================================================

// ----------------------------------------------------------------------------
// 7.1 Schema introspection
// ----------------------------------------------------------------------------
// Verify constraints and indexes are in place.
//
// SHOW CONSTRAINTS;
// SHOW INDEXES;

// ----------------------------------------------------------------------------
// 7.2 Node/relationship counts by label/type (health check)
// ----------------------------------------------------------------------------
//
// CALL db.labels() YIELD label
// CALL db.stats.retrieve('GRAPH COUNTS') YIELD data
// RETURN label, data;
//
// -- Simpler per-label count:
// MATCH (n)
// RETURN labels(n) AS node_labels,
//        COUNT(*) AS count
// ORDER BY count DESC;
//
// -- Relationship type counts:
// MATCH ()-[r]->()
// RETURN type(r) AS relationship_type,
//        COUNT(*) AS count
// ORDER BY count DESC;

// ----------------------------------------------------------------------------
// 7.3 Orphan detection (nodes with no relationships)
// ----------------------------------------------------------------------------
//
// MATCH (n)
// WHERE NOT (n)--()
// RETURN labels(n) AS node_type,
//        n.id AS entity_id,
//        COALESCE(n.display_name, n.handle, n.address,
//                 n.name, n.number, n.onion_url, n.sha256) AS label,
//        n.created_at AS created_at
// ORDER BY n.created_at DESC
// LIMIT 100;

// ----------------------------------------------------------------------------
// 7.4 Stale data detection (nodes not updated recently)
// ----------------------------------------------------------------------------
//
// MATCH (n)
// WHERE n.last_seen < datetime() - duration({days: 90})
// RETURN labels(n) AS node_type,
//        n.id AS entity_id,
//        n.last_seen AS last_seen,
//        COALESCE(n.display_name, n.handle, n.address,
//                 n.name, n.number) AS label
// ORDER BY n.last_seen
// LIMIT 200;

// ----------------------------------------------------------------------------
// 7.5 Audit: high-risk entities not assigned to a case
// ----------------------------------------------------------------------------
//
// MATCH (n)
// WHERE n.risk_score >= 0.8
//   AND NOT (n)-[:INVESTIGATED_IN]->()
// RETURN labels(n) AS node_type,
//        n.id AS entity_id,
//        n.risk_score AS risk_score,
//        COALESCE(n.display_name, n.handle, n.address,
//                 n.name, n.number, n.sha256) AS label
// ORDER BY n.risk_score DESC
// LIMIT 100;

// ----------------------------------------------------------------------------
// 7.6 Data retention: purge nodes older than retention window
// ----------------------------------------------------------------------------
// IMPORTANT: This is a destructive operation. Only run under authorized
// maintenance windows with proper audit logging.
//
// -- Dry run (count only):
// MATCH (n)
// WHERE n.created_at < datetime() - duration({days: $retention_days})
//   AND NOT (n)-[:INVESTIGATED_IN]->()
// RETURN labels(n) AS node_type, COUNT(*) AS purge_count;
//
// -- Execute purge (batch delete to avoid memory pressure):
// CALL apoc.periodic.iterate(
//   "MATCH (n)
//    WHERE n.created_at < datetime() - duration({days: $retention_days})
//      AND NOT (n)-[:INVESTIGATED_IN]->()
//    RETURN n",
//   "DETACH DELETE n",
//   {batchSize: 1000, parallel: false}
// );

// ----------------------------------------------------------------------------
// 7.7 Warm up caches after restart
// ----------------------------------------------------------------------------
//
// CALL db.index.fulltext.queryNodes('person_fulltext', '*') YIELD node
// RETURN COUNT(node);
//
// CALL db.index.fulltext.queryNodes('post_fulltext', '*') YIELD node
// RETURN COUNT(node);
//
// CALL db.index.fulltext.queryNodes('chat_fulltext', '*') YIELD node
// RETURN COUNT(node);


// ============================================================================
// END OF SCHEMA
// ============================================================================
// This schema is designed to work alongside the PostgreSQL relational schema
// (see /opt/MaryPoppins/backend/models/database.py). Neo4j serves as the
// graph traversal and relationship analysis engine, while PostgreSQL remains
// the authoritative store for case management, audit logs, and structured
// records. Entities are cross-referenced via the pg_entity_id property on
// graph nodes, which maps to the entities.id column in Postgres.
//
// For questions or modifications, contact the Mary Poppins platform team.
// ============================================================================

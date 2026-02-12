/**
 * Mary Poppins -- Dark Web Monitor Page
 *
 * Full tabbed dashboard for dark web monitoring operations:
 *   1. Sources      -- Monitored .onion sources with health, crawl depth, risk
 *   2. Crawl Results -- Timeline of indexed pages with risk scoring
 *   3. Keywords     -- Alert keywords by category with enable/disable toggles
 *   4. Threat Intel -- External intelligence feeds with sync controls
 *   5. Mentions     -- Correlated mention timeline with investigation links
 *
 * Zero Visual Exposure -- raw content is NEVER stored or displayed.
 * Only hashes, scores, sanitized snippets, and metadata are shown.
 */
import { useState } from 'react';
import { useToast, useIsDemoTenant } from '../App';
import Modal from '../components/common/Modal';

/* ================================================================== */
/*  1. TYPE DEFINITIONS                                                */
/* ================================================================== */

type DarkWebTab = 'sources' | 'crawl_results' | 'keywords' | 'threat_intel' | 'mentions';

interface DarkWebSource {
  id: string;
  name: string;
  status: 'monitoring' | 'paused' | 'error' | 'initializing';
  lastScan: string;
  mentions: number;
  risk: 'critical' | 'high' | 'medium' | 'low';
  type: 'forum' | 'marketplace' | 'paste' | 'onion_site' | 'image_board';
  url: string;
  crawlDepth: number;
  pagesIndexed: number;
  activeAlerts: number;
  healthScore: number;
}

interface CrawlResult {
  id: string;
  sourceId: string;
  sourceName: string;
  url: string;
  pageTitle: string;
  contentHash: string;
  timestamp: string;
  riskScore: number;
  category: string;
  keywordsFound: string[];
  outgoingOnionLinks: number;
}

interface KeywordAlert {
  id: string;
  keyword: string;
  category: 'high_risk' | 'marketplace' | 'financial' | 'infrastructure' | 'custom';
  matchCount: number;
  lastMatch: string;
  enabled: boolean;
}

interface ThreatIntelFeed {
  id: string;
  name: string;
  provider: string;
  lastUpdate: string;
  indicators: number;
  status: 'active' | 'stale' | 'error';
  type: 'onion_urls' | 'aliases' | 'pgp_keys' | 'crypto_addresses';
}

interface MentionDetail {
  id: string;
  sourceId: string;
  sourceName: string;
  type: 'keyword_match' | 'alias_correlation' | 'hash_match' | 'vendor_listing' | 'new_user';
  summary: string;
  context: string;
  timestamp: string;
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  linkedCaseId?: string;
}

/* ================================================================== */
/*  2. MOCK DATA                                                       */
/* ================================================================== */

const INITIAL_SOURCES: DarkWebSource[] = [
  { id: 'dw-1',  name: 'Forum Alpha',           status: 'monitoring',   lastScan: '12 min ago',  mentions: 23, risk: 'critical', type: 'forum',       url: 'http://alpha[.]onion',   crawlDepth: 3, pagesIndexed: 4821,  activeAlerts: 8,  healthScore: 95 },
  { id: 'dw-2',  name: 'Market Beta',            status: 'monitoring',   lastScan: '45 min ago',  mentions: 7,  risk: 'high',     type: 'marketplace', url: 'http://beta[.]onion',    crawlDepth: 2, pagesIndexed: 1256,  activeAlerts: 3,  healthScore: 88 },
  { id: 'dw-3',  name: 'Paste Site Gamma',       status: 'paused',       lastScan: '2 hours ago', mentions: 1,  risk: 'low',      type: 'paste',       url: 'http://gamma[.]onion',   crawlDepth: 1, pagesIndexed: 342,   activeAlerts: 0,  healthScore: 72 },
  { id: 'dw-4',  name: 'Forum Delta',            status: 'monitoring',   lastScan: '8 min ago',   mentions: 41, risk: 'critical', type: 'forum',       url: 'http://delta[.]onion',   crawlDepth: 4, pagesIndexed: 8932,  activeAlerts: 15, healthScore: 91 },
  { id: 'dw-5',  name: 'Image Board Epsilon',    status: 'monitoring',   lastScan: '3 min ago',   mentions: 67, risk: 'critical', type: 'image_board', url: 'http://epsilon[.]onion', crawlDepth: 2, pagesIndexed: 1423,  activeAlerts: 12, healthScore: 92 },
  { id: 'dw-6',  name: 'Paste Site Zeta',        status: 'monitoring',   lastScan: '1 hour ago',  mentions: 3,  risk: 'low',      type: 'paste',       url: 'http://zeta[.]onion',    crawlDepth: 1, pagesIndexed: 892,   activeAlerts: 1,  healthScore: 88 },
  { id: 'dw-7',  name: 'Marketplace Eta',        status: 'error',        lastScan: '6 hours ago', mentions: 0,  risk: 'high',     type: 'marketplace', url: 'http://eta[.]onion',     crawlDepth: 3, pagesIndexed: 2100,  activeAlerts: 0,  healthScore: 0 },
  { id: 'dw-8',  name: 'Forum Theta',            status: 'monitoring',   lastScan: '22 min ago',  mentions: 19, risk: 'high',     type: 'forum',       url: 'http://theta[.]onion',   crawlDepth: 3, pagesIndexed: 5643,  activeAlerts: 6,  healthScore: 84 },
  { id: 'dw-9',  name: 'Onion Directory Iota',   status: 'monitoring',   lastScan: '35 min ago',  mentions: 5,  risk: 'medium',   type: 'onion_site',  url: 'http://iota[.]onion',    crawlDepth: 2, pagesIndexed: 780,   activeAlerts: 2,  healthScore: 90 },
  { id: 'dw-10', name: 'Market Kappa',           status: 'initializing', lastScan: '--',          mentions: 0,  risk: 'medium',   type: 'marketplace', url: 'http://kappa[.]onion',   crawlDepth: 2, pagesIndexed: 0,     activeAlerts: 0,  healthScore: 0 },
  { id: 'dw-11', name: 'Forum Lambda',           status: 'monitoring',   lastScan: '14 min ago',  mentions: 31, risk: 'high',     type: 'forum',       url: 'http://lambda[.]onion',  crawlDepth: 3, pagesIndexed: 6721,  activeAlerts: 9,  healthScore: 87 },
  { id: 'dw-12', name: 'Paste Site Mu',          status: 'paused',       lastScan: '4 hours ago', mentions: 2,  risk: 'low',      type: 'paste',       url: 'http://mu[.]onion',      crawlDepth: 1, pagesIndexed: 456,   activeAlerts: 0,  healthScore: 65 },
];

const INITIAL_CRAWL_RESULTS: CrawlResult[] = [
  { id: 'cr-1',  sourceId: 'dw-1',  sourceName: 'Forum Alpha',        url: 'http://alpha[.]onion/thread/4821',      pageTitle: 'forum thread: encrypted comms discussion',              contentHash: 'sha256:a7f3c2...e91b', timestamp: '2 min ago',   riskScore: 0.82, category: 'communication',   keywordsFound: ['pgp', 'tor bridge', 'dead drop'],          outgoingOnionLinks: 4 },
  { id: 'cr-2',  sourceId: 'dw-4',  sourceName: 'Forum Delta',        url: 'http://delta[.]onion/post/91204',       pageTitle: 'vendor listing: [redacted]',                            contentHash: 'sha256:b1d4e8...f03a', timestamp: '5 min ago',   riskScore: 0.91, category: 'marketplace',     keywordsFound: ['escrow', 'monero', 'drop ship'],           outgoingOnionLinks: 2 },
  { id: 'cr-3',  sourceId: 'dw-5',  sourceName: 'Image Board Epsilon', url: 'http://epsilon[.]onion/board/12/t/887', pageTitle: 'new thread: suspicious content flagged',                contentHash: 'sha256:c9e2a1...d47c', timestamp: '8 min ago',   riskScore: 0.95, category: 'flagged_content', keywordsFound: ['csam', 'exploitation'],                     outgoingOnionLinks: 0 },
  { id: 'cr-4',  sourceId: 'dw-2',  sourceName: 'Market Beta',        url: 'http://beta[.]onion/listing/3344',      pageTitle: 'marketplace: crypto payment portal',                    contentHash: 'sha256:d3f7b5...a82e', timestamp: '11 min ago',  riskScore: 0.67, category: 'financial',       keywordsFound: ['bitcoin mixer', 'tumbler'],                 outgoingOnionLinks: 7 },
  { id: 'cr-5',  sourceId: 'dw-8',  sourceName: 'Forum Theta',        url: 'http://theta[.]onion/thread/7210',      pageTitle: 'forum thread: opsec tips for vendors',                  contentHash: 'sha256:e6a9c4...b15d', timestamp: '15 min ago',  riskScore: 0.54, category: 'operational',     keywordsFound: ['vpn no-logs', 'bulletproof hosting'],       outgoingOnionLinks: 3 },
  { id: 'cr-6',  sourceId: 'dw-6',  sourceName: 'Paste Site Zeta',    url: 'http://zeta[.]onion/paste/aa92f1',      pageTitle: 'new paste: base64 encoded data',                        contentHash: 'sha256:f2b8d1...c93f', timestamp: '18 min ago',  riskScore: 0.43, category: 'data_dump',       keywordsFound: ['pgp', 'dead drop'],                         outgoingOnionLinks: 1 },
  { id: 'cr-7',  sourceId: 'dw-11', sourceName: 'Forum Lambda',       url: 'http://lambda[.]onion/thread/1582',     pageTitle: 'forum thread: new vendor introduction',                 contentHash: 'sha256:a1c3e5...d72b', timestamp: '22 min ago',  riskScore: 0.38, category: 'marketplace',     keywordsFound: ['escrow', 'bulk pricing'],                   outgoingOnionLinks: 2 },
  { id: 'cr-8',  sourceId: 'dw-5',  sourceName: 'Image Board Epsilon', url: 'http://epsilon[.]onion/board/7/t/443',  pageTitle: 'thread flagged: automated hash match detected',         contentHash: 'sha256:b4d6f8...e91a', timestamp: '27 min ago',  riskScore: 0.93, category: 'flagged_content', keywordsFound: ['exploitation', 'underage'],                  outgoingOnionLinks: 0 },
  { id: 'cr-9',  sourceId: 'dw-9',  sourceName: 'Onion Directory Iota', url: 'http://iota[.]onion/dir/hidden/42',   pageTitle: 'directory listing: newly indexed onion services',       contentHash: 'sha256:c7e1a3...f84d', timestamp: '34 min ago',  riskScore: 0.29, category: 'infrastructure',  keywordsFound: ['tor bridge'],                               outgoingOnionLinks: 12 },
  { id: 'cr-10', sourceId: 'dw-4',  sourceName: 'Forum Delta',        url: 'http://delta[.]onion/post/91301',       pageTitle: 'vendor listing: bulk order request',                    contentHash: 'sha256:d9f2b4...a63e', timestamp: '41 min ago',  riskScore: 0.78, category: 'marketplace',     keywordsFound: ['bulk pricing', 'monero', 'escrow'],         outgoingOnionLinks: 1 },
  { id: 'cr-11', sourceId: 'dw-1',  sourceName: 'Forum Alpha',        url: 'http://alpha[.]onion/thread/4835',      pageTitle: 'forum thread: pgp key exchange requests',               contentHash: 'sha256:e3a5c7...b92f', timestamp: '48 min ago',  riskScore: 0.35, category: 'communication',   keywordsFound: ['pgp'],                                      outgoingOnionLinks: 0 },
  { id: 'cr-12', sourceId: 'dw-2',  sourceName: 'Market Beta',        url: 'http://beta[.]onion/listing/3401',      pageTitle: 'marketplace: stolen credentials batch',                 contentHash: 'sha256:f1b3d5...c84a', timestamp: '55 min ago',  riskScore: 0.85, category: 'financial',       keywordsFound: ['stolen cards', 'bitcoin mixer'],            outgoingOnionLinks: 3 },
  { id: 'cr-13', sourceId: 'dw-8',  sourceName: 'Forum Theta',        url: 'http://theta[.]onion/thread/7298',      pageTitle: 'forum thread: hosting recommendations',                 contentHash: 'sha256:a2c4e6...d71b', timestamp: '1 hour ago',  riskScore: 0.41, category: 'infrastructure',  keywordsFound: ['bulletproof hosting', 'vpn no-logs'],       outgoingOnionLinks: 5 },
  { id: 'cr-14', sourceId: 'dw-11', sourceName: 'Forum Lambda',       url: 'http://lambda[.]onion/thread/1601',     pageTitle: 'forum thread: monero tumbling service review',          contentHash: 'sha256:b5d7f9...e82c', timestamp: '1 hour ago',  riskScore: 0.72, category: 'financial',       keywordsFound: ['monero', 'tumbler', 'escrow service'],      outgoingOnionLinks: 2 },
  { id: 'cr-15', sourceId: 'dw-5',  sourceName: 'Image Board Epsilon', url: 'http://epsilon[.]onion/board/12/t/901', pageTitle: 'content flagged: known hash match in NCMEC db',          contentHash: 'sha256:c8e2a4...f93d', timestamp: '1 hour ago',  riskScore: 0.94, category: 'flagged_content', keywordsFound: ['csam', 'minor', 'exploitation'],            outgoingOnionLinks: 0 },
  { id: 'cr-16', sourceId: 'dw-6',  sourceName: 'Paste Site Zeta',    url: 'http://zeta[.]onion/paste/bb41c7',      pageTitle: 'new paste: encrypted pgp message block',                contentHash: 'sha256:d1f3b5...a74e', timestamp: '2 hours ago', riskScore: 0.21, category: 'communication',   keywordsFound: ['pgp', 'dead drop'],                         outgoingOnionLinks: 0 },
  { id: 'cr-17', sourceId: 'dw-4',  sourceName: 'Forum Delta',        url: 'http://delta[.]onion/post/91415',       pageTitle: 'vendor listing: new drop ship service announced',       contentHash: 'sha256:e4a6c8...b65f', timestamp: '2 hours ago', riskScore: 0.69, category: 'marketplace',     keywordsFound: ['drop ship', 'escrow'],                      outgoingOnionLinks: 4 },
  { id: 'cr-18', sourceId: 'dw-9',  sourceName: 'Onion Directory Iota', url: 'http://iota[.]onion/dir/hidden/58',   pageTitle: 'directory listing: mirror sites for known marketplaces', contentHash: 'sha256:f7b9d1...c46a', timestamp: '3 hours ago', riskScore: 0.52, category: 'infrastructure',  keywordsFound: ['tor bridge', 'bulletproof hosting'],        outgoingOnionLinks: 9 },
  { id: 'cr-19', sourceId: 'dw-1',  sourceName: 'Forum Alpha',        url: 'http://alpha[.]onion/thread/4801',      pageTitle: 'forum thread: crypto cashout methods discussion',       contentHash: 'sha256:a9c1e3...d58b', timestamp: '3 hours ago', riskScore: 0.61, category: 'financial',       keywordsFound: ['monero exchange', 'bitcoin mixer'],         outgoingOnionLinks: 1 },
  { id: 'cr-20', sourceId: 'dw-8',  sourceName: 'Forum Theta',        url: 'http://theta[.]onion/thread/7185',      pageTitle: 'forum thread: invite-only marketplace access',          contentHash: 'sha256:b2d4f6...e39c', timestamp: '4 hours ago', riskScore: 0.47, category: 'marketplace',     keywordsFound: ['vendor listing', 'escrow service'],         outgoingOnionLinks: 6 },
];

const INITIAL_KEYWORDS: KeywordAlert[] = [
  { id: 'kw-1',  keyword: 'csam',                      category: 'high_risk',      matchCount: 142, lastMatch: '3 min ago',   enabled: true },
  { id: 'kw-2',  keyword: 'cp links',                   category: 'high_risk',      matchCount: 87,  lastMatch: '11 min ago',  enabled: true },
  { id: 'kw-3',  keyword: 'minor',                      category: 'high_risk',      matchCount: 234, lastMatch: '6 min ago',   enabled: true },
  { id: 'kw-4',  keyword: 'exploitation',               category: 'high_risk',      matchCount: 198, lastMatch: '8 min ago',   enabled: true },
  { id: 'kw-5',  keyword: 'underage',                   category: 'high_risk',      matchCount: 112, lastMatch: '14 min ago',  enabled: true },
  { id: 'kw-6',  keyword: 'vendor listing',             category: 'marketplace',    matchCount: 567, lastMatch: '2 min ago',   enabled: true },
  { id: 'kw-7',  keyword: 'escrow service',             category: 'marketplace',    matchCount: 321, lastMatch: '19 min ago',  enabled: true },
  { id: 'kw-8',  keyword: 'bulk pricing',               category: 'marketplace',    matchCount: 145, lastMatch: '33 min ago',  enabled: true },
  { id: 'kw-9',  keyword: 'bitcoin mixer',              category: 'financial',      matchCount: 89,  lastMatch: '25 min ago',  enabled: true },
  { id: 'kw-10', keyword: 'monero exchange',            category: 'financial',      matchCount: 56,  lastMatch: '41 min ago',  enabled: true },
  { id: 'kw-11', keyword: 'stolen cards',               category: 'financial',      matchCount: 203, lastMatch: '17 min ago',  enabled: true },
  { id: 'kw-12', keyword: 'tor bridge',                 category: 'infrastructure', matchCount: 34,  lastMatch: '1 hour ago',  enabled: true },
  { id: 'kw-13', keyword: 'bulletproof hosting',        category: 'infrastructure', matchCount: 78,  lastMatch: '52 min ago',  enabled: true },
  { id: 'kw-14', keyword: 'vpn no-logs',                category: 'infrastructure', matchCount: 45,  lastMatch: '2 hours ago', enabled: false },
  { id: 'kw-15', keyword: 'operation-darklight-poi',    category: 'custom',         matchCount: 12,  lastMatch: '4 hours ago', enabled: true },
  { id: 'kw-16', keyword: 'target-alias-shadow7',       category: 'custom',         matchCount: 3,   lastMatch: '1 day ago',   enabled: true },
];

const INITIAL_FEEDS: ThreatIntelFeed[] = [
  { id: 'ti-1', name: 'NCMEC Hash Database',   provider: 'NCMEC',        lastUpdate: '15 min ago',  indicators: 142847, status: 'active', type: 'onion_urls' },
  { id: 'ti-2', name: 'INTERPOL ICSE',         provider: 'INTERPOL',     lastUpdate: '2 hours ago', indicators: 89321,  status: 'active', type: 'aliases' },
  { id: 'ti-3', name: 'Project VIC',           provider: 'Project VIC',  lastUpdate: '1 hour ago',  indicators: 56234,  status: 'active', type: 'crypto_addresses' },
  { id: 'ti-4', name: 'Tor Exit Node List',    provider: 'Tor Project',  lastUpdate: '30 min ago',  indicators: 2145,   status: 'active', type: 'onion_urls' },
  { id: 'ti-5', name: 'DarkOwl Vision',        provider: 'DarkOwl',      lastUpdate: '3 days ago',  indicators: 234567, status: 'stale',  type: 'aliases' },
  { id: 'ti-6', name: 'Chainalysis Reactor',   provider: 'Chainalysis',  lastUpdate: '45 min ago',  indicators: 12890,  status: 'active', type: 'crypto_addresses' },
];

const INITIAL_MENTIONS: MentionDetail[] = [
  { id: 'mn-1',  sourceId: 'dw-5',  sourceName: 'Image Board Epsilon', type: 'hash_match',        summary: 'Known CSAM hash detected in uploaded content',                                         context: "...content hash sha256:c9e2a1 matched against NCMEC database entry, flagged for immediate review...",                            timestamp: '3 min ago',   riskLevel: 'critical', linkedCaseId: 'CS-2024-0900' },
  { id: 'mn-2',  sourceId: 'dw-4',  sourceName: 'Forum Delta',        type: 'vendor_listing',     summary: 'New vendor listing matches POI keyword alerts',                                         context: "...user 'shadow_vendor7' posted new listing matching keyword alert 'escrow service'...",                                          timestamp: '5 min ago',   riskLevel: 'high' },
  { id: 'mn-3',  sourceId: 'dw-1',  sourceName: 'Forum Alpha',        type: 'keyword_match',      summary: 'Keyword "operation-darklight-poi" found in encrypted thread',                            context: "...thread #4821 contains reference to 'operation-darklight-poi' within pgp-signed message block...",                              timestamp: '8 min ago',   riskLevel: 'critical', linkedCaseId: 'CS-2024-0900' },
  { id: 'mn-4',  sourceId: 'dw-11', sourceName: 'Forum Lambda',       type: 'alias_correlation',  summary: 'Alias "shadow7" correlated across two sources',                                         context: "...username 'shadow7_x' on Forum Lambda matches behavioral pattern of 'shadow_vendor7' on Forum Delta...",                        timestamp: '12 min ago',  riskLevel: 'high',     linkedCaseId: 'CS-2024-0887' },
  { id: 'mn-5',  sourceId: 'dw-2',  sourceName: 'Market Beta',        type: 'keyword_match',      summary: 'Keyword "bitcoin mixer" detected in payment portal listing',                             context: "...listing #3344 advertises integrated bitcoin mixer with tumbling service, 2% fee...",                                           timestamp: '18 min ago',  riskLevel: 'medium' },
  { id: 'mn-6',  sourceId: 'dw-5',  sourceName: 'Image Board Epsilon', type: 'hash_match',        summary: 'Second hash match on Image Board Epsilon within 30 minutes',                             context: "...content hash sha256:b4d6f8 matched Project VIC database, cluster analysis suggests same uploader...",                          timestamp: '27 min ago',  riskLevel: 'critical', linkedCaseId: 'CS-2024-0900' },
  { id: 'mn-7',  sourceId: 'dw-8',  sourceName: 'Forum Theta',        type: 'new_user',           summary: 'New user registration with suspicious profile pattern',                                  context: "...new account 'anon_relay_99' registered with PGP key fingerprint matching known threat actor pattern...",                        timestamp: '35 min ago',  riskLevel: 'medium' },
  { id: 'mn-8',  sourceId: 'dw-4',  sourceName: 'Forum Delta',        type: 'vendor_listing',     summary: 'Bulk order listing detected matching financial keyword alerts',                           context: "...vendor 'crypto_clearance' posted bulk pricing for stolen payment credentials, monero-only...",                                 timestamp: '41 min ago',  riskLevel: 'high',     linkedCaseId: 'CS-2024-0912' },
  { id: 'mn-9',  sourceId: 'dw-9',  sourceName: 'Onion Directory Iota', type: 'keyword_match',    summary: 'New onion service indexed matching "bulletproof hosting" keyword',                       context: "...directory entry for new hosting service claims 'no-logs, law enforcement resistant' infrastructure...",                          timestamp: '52 min ago',  riskLevel: 'low' },
  { id: 'mn-10', sourceId: 'dw-1',  sourceName: 'Forum Alpha',        type: 'alias_correlation',  summary: 'PGP key fingerprint linked to known alias across dark web forums',                       context: "...PGP key 0xAF91 used by 'cryptkeeper_x' matches key previously seen on Market Beta under alias 'ck_vendor'...",                 timestamp: '1 hour ago',  riskLevel: 'high',     linkedCaseId: 'CS-2024-0887' },
  { id: 'mn-11', sourceId: 'dw-6',  sourceName: 'Paste Site Zeta',    type: 'keyword_match',      summary: 'Paste contains "dead drop" reference with encoded coordinates',                          context: "...paste aa92f1 contains base64-encoded block referencing 'dead drop' protocol with geographic indicators...",                     timestamp: '1 hour ago',  riskLevel: 'medium' },
  { id: 'mn-12', sourceId: 'dw-11', sourceName: 'Forum Lambda',       type: 'new_user',           summary: 'New vendor account created with immediate high-value listings',                          context: "...account 'fresh_supply_eu' created 12 min before posting 8 vendor listings, pattern consistent with vendor migration...",        timestamp: '2 hours ago', riskLevel: 'medium' },
  { id: 'mn-13', sourceId: 'dw-2',  sourceName: 'Market Beta',        type: 'vendor_listing',     summary: 'Vendor listing references stolen card batch from known breach',                          context: "...listing #3401 references 'batch 2024-Q4' stolen credentials, matches timeline of reported financial breach...",                 timestamp: '2 hours ago', riskLevel: 'high',     linkedCaseId: 'CS-2024-0912' },
  { id: 'mn-14', sourceId: 'dw-5',  sourceName: 'Image Board Epsilon', type: 'hash_match',        summary: 'Cluster of 4 hash matches detected from single upload session',                          context: "...upload session from 14:32-14:37 UTC produced 4 NCMEC hash matches, content quarantined and flagged...",                         timestamp: '3 hours ago', riskLevel: 'critical', linkedCaseId: 'CS-2024-0900' },
  { id: 'mn-15', sourceId: 'dw-8',  sourceName: 'Forum Theta',        type: 'keyword_match',      summary: 'Discussion thread references "target-alias-shadow7" custom keyword',                    context: "...thread #7185 user references 'shadow7' in context of invite-only marketplace access, possible POI activity...",                 timestamp: '4 hours ago', riskLevel: 'high',     linkedCaseId: 'CS-2024-0887' },
];

/* ================================================================== */
/*  3. CONSTANTS & HELPERS                                             */
/* ================================================================== */

const TAB_DEFS: { id: DarkWebTab; label: string }[] = [
  { id: 'sources',       label: 'Sources' },
  { id: 'crawl_results', label: 'Crawl Results' },
  { id: 'keywords',      label: 'Keywords' },
  { id: 'threat_intel',  label: 'Threat Intel' },
  { id: 'mentions',      label: 'Mentions' },
];

const riskColor: Record<string, string> = {
  critical: 'text-red-400',
  high:     'text-orange-400',
  medium:   'text-amber-400',
  low:      'text-slate-400',
};

const riskBgColor: Record<string, string> = {
  critical: 'bg-red-500/10 text-red-400',
  high:     'bg-orange-500/10 text-orange-400',
  medium:   'bg-amber-500/10 text-amber-400',
  low:      'bg-slate-500/10 text-slate-400',
};

const statusColor: Record<string, string> = {
  monitoring:   'text-emerald-400',
  paused:       'text-slate-500',
  error:        'text-red-400',
  initializing: 'text-blue-400',
};

const typeColor: Record<string, string> = {
  forum:       'bg-violet-500/10 text-violet-400',
  marketplace: 'bg-purple-500/10 text-purple-400',
  paste:       'bg-cyan-500/10 text-cyan-400',
  onion_site:  'bg-emerald-500/10 text-emerald-400',
  image_board: 'bg-rose-500/10 text-rose-400',
};

const categoryBadgeColor: Record<string, string> = {
  high_risk:      'bg-red-500/10 text-red-400',
  marketplace:    'bg-purple-500/10 text-purple-400',
  financial:      'bg-amber-500/10 text-amber-400',
  infrastructure: 'bg-blue-500/10 text-blue-400',
  custom:         'bg-slate-500/10 text-slate-400',
};

const feedStatusColor: Record<string, string> = {
  active: 'bg-emerald-400',
  stale:  'bg-amber-400',
  error:  'bg-red-400',
};

const feedTypeBadge: Record<string, string> = {
  onion_urls:       'bg-violet-500/10 text-violet-400',
  aliases:          'bg-purple-500/10 text-purple-400',
  pgp_keys:         'bg-cyan-500/10 text-cyan-400',
  crypto_addresses: 'bg-amber-500/10 text-amber-400',
};

const mentionTypeBadge: Record<string, string> = {
  keyword_match:     'bg-blue-500/10 text-blue-400',
  alias_correlation: 'bg-purple-500/10 text-purple-400',
  hash_match:        'bg-amber-500/10 text-amber-400',
  vendor_listing:    'bg-red-500/10 text-red-400',
  new_user:          'bg-emerald-500/10 text-emerald-400',
};

const mentionRiskDotColor: Record<string, string> = {
  critical: 'bg-red-400',
  high:     'bg-orange-400',
  medium:   'bg-amber-400',
  low:      'bg-slate-400',
};

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '...' : s;
}

/* ================================================================== */
/*  4. COMPONENT                                                       */
/* ================================================================== */

export default function DarkWebMonitor() {
  const isDemoTenant = useIsDemoTenant();
  const { addToast } = useToast();

  /* ---------- state ---------- */
  const [activeTab, setActiveTab] = useState<DarkWebTab>('sources');
  const [sources, setSources] = useState<DarkWebSource[]>(isDemoTenant ? INITIAL_SOURCES : []);
  const [crawlResults] = useState<CrawlResult[]>(isDemoTenant ? INITIAL_CRAWL_RESULTS : []);
  const [keywords, setKeywords] = useState<KeywordAlert[]>(isDemoTenant ? INITIAL_KEYWORDS : []);
  const [feeds] = useState<ThreatIntelFeed[]>(isDemoTenant ? INITIAL_FEEDS : []);
  const [mentions] = useState<MentionDetail[]>(isDemoTenant ? INITIAL_MENTIONS : []);

  /* modals */
  const [selectedSource, setSelectedSource] = useState<DarkWebSource | null>(null);
  const [selectedCrawl, setSelectedCrawl] = useState<CrawlResult | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAddKeywordModal, setShowAddKeywordModal] = useState(false);
  const [newKeyword, setNewKeyword] = useState('');
  const [newKeywordCategory, setNewKeywordCategory] = useState<KeywordAlert['category']>('custom');

  /* ---------- derived stats ---------- */
  const activeCount = sources.filter(s => s.status === 'monitoring').length;
  const totalMentions = sources.reduce((sum, s) => sum + s.mentions, 0);
  const criticalAlerts = sources.filter(s => s.risk === 'critical').length
    + keywords.filter(k => k.category === 'high_risk' && k.enabled).length;
  const totalPages = sources.reduce((sum, s) => sum + s.pagesIndexed, 0);
  const activeSources = sources.filter(s => s.status === 'monitoring');
  const avgHealth = activeSources.length > 0
    ? Math.round(activeSources.reduce((sum, s) => sum + s.healthScore, 0) / activeSources.length)
    : 0;

  /* ---------- handlers ---------- */
  const handlePause = (id: string) => {
    setSources(prev => prev.map(s => s.id === id ? { ...s, status: 'paused' as const } : s));
    addToast({ severity: 'info', title: 'Crawler Paused', message: 'Monitoring paused for source' });
  };

  const handleResume = (id: string) => {
    setSources(prev => prev.map(s => s.id === id ? { ...s, status: 'monitoring' as const } : s));
    addToast({ severity: 'success', title: 'Crawler Resumed', message: 'Monitoring resumed for source' });
  };

  const handleForceScan = (id: string) => {
    setSources(prev => prev.map(s => s.id === id ? { ...s, lastScan: 'just now' } : s));
    addToast({ severity: 'info', title: 'Force Scan', message: 'Scan initiated for source' });
  };

  const handleToggleKeyword = (id: string) => {
    setKeywords(prev => prev.map(k => k.id === id ? { ...k, enabled: !k.enabled } : k));
  };

  const handleDeleteKeyword = (id: string) => {
    setKeywords(prev => prev.filter(k => k.id !== id));
    addToast({ severity: 'info', title: 'Keyword Deleted', message: 'Keyword alert has been removed' });
  };

  const handleAddKeyword = () => {
    if (!newKeyword.trim()) return;
    const kw: KeywordAlert = {
      id: `kw-${Date.now()}`,
      keyword: newKeyword.trim().toLowerCase(),
      category: newKeywordCategory,
      matchCount: 0,
      lastMatch: '--',
      enabled: true,
    };
    setKeywords(prev => [...prev, kw]);
    setNewKeyword('');
    setNewKeywordCategory('custom');
    setShowAddKeywordModal(false);
    addToast({ severity: 'success', title: 'Keyword Added', message: `Alert keyword "${kw.keyword}" has been configured` });
  };

  const handleSyncFeed = (name: string) => {
    addToast({ severity: 'info', title: 'Sync Started', message: `Syncing feed: ${name}` });
  };

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */

  return (
    <div className="space-y-6">
      {/* ---- Header Row ---- */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-100">Dark Web Monitor</h1>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-slate-400">Tor Connected</span>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-sm font-medium text-white transition-colors"
          >
            + Add Source
          </button>
          {criticalAlerts > 0 && (
            <span className="px-2.5 py-0.5 rounded-full bg-red-500/20 text-red-400 text-xs font-medium">
              {criticalAlerts} critical
            </span>
          )}
        </div>
      </div>

      {/* ---- Stat Cards ---- */}
      <div className="grid grid-cols-3 xl:grid-cols-6 gap-4">
        {[
          { label: 'Active Crawlers',   value: `${activeCount}/${sources.length}`, indicator: 'emerald' },
          { label: 'Sources Monitored', value: String(sources.length),             indicator: null },
          { label: 'Mentions (24h)',    value: String(totalMentions),              indicator: null },
          { label: 'Critical Alerts',   value: String(criticalAlerts),             indicator: 'red' },
          { label: 'Pages Indexed',     value: formatNumber(totalPages),           indicator: null },
          { label: 'Network Health',    value: `${avgHealth}%`,                    indicator: avgHealth > 80 ? 'emerald' : avgHealth > 50 ? 'amber' : 'red' },
        ].map(s => (
          <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center gap-2">
              {s.indicator && (
                <span className={`w-1.5 h-1.5 rounded-full ${
                  s.indicator === 'emerald' ? 'bg-emerald-400' :
                  s.indicator === 'red'     ? 'bg-red-400' :
                  'bg-amber-400'
                }`} />
              )}
              <p className="text-xs text-slate-500">{s.label}</p>
            </div>
            <p className="text-2xl font-bold text-slate-100 mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* ---- Tab Bar ---- */}
      <div className="flex gap-1 border-b border-slate-700/50 overflow-x-auto">
        {TAB_DEFS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
              activeTab === tab.id
                ? 'text-violet-400 border-violet-500'
                : 'text-slate-400 border-transparent hover:text-slate-300 hover:border-slate-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ---- Tab Content ---- */}
      <div>
        {activeTab === 'sources' && (
          <SourcesTab
            sources={sources}
            onPause={handlePause}
            onResume={handleResume}
            onForceScan={handleForceScan}
            onSelect={setSelectedSource}
          />
        )}
        {activeTab === 'crawl_results' && (
          <CrawlResultsTab results={crawlResults} onSelect={setSelectedCrawl} />
        )}
        {activeTab === 'keywords' && (
          <KeywordsTab
            keywords={keywords}
            onToggle={handleToggleKeyword}
            onDelete={handleDeleteKeyword}
            onAdd={() => setShowAddKeywordModal(true)}
          />
        )}
        {activeTab === 'threat_intel' && (
          <ThreatIntelTab feeds={feeds} onSync={handleSyncFeed} />
        )}
        {activeTab === 'mentions' && (
          <MentionsTab mentions={mentions} />
        )}
      </div>

      {/* ================================================================ */}
      {/*  MODALS                                                          */}
      {/* ================================================================ */}

      {/* Source Detail Modal */}
      <Modal isOpen={!!selectedSource} onClose={() => setSelectedSource(null)} title={selectedSource?.name ?? 'Source Details'} size="lg">
        {selectedSource && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-slate-500">Type:</span> <span className="text-slate-300 ml-2 capitalize">{selectedSource.type.replace('_', ' ')}</span></div>
              <div><span className="text-slate-500">Status:</span> <span className={`ml-2 capitalize ${statusColor[selectedSource.status]}`}>{selectedSource.status}</span></div>
              <div><span className="text-slate-500">Last Scan:</span> <span className="text-slate-300 ml-2">{selectedSource.lastScan}</span></div>
              <div><span className="text-slate-500">Total Mentions:</span> <span className="text-slate-300 ml-2">{selectedSource.mentions}</span></div>
              <div><span className="text-slate-500">Risk Level:</span> <span className={`ml-2 font-semibold uppercase text-xs ${riskColor[selectedSource.risk]}`}>{selectedSource.risk}</span></div>
              <div><span className="text-slate-500">URL:</span> <span className="text-slate-400 ml-2 font-mono text-xs">{selectedSource.url}</span></div>
              <div><span className="text-slate-500">Crawl Depth:</span> <span className="text-slate-300 ml-2">{selectedSource.crawlDepth}</span></div>
              <div><span className="text-slate-500">Pages Indexed:</span> <span className="text-slate-300 ml-2">{formatNumber(selectedSource.pagesIndexed)}</span></div>
              <div><span className="text-slate-500">Active Alerts:</span> <span className="text-slate-300 ml-2">{selectedSource.activeAlerts}</span></div>
              <div>
                <span className="text-slate-500">Health Score:</span>
                <span className={`ml-2 font-semibold ${
                  selectedSource.healthScore > 80 ? 'text-emerald-400' :
                  selectedSource.healthScore > 50 ? 'text-amber-400' :
                  'text-red-400'
                }`}>
                  {selectedSource.healthScore}%
                </span>
              </div>
            </div>
            {/* Health bar */}
            <div>
              <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                <span>Health</span>
                <span>{selectedSource.healthScore}%</span>
              </div>
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    selectedSource.healthScore > 80 ? 'bg-emerald-500' :
                    selectedSource.healthScore > 50 ? 'bg-amber-500' :
                    'bg-red-500'
                  }`}
                  style={{ width: `${selectedSource.healthScore}%` }}
                />
              </div>
            </div>
            <div className="pt-4 border-t border-slate-800">
              <h4 className="text-sm font-semibold text-slate-300 mb-2">Recent Mentions</h4>
              <div className="space-y-2">
                {['Keyword match in thread #4821', 'Alias correlation detected', 'New vendor listing matches POI'].map((m, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-slate-400 bg-slate-800/50 rounded px-3 py-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    {m}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-4 border-t border-slate-800">
              {selectedSource.status === 'monitoring' ? (
                <button
                  onClick={() => { handlePause(selectedSource.id); setSelectedSource(null); }}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm transition-colors"
                >
                  Pause Monitoring
                </button>
              ) : (
                <button
                  onClick={() => { handleResume(selectedSource.id); setSelectedSource(null); }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm transition-colors"
                >
                  Resume Monitoring
                </button>
              )}
              <button
                onClick={() => { handleForceScan(selectedSource.id); setSelectedSource(null); }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm transition-colors"
              >
                Force Scan
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Add Source Modal */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Add Monitoring Source" size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-300 mb-1">Source Name</label>
            <input type="text" placeholder="e.g., Forum Epsilon" className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500" />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">Source Type</label>
            <select className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-purple-500">
              <option value="forum">Forum</option>
              <option value="marketplace">Marketplace</option>
              <option value="paste">Paste Site</option>
              <option value="onion_site">Onion Site</option>
              <option value="image_board">Image Board</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">.onion URL</label>
            <input type="text" placeholder="http://example.onion" className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500 font-mono" />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">Crawl Depth</label>
            <select className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-purple-500">
              <option value="1">1 (Shallow)</option>
              <option value="2">2 (Standard)</option>
              <option value="3">3 (Deep)</option>
              <option value="4">4 (Maximum)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">Keywords (comma-separated)</label>
            <input type="text" placeholder="keyword1, keyword2" className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500" />
          </div>
          <div className="flex gap-2 pt-4 border-t border-slate-800">
            <button
              onClick={() => {
                setShowAddModal(false);
                addToast({ severity: 'success', title: 'Source Added', message: 'New monitoring source has been configured' });
              }}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Add Source
            </button>
            <button onClick={() => setShowAddModal(false)} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm transition-colors">
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* Add Keyword Modal */}
      <Modal isOpen={showAddKeywordModal} onClose={() => setShowAddKeywordModal(false)} title="Add Keyword Alert" size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-300 mb-1">Keyword</label>
            <input
              type="text"
              value={newKeyword}
              onChange={e => setNewKeyword(e.target.value)}
              placeholder="Enter keyword or phrase"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">Category</label>
            <select
              value={newKeywordCategory}
              onChange={e => setNewKeywordCategory(e.target.value as KeywordAlert['category'])}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-purple-500"
            >
              <option value="high_risk">High Risk</option>
              <option value="marketplace">Marketplace</option>
              <option value="financial">Financial</option>
              <option value="infrastructure">Infrastructure</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          <div className="flex gap-2 pt-4 border-t border-slate-800">
            <button
              onClick={handleAddKeyword}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Add
            </button>
            <button onClick={() => setShowAddKeywordModal(false)} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm transition-colors">
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* Crawl Result Detail Modal */}
      <Modal isOpen={!!selectedCrawl} onClose={() => setSelectedCrawl(null)} title="Crawl Result Details" size="lg">
        {selectedCrawl && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-slate-500">Source:</span> <span className="text-slate-300 ml-2">{selectedCrawl.sourceName}</span></div>
              <div><span className="text-slate-500">Timestamp:</span> <span className="text-slate-300 ml-2">{selectedCrawl.timestamp}</span></div>
              <div><span className="text-slate-500">Category:</span> <span className="text-slate-300 ml-2 capitalize">{selectedCrawl.category.replace('_', ' ')}</span></div>
              <div>
                <span className="text-slate-500">Risk Score:</span>
                <span className={`ml-2 font-semibold ${
                  selectedCrawl.riskScore > 0.7 ? 'text-red-400' :
                  selectedCrawl.riskScore > 0.4 ? 'text-amber-400' :
                  'text-emerald-400'
                }`}>
                  {(selectedCrawl.riskScore * 100).toFixed(0)}%
                </span>
              </div>
              <div className="col-span-2"><span className="text-slate-500">Page Title:</span> <span className="text-slate-300 ml-2">{selectedCrawl.pageTitle}</span></div>
              <div className="col-span-2"><span className="text-slate-500">URL:</span> <span className="text-slate-400 ml-2 font-mono text-xs">{selectedCrawl.url}</span></div>
              <div className="col-span-2"><span className="text-slate-500">Content Hash:</span> <span className="text-slate-400 ml-2 font-mono text-xs">{selectedCrawl.contentHash}</span></div>
              <div><span className="text-slate-500">Outgoing .onion Links:</span> <span className="text-slate-300 ml-2">{selectedCrawl.outgoingOnionLinks}</span></div>
            </div>
            {/* Risk bar */}
            <div>
              <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                <span>Risk Score</span>
                <span>{(selectedCrawl.riskScore * 100).toFixed(0)}%</span>
              </div>
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    selectedCrawl.riskScore > 0.7 ? 'bg-red-500' :
                    selectedCrawl.riskScore > 0.4 ? 'bg-amber-500' :
                    'bg-emerald-500'
                  }`}
                  style={{ width: `${selectedCrawl.riskScore * 100}%` }}
                />
              </div>
            </div>
            {/* Keywords */}
            <div className="pt-4 border-t border-slate-800">
              <h4 className="text-sm font-semibold text-slate-300 mb-2">Keywords Found</h4>
              <div className="flex flex-wrap gap-2">
                {selectedCrawl.keywordsFound.map(kw => (
                  <span key={kw} className="px-2 py-1 bg-slate-800 text-slate-300 rounded text-xs font-mono">{kw}</span>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ================================================================== */
/*  5. SUB-COMPONENTS (TAB PANELS)                                     */
/* ================================================================== */

/* ---- Sources Tab ---- */
function SourcesTab({
  sources,
  onPause,
  onResume,
  onForceScan,
  onSelect,
}: {
  sources: DarkWebSource[];
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onForceScan: (id: string) => void;
  onSelect: (s: DarkWebSource) => void;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-800">
        <h2 className="text-sm font-semibold text-slate-200">Monitored Sources</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-slate-500 text-xs uppercase">
              <th className="text-left px-4 py-3">Source</th>
              <th className="text-left px-4 py-3">Type</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Health</th>
              <th className="text-left px-4 py-3">Last Scan</th>
              <th className="text-right px-4 py-3">Mentions</th>
              <th className="text-right px-4 py-3">Alerts</th>
              <th className="text-left px-4 py-3">Risk</th>
              <th className="text-right px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {sources.length === 0 && (
              <tr>
                <td colSpan={9}>
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <svg className="w-16 h-16 text-slate-700 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                    </svg>
                    <h3 className="text-lg font-semibold text-slate-400 mb-2">Empty Workspace</h3>
                    <p className="text-sm text-slate-500 max-w-md">This tenant has no data yet. Start creating cases and investigations to populate this view.</p>
                  </div>
                </td>
              </tr>
            )}
            {sources.map(s => (
              <tr key={s.id} className="hover:bg-slate-800/50 transition-colors cursor-pointer" onClick={() => onSelect(s)}>
                <td className="px-4 py-3 text-slate-200 font-medium">{s.name}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${typeColor[s.type]}`}>
                    {s.type.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs capitalize ${statusColor[s.status]}`}>{s.status}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          s.healthScore > 80 ? 'bg-emerald-500' :
                          s.healthScore > 50 ? 'bg-amber-500' :
                          'bg-red-500'
                        }`}
                        style={{ width: `${s.healthScore}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-500">{s.healthScore}%</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-500">{s.lastScan}</td>
                <td className="px-4 py-3 text-right text-slate-400">{s.mentions}</td>
                <td className="px-4 py-3 text-right text-slate-400">{s.activeAlerts}</td>
                <td className={`px-4 py-3 text-xs font-semibold uppercase ${riskColor[s.risk]}`}>{s.risk}</td>
                <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-2">
                    {s.status === 'monitoring' ? (
                      <button
                        onClick={() => onPause(s.id)}
                        className="text-xs text-amber-400 hover:text-amber-300 px-2 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20 transition-colors"
                      >
                        Pause
                      </button>
                    ) : s.status === 'paused' ? (
                      <button
                        onClick={() => onResume(s.id)}
                        className="text-xs text-emerald-400 hover:text-emerald-300 px-2 py-1 rounded bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors"
                      >
                        Resume
                      </button>
                    ) : null}
                    <button
                      onClick={() => onForceScan(s.id)}
                      className="text-xs text-blue-400 hover:text-blue-300 px-2 py-1 rounded bg-blue-500/10 hover:bg-blue-500/20 transition-colors"
                    >
                      Force Scan
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---- Crawl Results Tab ---- */
function CrawlResultsTab({
  results,
  onSelect,
}: {
  results: CrawlResult[];
  onSelect: (r: CrawlResult) => void;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-200">Crawl Results Timeline</h2>
        <span className="text-xs text-slate-500">{results.length} results</span>
      </div>
      <div className="max-h-[600px] overflow-y-auto divide-y divide-slate-800">
        {results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <svg className="w-16 h-16 text-slate-700 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <h3 className="text-lg font-semibold text-slate-400 mb-2">Empty Workspace</h3>
            <p className="text-sm text-slate-500 max-w-md">This tenant has no data yet. Start creating cases and investigations to populate this view.</p>
          </div>
        )}
        {results.map(r => (
          <div
            key={r.id}
            className="px-4 py-3 hover:bg-slate-800/50 transition-colors cursor-pointer"
            onClick={() => onSelect(r)}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-slate-500">{r.timestamp}</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${typeColor[
                    r.sourceName.toLowerCase().includes('forum') ? 'forum' :
                    r.sourceName.toLowerCase().includes('market') ? 'marketplace' :
                    r.sourceName.toLowerCase().includes('paste') ? 'paste' :
                    r.sourceName.toLowerCase().includes('image') ? 'image_board' :
                    'onion_site'
                  ]}`}>
                    {r.sourceName}
                  </span>
                </div>
                <p className="text-sm text-slate-200 mb-1">{truncate(r.pageTitle, 60)}</p>
                <p className="text-xs text-slate-500 font-mono">{r.contentHash}</p>
                <div className="flex items-center gap-2 mt-2">
                  {r.keywordsFound.slice(0, 3).map(kw => (
                    <span key={kw} className="px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded text-xs">{kw}</span>
                  ))}
                  {r.keywordsFound.length > 3 && (
                    <span className="text-xs text-slate-500">+{r.keywordsFound.length - 3} more</span>
                  )}
                  {r.outgoingOnionLinks > 0 && (
                    <span className="text-xs text-slate-500 ml-2">
                      {r.outgoingOnionLinks} onion link{r.outgoingOnionLinks !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex-shrink-0 w-32">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-slate-500">Risk</span>
                  <span className={
                    r.riskScore > 0.7 ? 'text-red-400' :
                    r.riskScore > 0.4 ? 'text-amber-400' :
                    'text-emerald-400'
                  }>
                    {(r.riskScore * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      r.riskScore > 0.7 ? 'bg-red-500' :
                      r.riskScore > 0.4 ? 'bg-amber-500' :
                      'bg-emerald-500'
                    }`}
                    style={{ width: `${r.riskScore * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---- Keywords Tab ---- */
function KeywordsTab({
  keywords,
  onToggle,
  onDelete,
  onAdd,
}: {
  keywords: KeywordAlert[];
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-200">Keyword Alerts</h2>
        <button
          onClick={onAdd}
          className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 rounded-lg text-xs font-medium text-white transition-colors"
        >
          + Add Keyword
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-slate-500 text-xs uppercase">
              <th className="text-left px-4 py-3">Keyword</th>
              <th className="text-left px-4 py-3">Category</th>
              <th className="text-right px-4 py-3">Matches</th>
              <th className="text-left px-4 py-3">Last Match</th>
              <th className="text-center px-4 py-3">Status</th>
              <th className="text-right px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {keywords.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <svg className="w-16 h-16 text-slate-700 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                    </svg>
                    <h3 className="text-lg font-semibold text-slate-400 mb-2">Empty Workspace</h3>
                    <p className="text-sm text-slate-500 max-w-md">This tenant has no data yet. Start creating cases and investigations to populate this view.</p>
                  </div>
                </td>
              </tr>
            )}
            {keywords.map(k => (
              <tr key={k.id} className="hover:bg-slate-800/50 transition-colors">
                <td className="px-4 py-3 text-slate-200 font-mono text-xs">{k.keyword}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${categoryBadgeColor[k.category]}`}>
                    {k.category.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-slate-400">{formatNumber(k.matchCount)}</td>
                <td className="px-4 py-3 text-slate-500">{k.lastMatch}</td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => onToggle(k.id)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      k.enabled ? 'bg-emerald-600' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                        k.enabled ? 'translate-x-4.5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => onDelete(k.id)}
                    className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded bg-red-500/10 hover:bg-red-500/20 transition-colors"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---- Threat Intel Tab ---- */
function ThreatIntelTab({
  feeds,
  onSync,
}: {
  feeds: ThreatIntelFeed[];
  onSync: (name: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {feeds.length === 0 && (
        <div className="col-span-full flex flex-col items-center justify-center py-20 text-center">
          <svg className="w-16 h-16 text-slate-700 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
          <h3 className="text-lg font-semibold text-slate-400 mb-2">Empty Workspace</h3>
          <p className="text-sm text-slate-500 max-w-md">This tenant has no data yet. Start creating cases and investigations to populate this view.</p>
        </div>
      )}
      {feeds.map(f => (
        <div key={f.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-200">{f.name}</h3>
              <p className="text-xs text-slate-500 mt-0.5">{f.provider}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${feedStatusColor[f.status]}`} />
              <span className={`text-xs capitalize ${
                f.status === 'active' ? 'text-emerald-400' :
                f.status === 'stale'  ? 'text-amber-400' :
                'text-red-400'
              }`}>
                {f.status}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm mb-4">
            <div>
              <span className="text-xs text-slate-500">Indicators</span>
              <p className="text-slate-200 font-semibold">{formatNumber(f.indicators)}</p>
            </div>
            <div>
              <span className="text-xs text-slate-500">Last Update</span>
              <p className="text-slate-400">{f.lastUpdate}</p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${feedTypeBadge[f.type]}`}>
              {f.type.replace('_', ' ')}
            </span>
            <button
              onClick={() => onSync(f.name)}
              className="text-xs text-blue-400 hover:text-blue-300 px-3 py-1.5 rounded bg-blue-500/10 hover:bg-blue-500/20 transition-colors font-medium"
            >
              Sync Now
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---- Mentions Tab ---- */
function MentionsTab({ mentions }: { mentions: MentionDetail[] }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-200">Mention Timeline</h2>
        <span className="text-xs text-slate-500">{mentions.length} mentions</span>
      </div>
      <div className="max-h-[600px] overflow-y-auto divide-y divide-slate-800">
        {mentions.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <svg className="w-16 h-16 text-slate-700 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <h3 className="text-lg font-semibold text-slate-400 mb-2">Empty Workspace</h3>
            <p className="text-sm text-slate-500 max-w-md">This tenant has no data yet. Start creating cases and investigations to populate this view.</p>
          </div>
        )}
        {mentions.map(m => (
          <div key={m.id} className="px-4 py-4 hover:bg-slate-800/30 transition-colors">
            <div className="flex items-start gap-3">
              {/* Risk dot */}
              <div className="flex-shrink-0 mt-1.5">
                <span className={`w-2.5 h-2.5 rounded-full block ${mentionRiskDotColor[m.riskLevel]}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${mentionTypeBadge[m.type]}`}>
                    {m.type.replace('_', ' ')}
                  </span>
                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium uppercase ${riskBgColor[m.riskLevel]}`}>
                    {m.riskLevel}
                  </span>
                  <span className="text-xs text-slate-500">{m.timestamp}</span>
                  {m.linkedCaseId && (
                    <span className="px-2 py-0.5 rounded bg-violet-500/10 text-violet-400 text-xs font-medium">
                      {m.linkedCaseId}
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-200 mb-1">{m.summary}</p>
                <p className="text-xs text-slate-500 mb-2">
                  Source: <span className="text-slate-400">{m.sourceName}</span>
                </p>
                {/* Context snippet */}
                <div className="bg-slate-800/50 rounded px-3 py-2">
                  <p className="text-xs text-slate-400 italic leading-relaxed">{m.context}</p>
                </div>
                {/* Action */}
                <div className="mt-2">
                  <button className="text-xs text-purple-400 hover:text-purple-300 px-3 py-1.5 rounded bg-purple-500/10 hover:bg-purple-500/20 transition-colors font-medium">
                    Investigate
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Mary Poppins Digital Intelligence Platform
 * OSINT Investigation Page — Open-Source Intelligence Workspace
 *
 * Complete investigation UI for:
 * - Multi-type search (email, username, phone, name, domain, IP, social profile)
 * - Breach detection and exposure analysis
 * - Username enumeration across 300+ platforms
 * - Domain/DNS intelligence (WHOIS, MX, NS, TXT, subdomains)
 * - Phone OSINT (carrier, region, type, linked profiles)
 * - Source-tier categorisation (surface / deep / dark)
 * - Module health monitoring and rate-limit tracking
 * - Case integration and graph workspace linking
 *
 * Built with:
 *   Cytoscape.js — Entity relationship graph
 *   Apache ECharts — Breach timeline, platform heatmap, source distribution
 *   React Query — Server state management
 *   Tailwind CSS — Dark theme (navy #0F172A)
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FC,
  type FormEvent,
} from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useIsDemoTenant } from '../App';
import ReactECharts from 'echarts-for-react';
import CytoscapeComponent from 'react-cytoscapejs';
import type {
  Core,
  ElementDefinition,
  Stylesheet,
  LayoutOptions,
} from 'cytoscape';

/* ================================================================== */
/*  1. TYPE DEFINITIONS                                                */
/* ================================================================== */

export type OsintQueryType =
  | 'email'
  | 'username'
  | 'phone'
  | 'name'
  | 'domain'
  | 'ip_address'
  | 'social_profile';

export type SourceTier = 'surface' | 'deep' | 'dark';

export type FindingType =
  | 'profile_found'
  | 'breach_detected'
  | 'domain_info'
  | 'email_domain_info'
  | 'public_profile'
  | 'username_found'
  | 'phone_info'
  | 'dns_records'
  | 'whois_info'
  | 'social_profile'
  | 'ip_geolocation'
  | 'paste_detected'
  | 'dark_web_mention'
  | 'name_match';

export type ConfidenceTier = 'high' | 'medium' | 'low';

export interface OsintFinding {
  id: string;
  moduleName: string;
  sourceTier: SourceTier;
  findingType: FindingType;
  data: Record<string, unknown>;
  sourceUrl: string | null;
  confidence: number;
  timestamp: string;
}

export interface OsintQueryResult {
  queryId: string;
  queryType: OsintQueryType;
  queryValue: string;
  findings: OsintFinding[];
  totalModulesQueried: number;
  modulesSucceeded: number;
  modulesFailed: number;
  elapsedMs: number;
  queriedAt: string;
}

export interface OsintModuleStatus {
  name: string;
  displayName: string;
  enabled: boolean;
  rateLimit: number;
  requestsRemaining: number;
  lastError: string | null;
  healthy: boolean;
  supportedQueryTypes: OsintQueryType[];
  sourceTier: SourceTier;
}

export interface BreachRecord {
  name: string;
  domain: string;
  breachDate: string;
  addedDate: string;
  pwnCount: number;
  dataClasses: string[];
  isVerified: boolean;
  isSensitive: boolean;
}

export interface PlatformMatch {
  platform: string;
  username: string;
  profileUrl: string;
  category: string;
  exists: boolean;
}

export interface DnsRecordSet {
  domain: string;
  a: string[];
  aaaa: string[];
  mx: string[];
  ns: string[];
  txt: string[];
  cname: string[];
}

export interface WhoisData {
  domain: string;
  registrar: string;
  createdDate: string;
  expiresDate: string;
  updatedDate: string;
  nameServers: string[];
  status: string[];
  dnssec: boolean;
}

export interface PhoneInfo {
  e164: string;
  countryCode: number;
  nationalNumber: string;
  numberType: string;
  carrier: string;
  region: string;
  isValid: boolean;
}

export interface SearchHistoryEntry {
  id: string;
  queryType: OsintQueryType;
  queryValue: string;
  findingCount: number;
  timestamp: string;
}

interface OsintAgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  suggestedQueries?: SuggestedQuery[];
}

interface SuggestedQuery {
  queryType: OsintQueryType;
  queryValue: string;
  rationale: string;
}

/* ================================================================== */
/*  2. CONSTANTS                                                       */
/* ================================================================== */

const QUERY_TYPE_CONFIG: Record<
  OsintQueryType,
  { label: string; icon: string; placeholder: string; color: string }
> = {
  email: {
    label: 'Email',
    icon: '📧',
    placeholder: 'user@example.com',
    color: '#8B5CF6',
  },
  username: {
    label: 'Username',
    icon: '👤',
    placeholder: 'john_doe_123',
    color: '#14B8A6',
  },
  phone: {
    label: 'Phone',
    icon: '📱',
    placeholder: '+1 555-0123',
    color: '#F59E0B',
  },
  name: {
    label: 'Name',
    icon: '🔤',
    placeholder: 'John Doe',
    color: '#3B82F6',
  },
  domain: {
    label: 'Domain',
    icon: '🌐',
    placeholder: 'example.com',
    color: '#6D28D9',
  },
  ip_address: {
    label: 'IP Address',
    icon: '🖧',
    placeholder: '192.168.1.1',
    color: '#EF4444',
  },
  social_profile: {
    label: 'Social Profile',
    icon: '🔗',
    placeholder: 'https://twitter.com/user',
    color: '#EC4899',
  },
};

const SOURCE_TIER_CONFIG: Record<
  SourceTier,
  { label: string; color: string; bg: string }
> = {
  surface: { label: 'Surface Web', color: '#14B8A6', bg: 'bg-teal-500/10' },
  deep: { label: 'Deep Web', color: '#F59E0B', bg: 'bg-amber-500/10' },
  dark: { label: 'Dark Web', color: '#EF4444', bg: 'bg-red-500/10' },
};

const CONFIDENCE_THRESHOLDS: Record<ConfidenceTier, { min: number; color: string }> = {
  high: { min: 0.8, color: '#14B8A6' },
  medium: { min: 0.5, color: '#F59E0B' },
  low: { min: 0.0, color: '#EF4444' },
};

const PLATFORM_CATEGORIES: Record<string, string> = {
  GitHub: 'Development',
  GitLab: 'Development',
  'Stack Overflow': 'Development',
  'Twitter/X': 'Social Media',
  Instagram: 'Social Media',
  Facebook: 'Social Media',
  TikTok: 'Social Media',
  LinkedIn: 'Professional',
  Reddit: 'Forum',
  Telegram: 'Messaging',
  Discord: 'Messaging',
  Steam: 'Gaming',
  Twitch: 'Gaming',
  YouTube: 'Media',
  SoundCloud: 'Media',
  Keybase: 'Security',
  Pinterest: 'Social Media',
  Flickr: 'Media',
  Spotify: 'Media',
  'Hacker News': 'Development',
};

/* ================================================================== */
/*  3. MOCK API LAYER                                                  */
/* ================================================================== */

const randomId = () => Math.random().toString(36).slice(2, 14);
const randomDate = (start: Date, end: Date) =>
  new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime())).toISOString();
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const rand = (min: number, max: number) => Math.random() * (max - min) + min;
const randInt = (min: number, max: number) => Math.floor(rand(min, max));

function generateBreaches(email: string): BreachRecord[] {
  const breaches: BreachRecord[] = [];
  const names = [
    'LinkedIn', 'Adobe', 'Dropbox', 'MySpace', 'Canva', 'Zynga',
    'Dubsmash', 'MyFitnessPal', 'Exactis', 'Apollo', 'Verifications.io',
    'Collection #1', 'Tumblr', 'Imgur', 'ShareThis', 'Houzz',
  ];
  const count = randInt(0, 8);
  const used = new Set<string>();
  for (let i = 0; i < count; i++) {
    let name = pick(names);
    while (used.has(name)) name = pick(names);
    used.add(name);
    const dataClasses = [
      ...(Math.random() > 0.2 ? ['Email addresses'] : []),
      ...(Math.random() > 0.3 ? ['Passwords'] : []),
      ...(Math.random() > 0.5 ? ['Usernames'] : []),
      ...(Math.random() > 0.6 ? ['IP addresses'] : []),
      ...(Math.random() > 0.7 ? ['Phone numbers'] : []),
      ...(Math.random() > 0.8 ? ['Physical addresses'] : []),
      ...(Math.random() > 0.6 ? ['Names'] : []),
      ...(Math.random() > 0.85 ? ['Credit cards'] : []),
    ];
    breaches.push({
      name,
      domain: `${name.toLowerCase().replace(/[^a-z]/g, '')}.com`,
      breachDate: randomDate(new Date('2012-01-01'), new Date('2024-06-01')),
      addedDate: randomDate(new Date('2013-01-01'), new Date('2024-12-01')),
      pwnCount: randInt(100_000, 500_000_000),
      dataClasses,
      isVerified: Math.random() > 0.15,
      isSensitive: Math.random() > 0.85,
    });
  }
  return breaches.sort(
    (a, b) => new Date(b.breachDate).getTime() - new Date(a.breachDate).getTime(),
  );
}

function generatePlatformMatches(username: string): PlatformMatch[] {
  const platforms = Object.keys(PLATFORM_CATEGORIES);
  return platforms.map((platform) => ({
    platform,
    username,
    profileUrl: `https://${platform.toLowerCase().replace(/[^a-z]/g, '')}.com/${username}`,
    category: PLATFORM_CATEGORIES[platform] || 'Other',
    exists: Math.random() > 0.45,
  }));
}

function generateDnsRecords(domain: string): DnsRecordSet {
  return {
    domain,
    a: [`${randInt(1, 255)}.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(1, 254)}`],
    aaaa: Math.random() > 0.5 ? ['2606:4700::6810:84e5'] : [],
    mx: [
      `aspmx.l.google.com`,
      `alt1.aspmx.l.google.com`,
      `alt2.aspmx.l.google.com`,
    ].slice(0, randInt(1, 4)),
    ns: [`ns1.${domain}`, `ns2.${domain}`],
    txt: [
      `v=spf1 include:_spf.google.com ~all`,
      ...(Math.random() > 0.5 ? [`google-site-verification=${randomId()}`] : []),
      ...(Math.random() > 0.7 ? [`v=DMARC1; p=reject; rua=mailto:dmarc@${domain}`] : []),
    ],
    cname: [],
  };
}

function generateWhois(domain: string): WhoisData {
  const registrars = [
    'GoDaddy.com, LLC', 'Namecheap, Inc.', 'Google Domains', 'Cloudflare, Inc.',
    'Tucows Domains Inc.', 'Amazon Registrar, Inc.', 'MarkMonitor Inc.',
  ];
  return {
    domain,
    registrar: pick(registrars),
    createdDate: randomDate(new Date('2000-01-01'), new Date('2022-01-01')),
    expiresDate: randomDate(new Date('2025-01-01'), new Date('2030-01-01')),
    updatedDate: randomDate(new Date('2023-01-01'), new Date('2024-12-01')),
    nameServers: [`ns1.${domain}`, `ns2.${domain}`],
    status: ['clientTransferProhibited', ...(Math.random() > 0.5 ? ['clientDeleteProhibited'] : [])],
    dnssec: Math.random() > 0.6,
  };
}

function generatePhoneInfo(phone: string): PhoneInfo {
  const carriers = ['Verizon Wireless', 'AT&T Mobility', 'T-Mobile', 'Vodafone', 'Orange'];
  const regions = ['United States', 'United Kingdom', 'Germany', 'Canada', 'France'];
  const types = ['MOBILE', 'FIXED_LINE', 'VOIP', 'FIXED_LINE_OR_MOBILE'];
  return {
    e164: phone.replace(/[^+\d]/g, '') || '+15550123456',
    countryCode: pick([1, 44, 49, 33, 61]),
    nationalNumber: phone.replace(/[^0-9]/g, '').slice(-10),
    numberType: pick(types),
    carrier: pick(carriers),
    region: pick(regions),
    isValid: Math.random() > 0.1,
  };
}

function buildFindings(queryType: OsintQueryType, queryValue: string): OsintFinding[] {
  const findings: OsintFinding[] = [];
  const now = new Date();

  switch (queryType) {
    case 'email': {
      const breaches = generateBreaches(queryValue);
      if (breaches.length > 0) {
        findings.push({
          id: randomId(),
          moduleName: 'email_lookup',
          sourceTier: 'surface',
          findingType: 'breach_detected',
          data: { breaches, email: queryValue, totalBreaches: breaches.length },
          sourceUrl: null,
          confidence: 0.95,
          timestamp: now.toISOString(),
        });
      }
      const domain = queryValue.split('@')[1] || 'example.com';
      findings.push({
        id: randomId(),
        moduleName: 'email_lookup',
        sourceTier: 'surface',
        findingType: 'email_domain_info',
        data: {
          domain,
          mxRecords: [`aspmx.l.google.com`, `alt1.aspmx.l.google.com`],
          email: queryValue,
          disposable: Math.random() > 0.85,
          freeProvider: ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'].includes(domain),
        },
        sourceUrl: null,
        confidence: 0.9,
        timestamp: now.toISOString(),
      });
      if (Math.random() > 0.3) {
        findings.push({
          id: randomId(),
          moduleName: 'email_lookup',
          sourceTier: 'surface',
          findingType: 'public_profile',
          data: {
            service: 'gravatar',
            displayName: queryValue.split('@')[0].replace(/[._]/g, ' '),
            profileUrl: `https://gravatar.com/${randomId()}`,
            photoHash: randomId(),
          },
          sourceUrl: `https://gravatar.com/${randomId()}`,
          confidence: 0.85,
          timestamp: now.toISOString(),
        });
      }
      // Paste sites
      if (Math.random() > 0.5) {
        findings.push({
          id: randomId(),
          moduleName: 'paste_monitor',
          sourceTier: 'deep',
          findingType: 'paste_detected',
          data: {
            source: pick(['Pastebin', 'Ghostbin', 'GitHub Gist', 'dpaste']),
            title: `dump_${randomId()}.txt`,
            date: randomDate(new Date('2019-01-01'), now),
            emailCount: randInt(100, 50000),
          },
          sourceUrl: null,
          confidence: 0.7,
          timestamp: now.toISOString(),
        });
      }
      // Dark web
      if (Math.random() > 0.65) {
        findings.push({
          id: randomId(),
          moduleName: 'darkweb_monitor',
          sourceTier: 'dark',
          findingType: 'dark_web_mention',
          data: {
            marketplace: pick(['Genesis Market', 'Russian Market', '2easy Shop']),
            listing: 'Combo list credentials',
            priceUsd: rand(1, 50).toFixed(2),
            detectedDate: randomDate(new Date('2023-01-01'), now),
          },
          sourceUrl: null,
          confidence: 0.6,
          timestamp: now.toISOString(),
        });
      }
      break;
    }

    case 'username': {
      const platforms = generatePlatformMatches(queryValue);
      const matched = platforms.filter((p) => p.exists);
      for (const p of matched) {
        findings.push({
          id: randomId(),
          moduleName: 'username_search',
          sourceTier: 'surface',
          findingType: 'username_found',
          data: {
            platform: p.platform,
            username: p.username,
            profileUrl: p.profileUrl,
            category: p.category,
          },
          sourceUrl: p.profileUrl,
          confidence: 0.8,
          timestamp: now.toISOString(),
        });
      }
      // Paste mentions
      if (Math.random() > 0.6) {
        findings.push({
          id: randomId(),
          moduleName: 'paste_monitor',
          sourceTier: 'deep',
          findingType: 'paste_detected',
          data: {
            source: 'Pastebin',
            title: `combo_${randomId()}`,
            date: randomDate(new Date('2020-01-01'), now),
            context: `...${queryValue}:p@$$w0rd123...`,
          },
          sourceUrl: null,
          confidence: 0.65,
          timestamp: now.toISOString(),
        });
      }
      break;
    }

    case 'phone': {
      const info = generatePhoneInfo(queryValue);
      findings.push({
        id: randomId(),
        moduleName: 'phone_lookup',
        sourceTier: 'surface',
        findingType: 'phone_info',
        data: info,
        sourceUrl: null,
        confidence: 0.9,
        timestamp: now.toISOString(),
      });
      // Social lookup
      if (Math.random() > 0.4) {
        findings.push({
          id: randomId(),
          moduleName: 'phone_lookup',
          sourceTier: 'surface',
          findingType: 'social_profile',
          data: {
            service: pick(['WhatsApp', 'Telegram', 'Viber', 'Signal']),
            registered: true,
            lastSeen: randomDate(new Date('2024-06-01'), now),
          },
          sourceUrl: null,
          confidence: 0.75,
          timestamp: now.toISOString(),
        });
      }
      // CallerID
      if (Math.random() > 0.5) {
        findings.push({
          id: randomId(),
          moduleName: 'phone_lookup',
          sourceTier: 'surface',
          findingType: 'profile_found',
          data: {
            source: 'CallerID',
            name: `${pick(['John', 'Jane', 'Alex', 'Sam'])} ${pick(['Doe', 'Smith', 'Johnson', 'Williams'])}`,
            address: `${randInt(100, 9999)} ${pick(['Oak', 'Elm', 'Main', 'Cedar'])} St`,
          },
          sourceUrl: null,
          confidence: 0.65,
          timestamp: now.toISOString(),
        });
      }
      break;
    }

    case 'domain': {
      const dns = generateDnsRecords(queryValue);
      findings.push({
        id: randomId(),
        moduleName: 'domain_intel',
        sourceTier: 'surface',
        findingType: 'dns_records',
        data: dns,
        sourceUrl: null,
        confidence: 0.95,
        timestamp: now.toISOString(),
      });
      const whois = generateWhois(queryValue);
      findings.push({
        id: randomId(),
        moduleName: 'domain_intel',
        sourceTier: 'surface',
        findingType: 'whois_info',
        data: whois,
        sourceUrl: null,
        confidence: 0.9,
        timestamp: now.toISOString(),
      });
      // Subdomains
      findings.push({
        id: randomId(),
        moduleName: 'domain_intel',
        sourceTier: 'surface',
        findingType: 'domain_info',
        data: {
          subdomains: [
            `www.${queryValue}`, `mail.${queryValue}`, `api.${queryValue}`,
            `dev.${queryValue}`, `staging.${queryValue}`, `cdn.${queryValue}`,
          ].filter(() => Math.random() > 0.3),
          sslIssuer: pick(['Let\'s Encrypt', 'DigiCert', 'Cloudflare', 'Comodo']),
          sslExpiry: randomDate(new Date('2025-06-01'), new Date('2026-06-01')),
          technologies: ['Cloudflare', 'Nginx', 'React', 'Node.js'].filter(() => Math.random() > 0.4),
        },
        sourceUrl: null,
        confidence: 0.85,
        timestamp: now.toISOString(),
      });
      break;
    }

    case 'ip_address': {
      findings.push({
        id: randomId(),
        moduleName: 'ip_intel',
        sourceTier: 'surface',
        findingType: 'ip_geolocation',
        data: {
          ip: queryValue,
          country: pick(['US', 'GB', 'DE', 'NL', 'RO', 'RU', 'CN']),
          city: pick(['New York', 'London', 'Berlin', 'Amsterdam', 'Bucharest']),
          lat: rand(-60, 60),
          lon: rand(-180, 180),
          isp: pick(['Amazon AWS', 'Google Cloud', 'OVH', 'Hetzner', 'Digital Ocean']),
          asn: `AS${randInt(1000, 65000)}`,
          org: pick(['Amazon.com, Inc.', 'Google LLC', 'OVH SAS', 'Hetzner Online']),
          isTor: Math.random() > 0.85,
          isVpn: Math.random() > 0.7,
          isProxy: Math.random() > 0.8,
          isDatacenter: Math.random() > 0.4,
        },
        sourceUrl: null,
        confidence: 0.92,
        timestamp: now.toISOString(),
      });
      // Abuse reports
      if (Math.random() > 0.5) {
        findings.push({
          id: randomId(),
          moduleName: 'ip_intel',
          sourceTier: 'surface',
          findingType: 'profile_found',
          data: {
            source: 'AbuseIPDB',
            abuseScore: randInt(0, 100),
            totalReports: randInt(0, 500),
            lastReported: randomDate(new Date('2024-01-01'), now),
            categories: ['Brute-Force', 'Port Scan', 'Web Spam'].filter(() => Math.random() > 0.4),
          },
          sourceUrl: null,
          confidence: 0.85,
          timestamp: now.toISOString(),
        });
      }
      // Reverse DNS
      findings.push({
        id: randomId(),
        moduleName: 'ip_intel',
        sourceTier: 'surface',
        findingType: 'dns_records',
        data: {
          ip: queryValue,
          reverseDns: `ec2-${queryValue.replace(/\./g, '-')}.compute-1.amazonaws.com`,
          openPorts: [80, 443, 22, 8080, 3306].filter(() => Math.random() > 0.5),
        },
        sourceUrl: null,
        confidence: 0.88,
        timestamp: now.toISOString(),
      });
      break;
    }

    case 'name': {
      // Social profiles
      const names = queryValue.split(' ');
      const first = names[0] || 'John';
      const last = names[1] || 'Doe';
      for (let i = 0; i < randInt(2, 6); i++) {
        findings.push({
          id: randomId(),
          moduleName: 'name_search',
          sourceTier: pick(['surface', 'deep']),
          findingType: 'name_match',
          data: {
            fullName: `${first} ${last}`,
            location: pick(['New York, NY', 'London, UK', 'Toronto, CA', 'Sydney, AU']),
            age: randInt(18, 65),
            associatedEmails: [`${first.toLowerCase()}.${last.toLowerCase()}@${pick(['gmail.com', 'yahoo.com', 'protonmail.com'])}`],
            associatedPhones: Math.random() > 0.5 ? [`+1 ${randInt(200, 999)}-${randInt(100, 999)}-${randInt(1000, 9999)}`] : [],
            source: pick(['Public Records', 'Social Media', 'Professional Directory', 'Court Records']),
          },
          sourceUrl: null,
          confidence: rand(0.4, 0.85),
          timestamp: now.toISOString(),
        });
      }
      break;
    }

    case 'social_profile': {
      findings.push({
        id: randomId(),
        moduleName: 'social_analyzer',
        sourceTier: 'surface',
        findingType: 'social_profile',
        data: {
          url: queryValue,
          platform: pick(['Twitter/X', 'Instagram', 'Facebook', 'LinkedIn']),
          displayName: `User_${randomId().slice(0, 6)}`,
          bio: 'Digital enthusiast | Coffee lover | Open source contributor',
          followers: randInt(10, 50000),
          following: randInt(10, 5000),
          postsCount: randInt(10, 10000),
          createdAt: randomDate(new Date('2010-01-01'), new Date('2023-01-01')),
          verified: Math.random() > 0.8,
          linkedAccounts: ['GitHub', 'YouTube', 'Twitch'].filter(() => Math.random() > 0.6),
        },
        sourceUrl: queryValue,
        confidence: 0.88,
        timestamp: now.toISOString(),
      });
      break;
    }
  }

  return findings;
}

function generateModuleStatuses(): OsintModuleStatus[] {
  return [
    {
      name: 'email_lookup',
      displayName: 'Email Lookup',
      enabled: true,
      rateLimit: 30,
      requestsRemaining: randInt(15, 30),
      lastError: null,
      healthy: true,
      supportedQueryTypes: ['email'],
      sourceTier: 'surface',
    },
    {
      name: 'username_search',
      displayName: 'Username Search',
      enabled: true,
      rateLimit: 20,
      requestsRemaining: randInt(8, 20),
      lastError: null,
      healthy: true,
      supportedQueryTypes: ['username'],
      sourceTier: 'surface',
    },
    {
      name: 'phone_lookup',
      displayName: 'Phone Lookup',
      enabled: true,
      rateLimit: 15,
      requestsRemaining: randInt(5, 15),
      lastError: null,
      healthy: true,
      supportedQueryTypes: ['phone'],
      sourceTier: 'surface',
    },
    {
      name: 'domain_intel',
      displayName: 'Domain Intelligence',
      enabled: true,
      rateLimit: 25,
      requestsRemaining: randInt(10, 25),
      lastError: null,
      healthy: true,
      supportedQueryTypes: ['domain'],
      sourceTier: 'surface',
    },
    {
      name: 'ip_intel',
      displayName: 'IP Intelligence',
      enabled: true,
      rateLimit: 30,
      requestsRemaining: randInt(15, 30),
      lastError: null,
      healthy: true,
      supportedQueryTypes: ['ip_address'],
      sourceTier: 'surface',
    },
    {
      name: 'name_search',
      displayName: 'Name Search',
      enabled: true,
      rateLimit: 10,
      requestsRemaining: randInt(3, 10),
      lastError: null,
      healthy: true,
      supportedQueryTypes: ['name'],
      sourceTier: 'surface',
    },
    {
      name: 'social_analyzer',
      displayName: 'Social Analyzer',
      enabled: true,
      rateLimit: 15,
      requestsRemaining: randInt(5, 15),
      lastError: null,
      healthy: true,
      supportedQueryTypes: ['social_profile', 'username'],
      sourceTier: 'surface',
    },
    {
      name: 'paste_monitor',
      displayName: 'Paste Monitor',
      enabled: true,
      rateLimit: 20,
      requestsRemaining: randInt(10, 20),
      lastError: null,
      healthy: true,
      supportedQueryTypes: ['email', 'username'],
      sourceTier: 'deep',
    },
    {
      name: 'darkweb_monitor',
      displayName: 'Dark Web Monitor',
      enabled: Math.random() > 0.2,
      rateLimit: 5,
      requestsRemaining: randInt(1, 5),
      lastError: Math.random() > 0.7 ? 'Tor circuit timeout' : null,
      healthy: Math.random() > 0.3,
      supportedQueryTypes: ['email', 'username', 'domain'],
      sourceTier: 'dark',
    },
  ];
}

/** Simulated API call */
async function mockOsintSearch(
  queryType: OsintQueryType,
  queryValue: string,
): Promise<OsintQueryResult> {
  await new Promise((r) => setTimeout(r, randInt(800, 2500)));
  const findings = buildFindings(queryType, queryValue);
  const modules = generateModuleStatuses().filter((m) =>
    m.supportedQueryTypes.includes(queryType),
  );
  const succeeded = modules.filter((m) => m.healthy).length;
  return {
    queryId: randomId(),
    queryType,
    queryValue,
    findings,
    totalModulesQueried: modules.length,
    modulesSucceeded: succeeded,
    modulesFailed: modules.length - succeeded,
    elapsedMs: randInt(400, 3000),
    queriedAt: new Date().toISOString(),
  };
}

async function mockFetchModules(): Promise<OsintModuleStatus[]> {
  await new Promise((r) => setTimeout(r, 300));
  return generateModuleStatuses();
}

async function mockAgentChat(messages: OsintAgentMessage[], queryContext?: { type: OsintQueryType; value: string }): Promise<OsintAgentMessage> {
  await new Promise((r) => setTimeout(r, randInt(800, 2000)));
  const responses = [
    { content: 'Based on the OSINT findings, I recommend investigating the linked cryptocurrency wallets. The transaction patterns suggest potential mixer usage, which could indicate laundering activity.', suggestions: [{ queryType: 'domain' as OsintQueryType, queryValue: 'mixerservice.onion', rationale: 'Investigate suspected mixer service domain' }] },
    { content: 'The breach data shows this email appeared in 3 major breaches with password reuse. I suggest checking associated usernames across platforms to map the digital footprint.', suggestions: [{ queryType: 'username' as OsintQueryType, queryValue: queryContext?.value?.split('@')[0] || 'target_user', rationale: 'Check username derived from email' }] },
    { content: 'Cross-referencing the IP geolocation data with known Tor exit nodes. The IP shows datacenter hosting which is consistent with VPN/proxy usage. Recommend tracing connected infrastructure.', suggestions: [{ queryType: 'ip_address' as OsintQueryType, queryValue: '185.220.101.42', rationale: 'Check related Tor exit node IP' }] },
    { content: 'Analysis suggests this entity has connections across multiple platforms. The username pattern is consistent across development and social media sites, indicating a single operator. Consider expanding the investigation scope.', suggestions: [] },
    { content: 'I\'ve identified potential links between the target and dark web marketplace listings. The timing of account creation correlates with known marketplace registration windows. Recommend dark web monitoring escalation.', suggestions: [{ queryType: 'username' as OsintQueryType, queryValue: queryContext?.value || 'vendor_alias', rationale: 'Search for vendor aliases on dark web forums' }] },
  ];
  const resp = pick(responses);
  return {
    id: randomId(),
    role: 'assistant',
    content: resp.content,
    timestamp: new Date().toISOString(),
    suggestedQueries: resp.suggestions,
  };
}

/* ================================================================== */
/*  4. REUSABLE UI COMPONENTS                                          */
/* ================================================================== */

const StatBox: FC<{ label: string; value: string | number; sub?: string; color?: string }> = ({
  label, value, sub, color = '#F1F5F9',
}) => (
  <div className="rounded-lg bg-slate-800/60 border border-slate-700/50 p-4">
    <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">{label}</p>
    <p className="text-2xl font-bold" style={{ color }}>{value}</p>
    {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
  </div>
);

const ConfidenceBadge: FC<{ confidence: number }> = ({ confidence }) => {
  const tier: ConfidenceTier =
    confidence >= 0.8 ? 'high' : confidence >= 0.5 ? 'medium' : 'low';
  const cfg = CONFIDENCE_THRESHOLDS[tier];
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: `${cfg.color}15`, color: cfg.color }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: cfg.color }}
      />
      {(confidence * 100).toFixed(0)}%
    </span>
  );
};

const SourceTierBadge: FC<{ tier: SourceTier }> = ({ tier }) => {
  const cfg = SOURCE_TIER_CONFIG[tier];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg}`}
      style={{ color: cfg.color }}
    >
      {tier === 'dark' && '🧅 '}
      {cfg.label}
    </span>
  );
};

const LoadingPlaceholder: FC<{ text?: string }> = ({ text = 'Searching...' }) => (
  <div className="flex flex-col items-center justify-center py-20 text-slate-400">
    <svg className="animate-spin h-10 w-10 mb-4 text-violet-500" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
    <p className="text-sm">{text}</p>
  </div>
);

const EmptyState: FC<{ title: string; description: string }> = ({ title, description }) => (
  <div className="flex flex-col items-center justify-center py-20 text-slate-400">
    <div className="text-5xl mb-4">🔍</div>
    <p className="text-lg font-semibold text-slate-300 mb-2">{title}</p>
    <p className="text-sm text-slate-500 max-w-md text-center">{description}</p>
  </div>
);

const ErrorPlaceholder: FC<{ message: string; onRetry?: () => void }> = ({ message, onRetry }) => (
  <div className="flex flex-col items-center justify-center py-20 text-slate-400">
    <div className="text-4xl mb-4">⚠️</div>
    <p className="text-sm text-red-400 mb-3">{message}</p>
    {onRetry && (
      <button onClick={onRetry} className="px-4 py-1.5 bg-violet-600 hover:bg-violet-500 rounded text-sm text-white">
        Retry
      </button>
    )}
  </div>
);

/* ================================================================== */
/*  5. TAB-SPECIFIC COMPONENTS                                         */
/* ================================================================== */

// ── 5a. Findings List View ─────────────────────────────────────────

const FindingsListView: FC<{
  findings: OsintFinding[];
  queryType: OsintQueryType;
}> = ({ findings, queryType }) => {
  const [filterTier, setFilterTier] = useState<SourceTier | 'all'>('all');
  const [filterModule, setFilterModule] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'confidence' | 'time'>('confidence');

  const modules = useMemo(
    () => [...new Set(findings.map((f) => f.moduleName))],
    [findings],
  );

  const filtered = useMemo(() => {
    let list = [...findings];
    if (filterTier !== 'all') list = list.filter((f) => f.sourceTier === filterTier);
    if (filterModule !== 'all') list = list.filter((f) => f.moduleName === filterModule);
    list.sort((a, b) =>
      sortBy === 'confidence'
        ? b.confidence - a.confidence
        : new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    return list;
  }, [findings, filterTier, filterModule, sortBy]);

  return (
    <div>
      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={filterTier}
          onChange={(e) => setFilterTier(e.target.value as SourceTier | 'all')}
          className="bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm text-slate-200"
        >
          <option value="all">All Sources</option>
          {Object.entries(SOURCE_TIER_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <select
          value={filterModule}
          onChange={(e) => setFilterModule(e.target.value)}
          className="bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm text-slate-200"
        >
          <option value="all">All Modules</option>
          {modules.map((m) => (
            <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'confidence' | 'time')}
          className="bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm text-slate-200"
        >
          <option value="confidence">Sort: Confidence</option>
          <option value="time">Sort: Newest First</option>
        </select>
        <span className="text-xs text-slate-500 self-center ml-auto">
          {filtered.length} finding{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Findings */}
      <div className="space-y-3">
        {filtered.map((finding) => (
          <FindingCard key={finding.id} finding={finding} />
        ))}
        {filtered.length === 0 && (
          <p className="text-sm text-slate-500 text-center py-6">No findings match the current filters.</p>
        )}
      </div>
    </div>
  );
};

const FindingCard: FC<{ finding: OsintFinding }> = ({ finding }) => {
  const [expanded, setExpanded] = useState(false);

  const typeLabel = finding.findingType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="rounded-lg bg-slate-800/50 border border-slate-700/50 overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-700/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-slate-200">{typeLabel}</span>
          <SourceTierBadge tier={finding.sourceTier} />
          <ConfidenceBadge confidence={finding.confidence} />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500 font-mono">
            {finding.moduleName.replace(/_/g, ' ')}
          </span>
          <svg
            className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-700/50">
          <div className="mt-3">
            {renderFindingData(finding)}
          </div>
          {finding.sourceUrl && (
            <div className="mt-2 flex items-center gap-1 text-xs text-slate-500">
              <span>Source:</span>
              <span className="font-mono text-violet-400 truncate max-w-sm">{finding.sourceUrl}</span>
            </div>
          )}
          <div className="mt-2 flex items-center gap-3">
            <span className="text-xs text-slate-600">
              {new Date(finding.timestamp).toLocaleString()}
            </span>
            <button className="text-xs text-violet-400 hover:text-violet-300">
              Add to Graph
            </button>
            <button className="text-xs text-violet-400 hover:text-violet-300">
              Link to Case
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

function renderFindingData(finding: OsintFinding): React.ReactNode {
  const data = finding.data;
  switch (finding.findingType) {
    case 'breach_detected': {
      const breaches = (data.breaches || []) as BreachRecord[];
      return (
        <div className="space-y-2">
          <p className="text-sm text-red-400 font-medium">
            Found in {breaches.length} breach{breaches.length !== 1 ? 'es' : ''}
          </p>
          <div className="grid gap-2">
            {breaches.map((b, i) => (
              <div key={i} className="flex items-center justify-between bg-slate-900/50 rounded px-3 py-2">
                <div>
                  <span className="text-sm text-slate-200 font-medium">{b.name}</span>
                  <span className="text-xs text-slate-500 ml-2">
                    {new Date(b.breachDate).toLocaleDateString()}
                  </span>
                  {b.isSensitive && (
                    <span className="ml-2 text-xs text-red-400">Sensitive</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">
                    {(b.pwnCount / 1_000_000).toFixed(1)}M records
                  </span>
                  {b.isVerified && (
                    <span className="w-2 h-2 bg-teal-500 rounded-full" title="Verified" />
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-1 mt-2">
            {[...new Set(breaches.flatMap((b) => b.dataClasses))].map((dc) => (
              <span key={dc} className="px-2 py-0.5 bg-slate-700/50 rounded text-xs text-slate-400">
                {dc}
              </span>
            ))}
          </div>
        </div>
      );
    }

    case 'username_found': {
      return (
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-200">{String(data.platform)}</span>
          <span className="text-xs font-mono text-violet-400">{String(data.username)}</span>
          <span className="px-2 py-0.5 bg-slate-700/50 rounded text-xs text-slate-400">
            {String(data.category)}
          </span>
        </div>
      );
    }

    case 'phone_info': {
      const info = data as unknown as PhoneInfo;
      return (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <DataField label="E.164" value={info.e164} mono />
          <DataField label="Carrier" value={info.carrier} />
          <DataField label="Region" value={info.region} />
          <DataField label="Type" value={info.numberType} />
          <DataField label="Country Code" value={`+${info.countryCode}`} />
          <DataField label="Valid" value={info.isValid ? 'Yes' : 'No'} />
        </div>
      );
    }

    case 'dns_records': {
      const dns = data as unknown as DnsRecordSet & { ip?: string; reverseDns?: string; openPorts?: number[] };
      if (dns.reverseDns) {
        return (
          <div className="grid grid-cols-2 gap-3">
            <DataField label="Reverse DNS" value={dns.reverseDns} mono />
            {dns.openPorts && (
              <DataField label="Open Ports" value={dns.openPorts.join(', ')} mono />
            )}
          </div>
        );
      }
      return (
        <div className="space-y-2">
          {(['a', 'aaaa', 'mx', 'ns', 'txt', 'cname'] as const).map((rtype) => {
            const records = (dns as Record<string, string[]>)[rtype];
            if (!records || records.length === 0) return null;
            return (
              <div key={rtype} className="flex gap-2">
                <span className="text-xs font-mono text-slate-500 uppercase w-12 shrink-0">{rtype}</span>
                <div className="flex flex-wrap gap-1">
                  {records.map((r: string, i: number) => (
                    <span key={i} className="px-2 py-0.5 bg-slate-900/50 rounded text-xs text-slate-300 font-mono">
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    case 'whois_info': {
      const w = data as unknown as WhoisData;
      return (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <DataField label="Registrar" value={w.registrar} />
          <DataField label="Created" value={new Date(w.createdDate).toLocaleDateString()} />
          <DataField label="Expires" value={new Date(w.expiresDate).toLocaleDateString()} />
          <DataField label="Name Servers" value={w.nameServers.join(', ')} mono />
          <DataField label="DNSSEC" value={w.dnssec ? 'Enabled' : 'Disabled'} />
          <DataField label="Status" value={w.status.join(', ')} />
        </div>
      );
    }

    case 'ip_geolocation': {
      return (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <DataField label="Country" value={String(data.country)} />
          <DataField label="City" value={String(data.city)} />
          <DataField label="ISP" value={String(data.isp)} />
          <DataField label="ASN" value={String(data.asn)} mono />
          <DataField label="Organization" value={String(data.org)} />
          <div className="flex gap-2">
            {data.isTor && <FlagBadge label="Tor" color="#EF4444" />}
            {data.isVpn && <FlagBadge label="VPN" color="#F59E0B" />}
            {data.isProxy && <FlagBadge label="Proxy" color="#F97316" />}
            {data.isDatacenter && <FlagBadge label="DC" color="#6D28D9" />}
          </div>
        </div>
      );
    }

    case 'name_match': {
      return (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <DataField label="Full Name" value={String(data.fullName)} />
          <DataField label="Location" value={String(data.location)} />
          <DataField label="Age" value={String(data.age)} />
          <DataField label="Source" value={String(data.source)} />
          {(data.associatedEmails as string[])?.length > 0 && (
            <DataField label="Emails" value={(data.associatedEmails as string[]).join(', ')} mono />
          )}
          {(data.associatedPhones as string[])?.length > 0 && (
            <DataField label="Phones" value={(data.associatedPhones as string[]).join(', ')} mono />
          )}
        </div>
      );
    }

    case 'social_profile': {
      return (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <DataField label="Platform" value={String(data.platform || data.service)} />
          <DataField label="Display Name" value={String(data.displayName)} />
          {data.followers != null && <DataField label="Followers" value={Number(data.followers).toLocaleString()} />}
          {data.postsCount != null && <DataField label="Posts" value={Number(data.postsCount).toLocaleString()} />}
          {data.createdAt && <DataField label="Created" value={new Date(String(data.createdAt)).toLocaleDateString()} />}
          {data.verified && <FlagBadge label="Verified" color="#14B8A6" />}
        </div>
      );
    }

    default: {
      // Generic key-value renderer
      const entries = Object.entries(data).filter(([, v]) => v != null && typeof v !== 'object');
      return (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {entries.map(([k, v]) => (
            <DataField key={k} label={k.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ')} value={String(v)} />
          ))}
        </div>
      );
    }
  }
}

const DataField: FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
  <div>
    <p className="text-xs text-slate-500 capitalize">{label}</p>
    <p className={`text-sm text-slate-200 ${mono ? 'font-mono' : ''} truncate`} title={value}>
      {value}
    </p>
  </div>
);

const FlagBadge: FC<{ label: string; color: string }> = ({ label, color }) => (
  <span
    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
    style={{ backgroundColor: `${color}15`, color }}
  >
    {label}
  </span>
);

// ── 5b. Breach Timeline Chart ──────────────────────────────────────

const BreachTimeline: FC<{ findings: OsintFinding[] }> = ({ findings }) => {
  const breachFindings = findings.filter((f) => f.findingType === 'breach_detected');
  const allBreaches: BreachRecord[] = breachFindings.flatMap(
    (f) => (f.data.breaches || []) as BreachRecord[],
  );

  if (allBreaches.length === 0) {
    return (
      <EmptyState
        title="No Breaches Detected"
        description="No data breaches were found for this query."
      />
    );
  }

  const option = useMemo(
    () => ({
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item' as const,
        formatter: (params: { data: { value: [string, number]; name: string; dataClasses: string[] } }) => {
          const d = params.data;
          return `<b>${d.name}</b><br/>
            Date: ${new Date(d.value[0]).toLocaleDateString()}<br/>
            Records: ${(d.value[1] / 1_000_000).toFixed(1)}M<br/>
            Exposed: ${d.dataClasses.join(', ')}`;
        },
      },
      xAxis: {
        type: 'time' as const,
        axisLine: { lineStyle: { color: '#334155' } },
        axisLabel: { color: '#94A3B8', fontSize: 11 },
      },
      yAxis: {
        type: 'log' as const,
        name: 'Records (log)',
        nameTextStyle: { color: '#94A3B8', fontSize: 11 },
        axisLine: { lineStyle: { color: '#334155' } },
        axisLabel: {
          color: '#94A3B8',
          fontSize: 11,
          formatter: (v: number) => `${(v / 1_000_000).toFixed(0)}M`,
        },
        splitLine: { lineStyle: { color: '#1E293B' } },
      },
      series: [
        {
          type: 'scatter',
          symbolSize: (val: [string, number]) => Math.max(8, Math.min(40, Math.sqrt(val[1] / 100_000))),
          data: allBreaches.map((b) => ({
            value: [b.breachDate, b.pwnCount],
            name: b.name,
            dataClasses: b.dataClasses,
            itemStyle: {
              color: b.dataClasses.includes('Passwords')
                ? '#EF4444'
                : b.dataClasses.includes('Credit cards')
                  ? '#F59E0B'
                  : '#8B5CF6',
            },
          })),
        },
      ],
      grid: { top: 30, right: 20, bottom: 30, left: 60 },
    }),
    [allBreaches],
  );

  return (
    <div>
      <div className="flex items-center gap-4 mb-3">
        <h3 className="text-sm font-semibold text-slate-300">
          Breach Timeline — {allBreaches.length} breaches found
        </h3>
        <div className="flex items-center gap-3 ml-auto text-xs">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500" /> Passwords
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-500" /> Credit Cards
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-violet-500" /> Other
          </span>
        </div>
      </div>
      <div className="rounded-lg bg-slate-800/50 border border-slate-700/50 p-4">
        <ReactECharts option={option} style={{ height: 340 }} />
      </div>

      {/* Data classes breakdown */}
      <div className="mt-4 rounded-lg bg-slate-800/50 border border-slate-700/50 p-4">
        <h4 className="text-xs text-slate-400 uppercase tracking-wide mb-3">Exposed Data Types</h4>
        <DataClassesBar breaches={allBreaches} />
      </div>
    </div>
  );
};

const DataClassesBar: FC<{ breaches: BreachRecord[] }> = ({ breaches }) => {
  const counts: Record<string, number> = {};
  for (const b of breaches) {
    for (const dc of b.dataClasses) {
      counts[dc] = (counts[dc] || 0) + 1;
    }
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const max = sorted[0]?.[1] || 1;
  const colors = ['#EF4444', '#F59E0B', '#8B5CF6', '#14B8A6', '#3B82F6', '#EC4899', '#6D28D9', '#F97316'];

  return (
    <div className="space-y-2">
      {sorted.map(([dc, count], i) => (
        <div key={dc} className="flex items-center gap-3">
          <span className="text-xs text-slate-400 w-32 truncate">{dc}</span>
          <div className="flex-1 h-4 bg-slate-900/50 rounded overflow-hidden">
            <div
              className="h-full rounded transition-all"
              style={{
                width: `${(count / max) * 100}%`,
                backgroundColor: colors[i % colors.length],
              }}
            />
          </div>
          <span className="text-xs text-slate-500 w-6 text-right">{count}</span>
        </div>
      ))}
    </div>
  );
};

// ── 5c. Platform Map (Username Search Results) ─────────────────────

const PlatformMap: FC<{ findings: OsintFinding[] }> = ({ findings }) => {
  const userFindings = findings.filter((f) => f.findingType === 'username_found');

  if (userFindings.length === 0) {
    return (
      <EmptyState
        title="No Platform Matches"
        description="No username matches found across platforms."
      />
    );
  }

  const byCategory: Record<string, OsintFinding[]> = {};
  for (const f of userFindings) {
    const cat = String(f.data.category || 'Other');
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(f);
  }

  const categoryColors: Record<string, string> = {
    'Social Media': '#EC4899',
    'Development': '#14B8A6',
    'Professional': '#3B82F6',
    'Forum': '#F59E0B',
    'Messaging': '#8B5CF6',
    'Gaming': '#EF4444',
    'Media': '#6D28D9',
    'Security': '#14B8A6',
  };

  const pieOption = useMemo(
    () => ({
      backgroundColor: 'transparent',
      tooltip: { trigger: 'item' as const },
      series: [
        {
          type: 'pie',
          radius: ['40%', '70%'],
          center: ['50%', '50%'],
          avoidLabelOverlap: true,
          itemStyle: { borderColor: '#0F172A', borderWidth: 2 },
          label: { show: true, color: '#94A3B8', fontSize: 11 },
          data: Object.entries(byCategory).map(([cat, items]) => ({
            value: items.length,
            name: cat,
            itemStyle: { color: categoryColors[cat] || '#64748B' },
          })),
        },
      ],
    }),
    [byCategory],
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-300">
          Platform Presence — {userFindings.length} matches
        </h3>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pie chart */}
        <div className="rounded-lg bg-slate-800/50 border border-slate-700/50 p-4">
          <ReactECharts option={pieOption} style={{ height: 300 }} />
        </div>

        {/* Platform grid */}
        <div className="rounded-lg bg-slate-800/50 border border-slate-700/50 p-4 overflow-y-auto max-h-[340px]">
          {Object.entries(byCategory).map(([cat, items]) => (
            <div key={cat} className="mb-3">
              <h4
                className="text-xs font-semibold uppercase tracking-wide mb-2"
                style={{ color: categoryColors[cat] || '#94A3B8' }}
              >
                {cat}
              </h4>
              <div className="flex flex-wrap gap-2">
                {items.map((f) => (
                  <span
                    key={f.id}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-700/50 text-slate-200 hover:bg-slate-600/50 cursor-pointer transition-colors"
                    title={String(f.data.profileUrl)}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: categoryColors[cat] || '#64748B' }}
                    />
                    {String(f.data.platform)}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ── 5d. Connection Graph (Entity Relationships) ────────────────────

const CONNECTION_GRAPH_STYLES: Stylesheet[] = [
  {
    selector: 'node',
    style: {
      label: 'data(label)',
      'text-valign': 'bottom',
      'text-margin-y': 8,
      color: '#94A3B8',
      'font-size': 10,
      'background-color': 'data(color)',
      width: 'data(size)',
      height: 'data(size)',
      'border-width': 2,
      'border-color': '#1E293B',
    },
  },
  {
    selector: 'node[type="query"]',
    style: {
      'background-color': '#6D28D9',
      width: 50,
      height: 50,
      'font-weight': 'bold' as const,
      color: '#F1F5F9',
      'font-size': 12,
    },
  },
  {
    selector: 'edge',
    style: {
      width: 1.5,
      'line-color': '#334155',
      'curve-style': 'bezier',
      'target-arrow-shape': 'triangle',
      'target-arrow-color': '#334155',
      'arrow-scale': 0.8,
      label: 'data(label)',
      'font-size': 8,
      color: '#475569',
      'text-rotation': 'autorotate',
    },
  },
];

const ConnectionGraph: FC<{
  findings: OsintFinding[];
  queryType: OsintQueryType;
  queryValue: string;
}> = ({ findings, queryType, queryValue }) => {
  const cyRef = useRef<Core | null>(null);

  const elements = useMemo(() => {
    const nodes: ElementDefinition[] = [];
    const edges: ElementDefinition[] = [];
    const nodeIds = new Set<string>();

    // Central query node
    const centerId = 'query-center';
    nodes.push({
      data: {
        id: centerId,
        label: queryValue.length > 25 ? queryValue.slice(0, 22) + '...' : queryValue,
        type: 'query',
        color: QUERY_TYPE_CONFIG[queryType].color,
        size: 50,
      },
    });
    nodeIds.add(centerId);

    const colorMap: Record<FindingType, string> = {
      breach_detected: '#EF4444',
      username_found: '#14B8A6',
      phone_info: '#F59E0B',
      dns_records: '#3B82F6',
      whois_info: '#6D28D9',
      ip_geolocation: '#EC4899',
      social_profile: '#8B5CF6',
      profile_found: '#F97316',
      email_domain_info: '#14B8A6',
      public_profile: '#3B82F6',
      paste_detected: '#F59E0B',
      dark_web_mention: '#EF4444',
      domain_info: '#6D28D9',
      name_match: '#3B82F6',
    };

    for (const finding of findings) {
      const nodeId = `finding-${finding.id}`;
      if (nodeIds.has(nodeId)) continue;
      nodeIds.add(nodeId);

      let label = finding.findingType.replace(/_/g, ' ');

      // Extract a meaningful label from finding data
      if (finding.findingType === 'username_found') {
        label = String(finding.data.platform || label);
      } else if (finding.findingType === 'breach_detected') {
        const breaches = (finding.data.breaches || []) as BreachRecord[];
        label = `${breaches.length} breach${breaches.length !== 1 ? 'es' : ''}`;
        // Add individual breach nodes
        for (const b of breaches.slice(0, 8)) {
          const bId = `breach-${b.name.replace(/\s/g, '-')}`;
          if (!nodeIds.has(bId)) {
            nodeIds.add(bId);
            nodes.push({
              data: {
                id: bId,
                label: b.name,
                type: 'breach',
                color: '#EF4444',
                size: Math.max(18, Math.min(35, Math.sqrt(b.pwnCount / 500_000) * 5)),
              },
            });
            edges.push({
              data: { source: nodeId, target: bId, label: 'exposed in' },
            });
          }
        }
      } else if (finding.findingType === 'name_match') {
        label = String(finding.data.fullName || label);
      } else if (finding.findingType === 'ip_geolocation') {
        label = `${finding.data.city}, ${finding.data.country}`;
      } else if (finding.findingType === 'dns_records' && finding.data.domain) {
        label = String(finding.data.domain);
      } else if (finding.findingType === 'whois_info') {
        label = String((finding.data as unknown as WhoisData).registrar || 'WHOIS');
      } else if (finding.findingType === 'social_profile') {
        label = String(finding.data.platform || finding.data.service || label);
      }

      nodes.push({
        data: {
          id: nodeId,
          label: label.length > 20 ? label.slice(0, 18) + '...' : label,
          type: finding.findingType,
          color: colorMap[finding.findingType] || '#64748B',
          size: 28 + finding.confidence * 12,
        },
      });

      edges.push({
        data: {
          source: centerId,
          target: nodeId,
          label: finding.findingType.replace(/_/g, ' '),
        },
      });
    }

    return [...nodes, ...edges];
  }, [findings, queryType, queryValue]);

  const layout: LayoutOptions = useMemo(
    () => ({
      name: 'concentric',
      concentric: (node: { data: (key: string) => string }) =>
        node.data('type') === 'query' ? 100 : 50,
      levelWidth: () => 2,
      minNodeSpacing: 40,
      animate: true,
      animationDuration: 500,
    }),
    [],
  );

  if (findings.length === 0) {
    return (
      <EmptyState
        title="No Connections to Map"
        description="Run a search to see entity relationships."
      />
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-300">Connection Graph</h3>
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-1 text-xs bg-slate-700/50 hover:bg-slate-600/50 rounded text-slate-300"
            onClick={() => cyRef.current?.fit(undefined, 40)}
          >
            Fit View
          </button>
          <button
            className="px-3 py-1 text-xs bg-violet-600/80 hover:bg-violet-500 rounded text-white"
            onClick={() => {
              const layout = cyRef.current?.layout({
                name: 'cose',
                animate: true,
                animationDuration: 800,
              } as LayoutOptions);
              layout?.run();
            }}
          >
            Re-layout
          </button>
        </div>
      </div>
      <div className="rounded-lg bg-slate-900/80 border border-slate-700/50 overflow-hidden" style={{ height: 500 }}>
        <CytoscapeComponent
          elements={elements}
          stylesheet={CONNECTION_GRAPH_STYLES}
          layout={layout}
          style={{ width: '100%', height: '100%' }}
          cy={(cy) => { cyRef.current = cy; }}
          minZoom={0.2}
          maxZoom={3}
        />
      </div>
    </div>
  );
};

// ── 5e. Source Distribution Chart ──────────────────────────────────

const SourceDistribution: FC<{ findings: OsintFinding[] }> = ({ findings }) => {
  const tierCounts = useMemo(() => {
    const counts: Record<SourceTier, number> = { surface: 0, deep: 0, dark: 0 };
    for (const f of findings) counts[f.sourceTier]++;
    return counts;
  }, [findings]);

  const moduleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const f of findings) {
      counts[f.moduleName] = (counts[f.moduleName] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [findings]);

  const confidenceDistribution = useMemo(() => {
    const buckets = { high: 0, medium: 0, low: 0 };
    for (const f of findings) {
      if (f.confidence >= 0.8) buckets.high++;
      else if (f.confidence >= 0.5) buckets.medium++;
      else buckets.low++;
    }
    return buckets;
  }, [findings]);

  const tierBarOption = useMemo(
    () => ({
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis' as const },
      xAxis: {
        type: 'category' as const,
        data: ['Surface', 'Deep', 'Dark'],
        axisLine: { lineStyle: { color: '#334155' } },
        axisLabel: { color: '#94A3B8', fontSize: 11 },
      },
      yAxis: {
        type: 'value' as const,
        axisLine: { lineStyle: { color: '#334155' } },
        axisLabel: { color: '#94A3B8', fontSize: 11 },
        splitLine: { lineStyle: { color: '#1E293B' } },
      },
      series: [
        {
          type: 'bar',
          data: [
            { value: tierCounts.surface, itemStyle: { color: '#14B8A6' } },
            { value: tierCounts.deep, itemStyle: { color: '#F59E0B' } },
            { value: tierCounts.dark, itemStyle: { color: '#EF4444' } },
          ],
          barWidth: '50%',
        },
      ],
      grid: { top: 20, right: 20, bottom: 30, left: 40 },
    }),
    [tierCounts],
  );

  const confidencePieOption = useMemo(
    () => ({
      backgroundColor: 'transparent',
      tooltip: { trigger: 'item' as const },
      series: [
        {
          type: 'pie',
          radius: ['45%', '70%'],
          data: [
            { value: confidenceDistribution.high, name: 'High (≥80%)', itemStyle: { color: '#14B8A6' } },
            { value: confidenceDistribution.medium, name: 'Medium (50-79%)', itemStyle: { color: '#F59E0B' } },
            { value: confidenceDistribution.low, name: 'Low (<50%)', itemStyle: { color: '#EF4444' } },
          ],
          label: { color: '#94A3B8', fontSize: 11 },
          itemStyle: { borderColor: '#0F172A', borderWidth: 2 },
        },
      ],
    }),
    [confidenceDistribution],
  );

  if (findings.length === 0) {
    return (
      <EmptyState
        title="No Data Available"
        description="Run a search to see source distribution analytics."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Source tier distribution */}
        <div className="rounded-lg bg-slate-800/50 border border-slate-700/50 p-4">
          <h4 className="text-xs text-slate-400 uppercase tracking-wide mb-3">Source Tier Distribution</h4>
          <ReactECharts option={tierBarOption} style={{ height: 260 }} />
        </div>

        {/* Confidence distribution */}
        <div className="rounded-lg bg-slate-800/50 border border-slate-700/50 p-4">
          <h4 className="text-xs text-slate-400 uppercase tracking-wide mb-3">Confidence Distribution</h4>
          <ReactECharts option={confidencePieOption} style={{ height: 260 }} />
        </div>
      </div>

      {/* Module breakdown */}
      <div className="rounded-lg bg-slate-800/50 border border-slate-700/50 p-4">
        <h4 className="text-xs text-slate-400 uppercase tracking-wide mb-3">Findings by Module</h4>
        <div className="space-y-2">
          {moduleCounts.map(([mod, count]) => {
            const max = moduleCounts[0]?.[1] || 1;
            return (
              <div key={mod} className="flex items-center gap-3">
                <span className="text-xs text-slate-400 w-40 truncate">{mod.replace(/_/g, ' ')}</span>
                <div className="flex-1 h-3 bg-slate-900/50 rounded overflow-hidden">
                  <div
                    className="h-full bg-violet-500 rounded transition-all"
                    style={{ width: `${(count / max) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-slate-500 w-6 text-right">{count}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ── 5f. Module Status Panel ────────────────────────────────────────

const ModuleStatusPanel: FC<{ modules: OsintModuleStatus[] }> = ({ modules }) => {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-300">OSINT Modules</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {modules.map((mod) => (
          <div
            key={mod.name}
            className={`rounded-lg border p-4 transition-colors ${
              mod.enabled
                ? mod.healthy
                  ? 'bg-slate-800/50 border-slate-700/50'
                  : 'bg-red-900/10 border-red-800/30'
                : 'bg-slate-800/30 border-slate-700/30 opacity-50'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-200">{mod.displayName}</span>
              <div className="flex items-center gap-2">
                <SourceTierBadge tier={mod.sourceTier} />
                <span
                  className={`w-2 h-2 rounded-full ${
                    !mod.enabled ? 'bg-slate-600' : mod.healthy ? 'bg-teal-500' : 'bg-red-500'
                  }`}
                  title={!mod.enabled ? 'Disabled' : mod.healthy ? 'Healthy' : 'Unhealthy'}
                />
              </div>
            </div>

            {/* Rate limit bar */}
            <div className="mt-2">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                <span>Rate Limit</span>
                <span>{mod.requestsRemaining}/{mod.rateLimit} remaining</span>
              </div>
              <div className="h-1.5 bg-slate-900/50 rounded overflow-hidden">
                <div
                  className="h-full rounded transition-all"
                  style={{
                    width: `${(mod.requestsRemaining / mod.rateLimit) * 100}%`,
                    backgroundColor:
                      mod.requestsRemaining / mod.rateLimit > 0.5
                        ? '#14B8A6'
                        : mod.requestsRemaining / mod.rateLimit > 0.2
                          ? '#F59E0B'
                          : '#EF4444',
                  }}
                />
              </div>
            </div>

            {/* Supported types */}
            <div className="mt-2 flex flex-wrap gap-1">
              {mod.supportedQueryTypes.map((qt) => (
                <span key={qt} className="px-1.5 py-0.5 bg-slate-700/50 rounded text-[10px] text-slate-400">
                  {QUERY_TYPE_CONFIG[qt].icon} {QUERY_TYPE_CONFIG[qt].label}
                </span>
              ))}
            </div>

            {/* Error */}
            {mod.lastError && (
              <p className="mt-2 text-xs text-red-400 truncate" title={mod.lastError}>
                {mod.lastError}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

/* ================================================================== */
/*  6. MAIN OSINT PAGE COMPONENT                                       */
/* ================================================================== */

type TabId = 'findings' | 'breaches' | 'platforms' | 'graph' | 'analytics' | 'modules';

const TAB_DEFS: { id: TabId; label: string }[] = [
  { id: 'findings', label: 'Findings' },
  { id: 'breaches', label: 'Breach Timeline' },
  { id: 'platforms', label: 'Platform Map' },
  { id: 'graph', label: 'Connection Graph' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'modules', label: 'Modules' },
];

const OsintPage: FC = () => {
  const isDemoTenant = useIsDemoTenant();
  const queryClient = useQueryClient();

  // ── State ─────────────────────────────────────────────────────
  const [queryType, setQueryType] = useState<OsintQueryType>('email');
  const [queryValue, setQueryValue] = useState('');
  const [activeTab, setActiveTab] = useState<TabId>('findings');
  const [searchHistory, setSearchHistory] = useState<SearchHistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [caseId, setCaseId] = useState<string>('');
  const [agentOpen, setAgentOpen] = useState(false);
  const [agentMessages, setAgentMessages] = useState<OsintAgentMessage[]>([
    { id: 'system-1', role: 'system', content: 'OSINT AI Agent initialized. I can help analyze findings, suggest search queries, identify patterns, and provide investigative guidance. How can I assist?', timestamp: new Date().toISOString() },
  ]);
  const [agentInput, setAgentInput] = useState('');
  const [agentLoading, setAgentLoading] = useState(false);
  const agentEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    agentEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [agentMessages]);

  // ── Queries ───────────────────────────────────────────────────

  const searchMutation = useMutation({
    mutationFn: ({ type, value }: { type: OsintQueryType; value: string }) =>
      mockOsintSearch(type, value),
    onSuccess: (result) => {
      queryClient.setQueryData(['osint-result'], result);
      setSearchHistory((prev) => [
        {
          id: result.queryId,
          queryType: result.queryType,
          queryValue: result.queryValue,
          findingCount: result.findings.length,
          timestamp: result.queriedAt,
        },
        ...prev.slice(0, 49),
      ]);
    },
  });

  const rawResult = queryClient.getQueryData<OsintQueryResult>(['osint-result']);
  const result = isDemoTenant ? rawResult : undefined;

  const {
    data: rawModuleStatuses,
    isLoading: modulesLoading,
  } = useQuery({
    queryKey: ['osint-modules'],
    queryFn: mockFetchModules,
    refetchInterval: 30_000,
    enabled: isDemoTenant,
  });
  const moduleStatuses = isDemoTenant ? rawModuleStatuses : undefined;

  // ── Handlers ──────────────────────────────────────────────────

  const handleSearch = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      if (!isDemoTenant) return;
      const trimmed = queryValue.trim();
      if (!trimmed) return;
      searchMutation.mutate({ type: queryType, value: trimmed });
    },
    [isDemoTenant, queryType, queryValue, searchMutation],
  );

  const handleHistorySelect = useCallback(
    (entry: SearchHistoryEntry) => {
      setQueryType(entry.queryType);
      setQueryValue(entry.queryValue);
      setShowHistory(false);
      if (isDemoTenant) searchMutation.mutate({ type: entry.queryType, value: entry.queryValue });
    },
    [isDemoTenant, searchMutation],
  );

  const handleAgentSend = useCallback(async () => {
    if (!agentInput.trim() || agentLoading) return;
    const userMsg: OsintAgentMessage = { id: randomId(), role: 'user', content: agentInput.trim(), timestamp: new Date().toISOString() };
    setAgentMessages((prev) => [...prev, userMsg]);
    setAgentInput('');
    setAgentLoading(true);
    try {
      const response = await mockAgentChat([...agentMessages, userMsg], result ? { type: result.queryType, value: result.queryValue } : undefined);
      setAgentMessages((prev) => [...prev, response]);
    } finally {
      setAgentLoading(false);
    }
  }, [agentInput, agentLoading, agentMessages, result]);

  const handleSuggestedQuery = useCallback((sq: SuggestedQuery) => {
    setQueryType(sq.queryType);
    setQueryValue(sq.queryValue);
    if (isDemoTenant) searchMutation.mutate({ type: sq.queryType, value: sq.queryValue });
  }, [isDemoTenant, searchMutation]);

  // ── Derived data ──────────────────────────────────────────────

  const findings = result?.findings ?? [];
  const hasBreaches = findings.some((f) => f.findingType === 'breach_detected');
  const hasPlatforms = findings.some((f) => f.findingType === 'username_found');

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">OSINT Investigation</h1>
          <p className="text-sm text-slate-400 mt-1">
            Open-source intelligence gathering across surface, deep, and dark web
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setAgentOpen(!agentOpen)}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${agentOpen ? 'bg-violet-600 text-white' : 'bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700'}`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
            </svg>
            AI Agent
          </button>
          <button
            className="relative px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-300 hover:bg-slate-700 transition-colors"
            onClick={() => setShowHistory(!showHistory)}
          >
            History
            {searchHistory.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-violet-600 rounded-full text-[10px] flex items-center justify-center text-white">
                {searchHistory.length}
              </span>
            )}
          </button>
          <select
            value={caseId}
            onChange={(e) => setCaseId(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300"
          >
            <option value="">No Case Linked</option>
            {isDemoTenant && (
              <>
                <option value="case-001">CASE-2024-001 — Dark Market Investigation</option>
                <option value="case-002">CASE-2024-002 — Crypto Fraud Ring</option>
                <option value="case-003">CASE-2024-003 — CSAM Distribution Network</option>
              </>
            )}
          </select>
        </div>
      </div>

      {/* History dropdown */}
      {showHistory && searchHistory.length > 0 && (
        <div className="mb-4 rounded-lg bg-slate-800 border border-slate-700 p-3 max-h-64 overflow-y-auto">
          <h4 className="text-xs text-slate-400 uppercase tracking-wide mb-2">Recent Searches</h4>
          <div className="space-y-1">
            {searchHistory.map((entry) => (
              <button
                key={entry.id}
                className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-slate-700/50 text-left transition-colors"
                onClick={() => handleHistorySelect(entry)}
              >
                <div className="flex items-center gap-2">
                  <span>{QUERY_TYPE_CONFIG[entry.queryType].icon}</span>
                  <span className="text-sm text-slate-200 font-mono">{entry.queryValue}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500">
                    {entry.findingCount} finding{entry.findingCount !== 1 ? 's' : ''}
                  </span>
                  <span className="text-xs text-slate-600">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search bar */}
      <form onSubmit={handleSearch} className="mb-6">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Query type selector */}
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(QUERY_TYPE_CONFIG) as OsintQueryType[]).map((type) => {
              const cfg = QUERY_TYPE_CONFIG[type];
              const active = queryType === type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setQueryType(type)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all border ${
                    active
                      ? 'border-violet-500/50 bg-violet-500/10 text-violet-300'
                      : 'border-slate-700/50 bg-slate-800/50 text-slate-400 hover:bg-slate-700/50 hover:text-slate-300'
                  }`}
                >
                  <span>{cfg.icon}</span>
                  <span>{cfg.label}</span>
                </button>
              );
            })}
          </div>

          {/* Input + search button */}
          <div className="flex flex-1 gap-2">
            <input
              type="text"
              value={queryValue}
              onChange={(e) => setQueryValue(e.target.value)}
              placeholder={QUERY_TYPE_CONFIG[queryType].placeholder}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 font-mono"
            />
            <button
              type="submit"
              disabled={searchMutation.isPending || !queryValue.trim()}
              className="px-6 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-lg text-sm font-medium text-white transition-colors flex items-center gap-2"
            >
              {searchMutation.isPending ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Searching...
                </>
              ) : (
                'Search'
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Summary stats (shown after search) */}
      {result && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
          <StatBox
            label="Total Findings"
            value={result.findings.length}
            color="#8B5CF6"
          />
          <StatBox
            label="Modules Queried"
            value={result.totalModulesQueried}
            color="#14B8A6"
            sub={`${result.modulesSucceeded} succeeded`}
          />
          <StatBox
            label="Surface"
            value={findings.filter((f) => f.sourceTier === 'surface').length}
            color={SOURCE_TIER_CONFIG.surface.color}
          />
          <StatBox
            label="Deep Web"
            value={findings.filter((f) => f.sourceTier === 'deep').length}
            color={SOURCE_TIER_CONFIG.deep.color}
          />
          <StatBox
            label="Dark Web"
            value={findings.filter((f) => f.sourceTier === 'dark').length}
            color={SOURCE_TIER_CONFIG.dark.color}
          />
          <StatBox
            label="High Confidence"
            value={findings.filter((f) => f.confidence >= 0.8).length}
            color="#14B8A6"
          />
          <StatBox
            label="Query Time"
            value={`${result.elapsedMs}ms`}
            color="#F1F5F9"
          />
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-slate-700/50 mb-6">
        <div className="flex gap-1 overflow-x-auto">
          {TAB_DEFS.map((tab) => {
            const active = activeTab === tab.id;
            const disabled =
              (tab.id === 'breaches' && !hasBreaches) ||
              (tab.id === 'platforms' && !hasPlatforms);
            return (
              <button
                key={tab.id}
                onClick={() => !disabled && setActiveTab(tab.id)}
                disabled={disabled}
                className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${
                  active
                    ? 'border-violet-500 text-violet-400'
                    : disabled
                      ? 'border-transparent text-slate-600 cursor-not-allowed'
                      : 'border-transparent text-slate-400 hover:text-slate-300 hover:border-slate-600'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="min-h-[400px]">
        {searchMutation.isPending ? (
          <LoadingPlaceholder text="Querying OSINT modules..." />
        ) : searchMutation.isError ? (
          <ErrorPlaceholder
            message="Failed to execute OSINT search"
            onRetry={() =>
              searchMutation.mutate({ type: queryType, value: queryValue.trim() })
            }
          />
        ) : !result ? (
          <EmptyState
            title="Begin Your Investigation"
            description="Select a query type, enter a value, and click Search to gather intelligence from surface, deep, and dark web sources."
          />
        ) : (
          <>
            {activeTab === 'findings' && (
              <FindingsListView findings={findings} queryType={result.queryType} />
            )}
            {activeTab === 'breaches' && <BreachTimeline findings={findings} />}
            {activeTab === 'platforms' && <PlatformMap findings={findings} />}
            {activeTab === 'graph' && (
              <ConnectionGraph
                findings={findings}
                queryType={result.queryType}
                queryValue={result.queryValue}
              />
            )}
            {activeTab === 'analytics' && <SourceDistribution findings={findings} />}
            {activeTab === 'modules' && (
              modulesLoading ? (
                <LoadingPlaceholder text="Loading module status..." />
              ) : (
                <ModuleStatusPanel modules={moduleStatuses || []} />
              )
            )}
          </>
        )}
      </div>

      {/* AI Agent Drawer */}
      {agentOpen && (
        <div className="fixed top-0 right-0 h-full w-[420px] bg-slate-900 border-l border-slate-700 shadow-2xl z-40 flex flex-col">
          {/* Drawer Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
              </svg>
              <h3 className="text-sm font-semibold text-slate-200">OSINT AI Agent</h3>
              <span className="text-[10px] text-violet-400 bg-violet-500/10 px-1.5 py-0.5 rounded">Claude</span>
            </div>
            <button onClick={() => setAgentOpen(false)} className="text-slate-400 hover:text-slate-200 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Context indicator */}
          {result && (
            <div className="px-4 py-2 bg-slate-800/50 border-b border-slate-700/50 flex items-center gap-2">
              <span className="text-[10px] text-slate-500">Context:</span>
              <span className="text-[10px] font-mono text-violet-400">{QUERY_TYPE_CONFIG[result.queryType].icon} {result.queryValue}</span>
              <span className="text-[10px] text-slate-600">{result.findings.length} findings</span>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {agentMessages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-lg px-3 py-2 ${
                  msg.role === 'user' ? 'bg-violet-600 text-white' :
                  msg.role === 'system' ? 'bg-slate-800 text-slate-400 border border-slate-700' :
                  'bg-slate-800 text-slate-200'
                }`}>
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  {msg.suggestedQueries && msg.suggestedQueries.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <p className="text-[10px] text-slate-400 uppercase">Suggested searches:</p>
                      {msg.suggestedQueries.map((sq, i) => (
                        <button
                          key={i}
                          onClick={() => handleSuggestedQuery(sq)}
                          className="w-full text-left px-2 py-1.5 rounded bg-violet-500/10 hover:bg-violet-500/20 transition-colors"
                        >
                          <span className="text-xs text-violet-300">{QUERY_TYPE_CONFIG[sq.queryType].icon} {sq.queryValue}</span>
                          <span className="block text-[10px] text-slate-500 mt-0.5">{sq.rationale}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <span className="block text-[9px] text-slate-600 mt-1">{new Date(msg.timestamp).toLocaleTimeString()}</span>
                </div>
              </div>
            ))}
            {agentLoading && (
              <div className="flex justify-start">
                <div className="bg-slate-800 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={agentEndRef} />
          </div>

          {/* Input */}
          <div className="px-4 py-3 border-t border-slate-700">
            <div className="flex gap-2">
              <input
                type="text"
                value={agentInput}
                onChange={(e) => setAgentInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAgentSend(); } }}
                placeholder="Ask the AI agent..."
                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500"
              />
              <button
                onClick={handleAgentSend}
                disabled={agentLoading || !agentInput.trim()}
                className="px-3 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-lg text-white transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OsintPage;

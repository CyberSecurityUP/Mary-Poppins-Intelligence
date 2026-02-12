/**
 * Mary Poppins Digital Intelligence Platform
 * Settings & Administration Page
 *
 * 9-tab configuration workspace:
 *   1. Integrations — External API management with Vault credential storage
 *   2. Thresholds — AI/ML detection sensitivity tuning
 *   3. Modules — Feature activation with warrant gates
 *   4. Notifications — Alert channels, severities, event subscriptions
 *   5. User Preferences — Timezone, date format, layout, display
 *   6. Data Retention — Ethical safeguards, auto-purge, PII masking
 *   7. Security — RBAC overview, session management, MFA status
 *   8. System — Environment info, service health, license
 *   9. AI Models — Model registry, ensemble config, weight tuning
 *
 * Built with:
 *   React Query — Server state management
 *   Tailwind CSS — Dark theme (navy #0F172A)
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FC,
  type ReactNode,
} from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Modal from '../components/common/Modal';
import { useToast, useIsDemoTenant } from '../App';

/* ================================================================== */
/*  1. TYPE DEFINITIONS                                                */
/* ================================================================== */

export interface Integration {
  id: string;
  name: string;
  category: IntegrationCategory;
  provider: string;
  baseUrl: string;
  authType: 'api_key' | 'oauth2' | 'basic' | 'none';
  isEnabled: boolean;
  rateLimit: number;
  lastChecked: string | null;
  status: 'connected' | 'error' | 'unconfigured';
  configJson: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export type IntegrationCategory =
  | 'osint'
  | 'crypto'
  | 'threat_intel'
  | 'hash_db'
  | 'notification'
  | 'identity'
  | 'storage'
  | 'ai_analysis'
  | 'llm';

export interface ThresholdEntry {
  id: string;
  key: string;
  name: string;
  description: string;
  value: number;
  defaultValue: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  category: string;
  requiresApproval: boolean;
}

export interface ModuleConfig {
  id: string;
  name: string;
  description: string;
  isEnabled: boolean;
  category: string;
  requiresWarrant: boolean;
  warrantRef: string | null;
  healthy: boolean;
  version: string;
  dependencies: string[];
}

export interface NotificationChannel {
  id: string;
  type: 'email' | 'slack' | 'teams' | 'in_app' | 'webhook';
  label: string;
  enabled: boolean;
  config: Record<string, string>;
}

export interface NotificationRule {
  id: string;
  eventType: string;
  label: string;
  description: string;
  enabled: boolean;
  minSeverity: AlertSeverity;
  channels: string[];
}

export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface UserPreferences {
  timezone: string;
  dateFormat: string;
  itemsPerPage: number;
  theme: 'dark' | 'light' | 'system';
  graphLayout: 'cose' | 'dagre' | 'concentric' | 'grid';
  sidebarCollapsed: boolean;
  dashboardWidgets: string[];
}

export interface RetentionPolicy {
  id: string;
  dataType: string;
  label: string;
  description: string;
  retentionDays: number;
  autoPurge: boolean;
  requiresDualAuth: boolean;
}

export interface EthicalSetting {
  key: string;
  label: string;
  description: string;
  value: boolean;
  locked: boolean;
}

export interface RbacRole {
  id: string;
  name: string;
  displayName: string;
  description: string;
  userCount: number;
  permissions: string[];
}

export interface PlatformUser {
  id: string;
  name: string;
  email: string;
  role: string;
  status: 'active' | 'suspended' | 'pending';
  mfaEnabled: boolean;
  lastLogin: string;
  createdAt: string;
  tenant: string;
}

export interface ActiveSession {
  id: string;
  userId: string;
  userEmail: string;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
  lastActivity: string;
  mfaVerified: boolean;
}

export interface ServiceHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  latencyMs: number;
  version: string;
  uptime: string;
}

/* ================================================================== */
/*  2. CONSTANTS & MOCK DATA                                           */
/* ================================================================== */

const randomId = () => Math.random().toString(36).slice(2, 12);
const rand = (a: number, b: number) => Math.random() * (b - a) + a;
const randInt = (a: number, b: number) => Math.floor(rand(a, b));
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

/**
 * Generate a cryptographically-ish random temporary password.
 * Format: 3 uppercase + 4 lowercase + 2 digits + 2 special, shuffled.
 * Keycloak will mark it as temporary (required action: UPDATE_PASSWORD).
 */
const generateTempPassword = (): string => {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const special = '!@#$%&*';
  const pickN = (charset: string, n: number) =>
    Array.from({ length: n }, () => charset[Math.floor(Math.random() * charset.length)]).join('');
  const raw = pickN(upper, 3) + pickN(lower, 4) + pickN(digits, 2) + pickN(special, 2);
  return raw.split('').sort(() => Math.random() - 0.5).join('');
};

/**
 * Persist user credentials to localStorage so the auth system can validate logins.
 * Each entry: { email, password, name, role, tenantId, tenantName, mustChangePassword }
 */
const saveUserCredential = (cred: {
  email: string;
  password: string;
  name: string;
  role: string;
  tenantId: string;
  tenantName: string;
}) => {
  try {
    const raw = localStorage.getItem('mp-platform-users');
    const existing: Array<Record<string, unknown>> = raw ? JSON.parse(raw) : [];
    // Remove duplicate if re-creating same email in same tenant
    const filtered = existing.filter((u) => !(u.email === cred.email && u.tenantId === cred.tenantId));
    filtered.push({ ...cred, mustChangePassword: true });
    localStorage.setItem('mp-platform-users', JSON.stringify(filtered));
  } catch { /* ignore */ }
};

const removeUserCredential = (email: string, tenantId?: string) => {
  try {
    const raw = localStorage.getItem('mp-platform-users');
    if (!raw) return;
    const existing: Array<Record<string, unknown>> = JSON.parse(raw);
    const filtered = tenantId
      ? existing.filter((u) => !(u.email === email && u.tenantId === tenantId))
      : existing.filter((u) => u.email !== email);
    localStorage.setItem('mp-platform-users', JSON.stringify(filtered));
  } catch { /* ignore */ }
};

const updateUserCredentialPassword = (email: string, newPassword: string, mustChange: boolean) => {
  try {
    const raw = localStorage.getItem('mp-platform-users');
    if (!raw) return;
    const existing: Array<Record<string, unknown>> = JSON.parse(raw);
    const updated = existing.map((u) =>
      u.email === email ? { ...u, password: newPassword, mustChangePassword: mustChange } : u,
    );
    localStorage.setItem('mp-platform-users', JSON.stringify(updated));
  } catch { /* ignore */ }
};

const removeCredentialsByTenant = (tenantId: string) => {
  try {
    const raw = localStorage.getItem('mp-platform-users');
    if (!raw) return;
    const existing: Array<Record<string, unknown>> = JSON.parse(raw);
    const filtered = existing.filter((u) => u.tenantId !== tenantId);
    localStorage.setItem('mp-platform-users', JSON.stringify(filtered));
  } catch { /* ignore */ }
};

/* ── localStorage persistence helpers ──────────────────────────── */

const STORAGE_KEYS = {
  tenants: 'mp-tenants',
  tenantUsers: 'mp-tenant-users',
} as const;

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveToStorage(key: string, data: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch { /* quota exceeded — silently fail */ }
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  osint: { bg: 'bg-blue-500/15', text: 'text-blue-400' },
  crypto: { bg: 'bg-amber-500/15', text: 'text-amber-400' },
  threat_intel: { bg: 'bg-purple-500/15', text: 'text-purple-400' },
  hash_db: { bg: 'bg-pink-500/15', text: 'text-pink-400' },
  notification: { bg: 'bg-teal-500/15', text: 'text-teal-400' },
  identity: { bg: 'bg-indigo-500/15', text: 'text-indigo-400' },
  storage: { bg: 'bg-slate-500/15', text: 'text-slate-400' },
  ai_analysis: { bg: 'bg-cyan-500/15', text: 'text-cyan-400' },
  llm: { bg: 'bg-emerald-500/15', text: 'text-emerald-400' },
};

const STATUS_STYLES: Record<string, string> = {
  connected: 'bg-teal-500/15 text-teal-400 border-teal-500/30',
  error: 'bg-red-500/15 text-red-400 border-red-500/30',
  unconfigured: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
};

const SEVERITY_COLORS: Record<AlertSeverity, string> = {
  critical: '#EF4444',
  high: '#F97316',
  medium: '#F59E0B',
  low: '#3B82F6',
  info: '#64748B',
};

// ── Mock Integrations ──────────────────────────────────────────────

const MOCK_INTEGRATIONS: Integration[] = [
  { id: '1', name: 'Have I Been Pwned', category: 'osint', provider: 'HIBP', baseUrl: 'https://haveibeenpwned.com/api/v3', authType: 'api_key', isEnabled: true, rateLimit: 10, lastChecked: new Date().toISOString(), status: 'connected', configJson: null, createdAt: '2024-01-15T00:00:00Z', updatedAt: '2024-11-01T00:00:00Z' },
  { id: '2', name: 'Shodan', category: 'osint', provider: 'Shodan', baseUrl: 'https://api.shodan.io', authType: 'api_key', isEnabled: true, rateLimit: 1, lastChecked: new Date().toISOString(), status: 'connected', configJson: null, createdAt: '2024-01-15T00:00:00Z', updatedAt: '2024-10-20T00:00:00Z' },
  { id: '3', name: 'VirusTotal', category: 'threat_intel', provider: 'Google', baseUrl: 'https://www.virustotal.com/api/v3', authType: 'api_key', isEnabled: false, rateLimit: 4, lastChecked: null, status: 'unconfigured', configJson: null, createdAt: '2024-02-01T00:00:00Z', updatedAt: '2024-02-01T00:00:00Z' },
  { id: '4', name: 'Chainalysis Reactor', category: 'crypto', provider: 'Chainalysis', baseUrl: 'https://api.chainalysis.com/v1', authType: 'api_key', isEnabled: true, rateLimit: 30, lastChecked: new Date().toISOString(), status: 'connected', configJson: null, createdAt: '2024-01-20T00:00:00Z', updatedAt: '2024-11-05T00:00:00Z' },
  { id: '5', name: 'NCMEC Hash Sharing', category: 'hash_db', provider: 'NCMEC', baseUrl: 'https://report.cybertip.org/hashsharing/v2', authType: 'api_key', isEnabled: true, rateLimit: 100, lastChecked: new Date().toISOString(), status: 'connected', configJson: null, createdAt: '2024-01-10T00:00:00Z', updatedAt: '2024-11-10T00:00:00Z' },
  { id: '6', name: 'PhotoDNA Cloud', category: 'hash_db', provider: 'Microsoft', baseUrl: 'https://api.microsoftmoderator.com/photodna', authType: 'api_key', isEnabled: true, rateLimit: 50, lastChecked: new Date().toISOString(), status: 'connected', configJson: null, createdAt: '2024-01-10T00:00:00Z', updatedAt: '2024-10-15T00:00:00Z' },
  { id: '7', name: 'Slack Alerts', category: 'notification', provider: 'Slack', baseUrl: 'https://hooks.slack.com/services', authType: 'none', isEnabled: false, rateLimit: 60, lastChecked: null, status: 'unconfigured', configJson: null, createdAt: '2024-03-01T00:00:00Z', updatedAt: '2024-03-01T00:00:00Z' },
  { id: '8', name: 'CipherTrace', category: 'crypto', provider: 'Mastercard', baseUrl: 'https://api.ciphertrace.com/v2', authType: 'api_key', isEnabled: true, rateLimit: 20, lastChecked: new Date().toISOString(), status: 'connected', configJson: null, createdAt: '2024-04-01T00:00:00Z', updatedAt: '2024-09-20T00:00:00Z' },
  { id: '9', name: 'INTERPOL ICSE', category: 'hash_db', provider: 'INTERPOL', baseUrl: 'https://api.interpol.int/icse/v1', authType: 'api_key', isEnabled: true, rateLimit: 200, lastChecked: new Date().toISOString(), status: 'connected', configJson: null, createdAt: '2024-01-05T00:00:00Z', updatedAt: '2024-11-12T00:00:00Z' },
  { id: '10', name: 'Keycloak OIDC', category: 'identity', provider: 'Red Hat', baseUrl: 'https://keycloak.internal:8180', authType: 'oauth2', isEnabled: true, rateLimit: 1000, lastChecked: new Date().toISOString(), status: 'connected', configJson: null, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-08-01T00:00:00Z' },
  { id: '11', name: 'MinIO Object Store', category: 'storage', provider: 'MinIO', baseUrl: 'https://minio.internal:9000', authType: 'basic', isEnabled: true, rateLimit: 5000, lastChecked: new Date().toISOString(), status: 'connected', configJson: null, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-07-15T00:00:00Z' },
  { id: '12', name: 'AbuseIPDB', category: 'threat_intel', provider: 'AbuseIPDB', baseUrl: 'https://api.abuseipdb.com/api/v2', authType: 'api_key', isEnabled: true, rateLimit: 5, lastChecked: new Date().toISOString(), status: 'connected', configJson: null, createdAt: '2024-05-01T00:00:00Z', updatedAt: '2024-11-01T00:00:00Z' },
  { id: '13', name: 'AIorNot', category: 'ai_analysis', provider: 'AIorNot', baseUrl: 'https://api.aiornot.com/v1', authType: 'api_key', isEnabled: false, rateLimit: 100, lastChecked: null, status: 'unconfigured', configJson: null, createdAt: '2024-06-01T00:00:00Z', updatedAt: '2024-06-01T00:00:00Z' },
  { id: '14', name: 'Claude (Anthropic)', category: 'llm', provider: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1', authType: 'api_key', isEnabled: true, rateLimit: 60, lastChecked: new Date().toISOString(), status: 'connected', configJson: { model: 'claude-sonnet-4-5-20250929', tasks: ['content_analysis', 'decision_support', 'osint_agent'] }, createdAt: '2024-06-01T00:00:00Z', updatedAt: '2024-11-15T00:00:00Z' },
  { id: '15', name: 'ChatGPT (OpenAI)', category: 'llm', provider: 'OpenAI', baseUrl: 'https://api.openai.com/v1', authType: 'api_key', isEnabled: false, rateLimit: 60, lastChecked: null, status: 'unconfigured', configJson: null, createdAt: '2024-07-01T00:00:00Z', updatedAt: '2024-07-01T00:00:00Z' },
  { id: '16', name: 'DeepSeek', category: 'llm', provider: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', authType: 'api_key', isEnabled: false, rateLimit: 30, lastChecked: null, status: 'unconfigured', configJson: null, createdAt: '2024-08-01T00:00:00Z', updatedAt: '2024-08-01T00:00:00Z' },
  { id: '17', name: 'OpenRouter', category: 'llm', provider: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', authType: 'api_key', isEnabled: false, rateLimit: 60, lastChecked: null, status: 'unconfigured', configJson: null, createdAt: '2024-09-01T00:00:00Z', updatedAt: '2024-09-01T00:00:00Z' },
  { id: '18', name: 'NSFW/NSFL Detection', category: 'ai_analysis', provider: 'Internal', baseUrl: 'http://classifier.internal:8080', authType: 'none', isEnabled: true, rateLimit: 500, lastChecked: new Date().toISOString(), status: 'connected', configJson: { models: ['nsfw-v3', 'nsfl-v2', 'age-est-v4', 'scene-v2'] }, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-11-10T00:00:00Z' },
];

// ── Mock Thresholds ────────────────────────────────────────────────

const MOCK_THRESHOLDS: ThresholdEntry[] = [
  { id: 't1', key: 'csam_alert_threshold', name: 'CSAM Alert Threshold', description: 'Minimum AI confidence score to flag content as suspected CSAM and trigger mandatory review', value: 0.85, defaultValue: 0.85, min: 0.50, max: 1.0, step: 0.01, unit: '%', category: 'Classification', requiresApproval: true },
  { id: 't2', key: 'nsfw_alert_threshold', name: 'NSFW Confidence Threshold', description: 'Minimum score for NSFW classification label assignment', value: 0.70, defaultValue: 0.70, min: 0.30, max: 1.0, step: 0.01, unit: '%', category: 'Classification', requiresApproval: false },
  { id: 't3', key: 'age_estimation_margin', name: 'Age Estimation Safety Margin', description: 'Years subtracted from estimated age for conservative classification', value: 3, defaultValue: 3, min: 0, max: 10, step: 1, unit: 'years', category: 'Classification', requiresApproval: true },
  { id: 't4', key: 'grooming_alert_threshold', name: 'Grooming Risk Alert', description: 'Grooming risk score that triggers investigator alert', value: 0.65, defaultValue: 0.65, min: 0.30, max: 1.0, step: 0.01, unit: '%', category: 'NLP', requiresApproval: false },
  { id: 't5', key: 'grooming_stage_confidence', name: 'Grooming Stage Confidence', description: 'Minimum confidence to assign a grooming stage label', value: 0.60, defaultValue: 0.55, min: 0.30, max: 1.0, step: 0.01, unit: '%', category: 'NLP', requiresApproval: false },
  { id: 't6', key: 'hamming_distance', name: 'Hash Hamming Distance', description: 'Maximum Hamming distance for perceptual hash match (lower = stricter)', value: 10, defaultValue: 10, min: 1, max: 30, step: 1, unit: 'bits', category: 'Hashing', requiresApproval: false },
  { id: 't7', key: 'pdq_match_threshold', name: 'PDQ Match Threshold', description: 'PDQ hash quality threshold for matching against known databases', value: 80, defaultValue: 80, min: 50, max: 100, step: 1, unit: '%', category: 'Hashing', requiresApproval: false },
  { id: 't8', key: 'crypto_risk_score', name: 'Crypto Risk Score', description: 'Wallet risk score threshold for automatic flagging', value: 0.60, defaultValue: 0.60, min: 0.10, max: 1.0, step: 0.05, unit: '%', category: 'Crypto', requiresApproval: false },
  { id: 't9', key: 'mixer_confidence', name: 'Mixer Detection Confidence', description: 'Minimum confidence to classify a transaction as mixer-related', value: 0.70, defaultValue: 0.70, min: 0.40, max: 1.0, step: 0.05, unit: '%', category: 'Crypto', requiresApproval: false },
  { id: 't10', key: 'darkweb_risk_score', name: 'Dark Web Risk Score', description: 'Dark web page risk score for automatic alert creation', value: 0.50, defaultValue: 0.50, min: 0.10, max: 1.0, step: 0.05, unit: '%', category: 'Dark Web', requiresApproval: false },
  { id: 't11', key: 'risk_critical', name: 'Critical Risk Threshold', description: 'Entity risk score at which critical severity is assigned', value: 0.90, defaultValue: 0.90, min: 0.70, max: 1.0, step: 0.01, unit: '%', category: 'Risk Scoring', requiresApproval: false },
  { id: 't12', key: 'risk_high', name: 'High Risk Threshold', description: 'Entity risk score at which high severity is assigned', value: 0.70, defaultValue: 0.70, min: 0.40, max: 0.95, step: 0.01, unit: '%', category: 'Risk Scoring', requiresApproval: false },
];

// ── Mock Modules ───────────────────────────────────────────────────

const MOCK_MODULES: ModuleConfig[] = [
  { id: 'm1', name: 'Content Ingestion', description: 'Multi-source media intake (upload, URL, S3, local folder). Bytes held in memory only.', isEnabled: true, category: 'Core', requiresWarrant: false, warrantRef: null, healthy: true, version: '1.4.2', dependencies: [] },
  { id: 'm2', name: 'Perceptual Hashing', description: 'pHash, PDQ (Meta), and PhotoDNA (Microsoft) computation with similarity search', isEnabled: true, category: 'Core', requiresWarrant: false, warrantRef: null, healthy: true, version: '1.2.0', dependencies: ['Content Ingestion'] },
  { id: 'm3', name: 'AI Classification', description: '5-stage pipeline: NSFW → age estimation → scene → CSAM risk → human review', isEnabled: true, category: 'Core', requiresWarrant: false, warrantRef: null, healthy: true, version: '2.1.0', dependencies: ['Content Ingestion'] },
  { id: 'm4', name: 'Grooming Detection', description: 'NLP-based 3-layer grooming analysis: rules + transformer + conversation dynamics', isEnabled: true, category: 'NLP', requiresWarrant: false, warrantRef: null, healthy: true, version: '1.1.0', dependencies: [] },
  { id: 'm5', name: 'Email OSINT', description: 'Breach check (HIBP), MX/DNS verification, Gravatar, public profile discovery', isEnabled: true, category: 'OSINT', requiresWarrant: false, warrantRef: null, healthy: true, version: '1.3.1', dependencies: [] },
  { id: 'm6', name: 'Username Search', description: 'Cross-platform username enumeration across 300+ services', isEnabled: true, category: 'OSINT', requiresWarrant: false, warrantRef: null, healthy: true, version: '1.2.0', dependencies: [] },
  { id: 'm7', name: 'Phone Lookup', description: 'Phone validation, carrier identification, region, linked social profiles', isEnabled: true, category: 'OSINT', requiresWarrant: false, warrantRef: null, healthy: true, version: '1.0.3', dependencies: [] },
  { id: 'm8', name: 'Domain Intelligence', description: 'WHOIS, DNS (A/MX/NS/TXT), subdomain discovery, SSL certificate transparency', isEnabled: true, category: 'OSINT', requiresWarrant: false, warrantRef: null, healthy: true, version: '1.1.0', dependencies: [] },
  { id: 'm9', name: 'IP Intelligence', description: 'Geolocation, ASN lookup, Tor/VPN/proxy detection, abuse reports', isEnabled: true, category: 'OSINT', requiresWarrant: false, warrantRef: null, healthy: true, version: '1.0.1', dependencies: [] },
  { id: 'm10', name: 'Bitcoin Tracing', description: 'BTC wallet analysis, multi-hop transaction tracing, common-input-ownership clustering', isEnabled: true, category: 'Crypto', requiresWarrant: false, warrantRef: null, healthy: true, version: '1.5.0', dependencies: [] },
  { id: 'm11', name: 'Ethereum Tracing', description: 'ETH/ERC-20 wallet analysis, smart contract interaction tracing', isEnabled: true, category: 'Crypto', requiresWarrant: false, warrantRef: null, healthy: true, version: '1.3.0', dependencies: [] },
  { id: 'm12', name: 'Mixer Detection', description: 'CoinJoin, Wasabi, Tornado Cash, ChipMixer pattern detection', isEnabled: true, category: 'Crypto', requiresWarrant: false, warrantRef: null, healthy: true, version: '1.1.0', dependencies: ['Bitcoin Tracing', 'Ethereum Tracing'] },
  { id: 'm13', name: 'Dark Web Crawler', description: 'Tor-based .onion site crawling — metadata only, content never stored', isEnabled: false, category: 'Dark Web', requiresWarrant: true, warrantRef: null, healthy: false, version: '0.9.2', dependencies: [] },
  { id: 'm14', name: 'Forum Monitor', description: 'Dark web forum monitoring with alias extraction and PGP correlation', isEnabled: false, category: 'Dark Web', requiresWarrant: true, warrantRef: null, healthy: false, version: '0.8.0', dependencies: ['Dark Web Crawler'] },
  { id: 'm15', name: 'Alias Correlation', description: 'Cross-platform alias de-anonymization via writing style, PGP keys, crypto addresses', isEnabled: false, category: 'Dark Web', requiresWarrant: true, warrantRef: null, healthy: false, version: '0.7.1', dependencies: ['Dark Web Crawler', 'Forum Monitor'] },
  { id: 'm16', name: 'Geolocation Service', description: 'IP-to-geo mapping (MaxMind), ASN lookup, heatmap generation', isEnabled: true, category: 'Infrastructure', requiresWarrant: false, warrantRef: null, healthy: true, version: '1.0.0', dependencies: [] },
  { id: 'm17', name: 'Graph Engine', description: 'Neo4j-backed intelligence graph: node CRUD, path finding, community detection', isEnabled: true, category: 'Infrastructure', requiresWarrant: false, warrantRef: null, healthy: true, version: '1.6.0', dependencies: [] },
];

// ── Mock Notification Config ───────────────────────────────────────

const MOCK_CHANNELS: NotificationChannel[] = [
  { id: 'ch1', type: 'in_app', label: 'In-App Notifications', enabled: true, config: {} },
  { id: 'ch2', type: 'email', label: 'Email', enabled: true, config: { smtp_host: 'smtp.internal', from: 'alerts@marypoppins.int' } },
  { id: 'ch3', type: 'slack', label: 'Slack', enabled: false, config: { webhook_url: '' } },
  { id: 'ch4', type: 'teams', label: 'Microsoft Teams', enabled: false, config: { webhook_url: '' } },
  { id: 'ch5', type: 'webhook', label: 'Custom Webhook', enabled: false, config: { url: '', secret: '' } },
];

const MOCK_NOTIFICATION_RULES: NotificationRule[] = [
  { id: 'nr1', eventType: 'csam_detection', label: 'CSAM Detection', description: 'AI classifier flags suspected CSAM content', enabled: true, minSeverity: 'critical', channels: ['ch1', 'ch2'] },
  { id: 'nr2', eventType: 'grooming_alert', label: 'Grooming Alert', description: 'NLP pipeline detects grooming behaviour patterns', enabled: true, minSeverity: 'high', channels: ['ch1', 'ch2'] },
  { id: 'nr3', eventType: 'hash_match', label: 'Known Hash Match', description: 'Perceptual hash matches NCMEC/INTERPOL database', enabled: true, minSeverity: 'critical', channels: ['ch1', 'ch2'] },
  { id: 'nr4', eventType: 'darkweb_sighting', label: 'Dark Web Sighting', description: 'Monitored entity appears on dark web marketplace or forum', enabled: true, minSeverity: 'high', channels: ['ch1'] },
  { id: 'nr5', eventType: 'crypto_risk', label: 'High-Risk Wallet', description: 'Wallet risk score exceeds configured threshold', enabled: true, minSeverity: 'medium', channels: ['ch1'] },
  { id: 'nr6', eventType: 'case_update', label: 'Case Updates', description: 'New evidence, notes, or status changes on assigned cases', enabled: true, minSeverity: 'info', channels: ['ch1'] },
  { id: 'nr7', eventType: 'audit_anomaly', label: 'Audit Anomaly', description: 'Hash chain integrity check failure or unusual access pattern', enabled: true, minSeverity: 'critical', channels: ['ch1', 'ch2'] },
  { id: 'nr8', eventType: 'system_health', label: 'System Health', description: 'Service degradation or outage detected', enabled: true, minSeverity: 'high', channels: ['ch1'] },
];

// ── Mock Retention Policies ────────────────────────────────────────

const MOCK_RETENTION: RetentionPolicy[] = [
  { id: 'r1', dataType: 'audit_logs', label: 'Audit Logs', description: 'Immutable hash-chained audit trail entries', retentionDays: 2555, autoPurge: false, requiresDualAuth: true },
  { id: 'r2', dataType: 'case_data', label: 'Case Data', description: 'Active case records, evidence, notes, and linked entities', retentionDays: 1825, autoPurge: false, requiresDualAuth: true },
  { id: 'r3', dataType: 'classification_results', label: 'Classification Results', description: 'AI model outputs, confidence scores, and review decisions', retentionDays: 730, autoPurge: true, requiresDualAuth: false },
  { id: 'r4', dataType: 'osint_results', label: 'OSINT Results', description: 'Search results, findings, and module outputs', retentionDays: 365, autoPurge: true, requiresDualAuth: false },
  { id: 'r5', dataType: 'crypto_traces', label: 'Crypto Traces', description: 'Wallet analyses, transaction graphs, cluster data', retentionDays: 730, autoPurge: true, requiresDualAuth: false },
  { id: 'r6', dataType: 'darkweb_sightings', label: 'Dark Web Sightings', description: 'Crawler metadata, forum extracts, alias correlations', retentionDays: 365, autoPurge: true, requiresDualAuth: false },
  { id: 'r7', dataType: 'session_logs', label: 'Session Logs', description: 'User login sessions and access logs', retentionDays: 90, autoPurge: true, requiresDualAuth: false },
  { id: 'r8', dataType: 'temp_processing', label: 'Temporary Processing', description: 'Ephemeral data from ingestion pipelines (hashes computed, bytes discarded)', retentionDays: 0, autoPurge: true, requiresDualAuth: false },
];

const MOCK_ETHICAL_SETTINGS: EthicalSetting[] = [
  { key: 'image_display_blocked', label: 'Zero Visual Exposure', description: 'Raw images are NEVER displayed or stored — only hashes, scores, and metadata', value: true, locked: true },
  { key: 'pii_masking_in_logs', label: 'PII Masking in Logs', description: 'Personally identifiable information is masked in all log outputs', value: true, locked: false },
  { key: 'audit_log_immutable', label: 'Immutable Audit Log', description: 'Audit log entries cannot be modified or deleted after creation', value: true, locked: true },
  { key: 'require_warrant_darkweb', label: 'Warrant Required — Dark Web', description: 'Dark web crawling modules require valid legal authorization', value: true, locked: false },
  { key: 'require_warrant_osint', label: 'Warrant Required — OSINT', description: 'OSINT queries require legal authorization (typically disabled)', value: false, locked: false },
  { key: 'dual_auth_export', label: 'Dual Authorization for Export', description: 'Two authorized users must approve data exports', value: true, locked: false },
  { key: 'auto_purge_unlinked', label: 'Auto-Purge Unlinked Data', description: 'Data not linked to any active case is automatically purged per retention policy', value: true, locked: false },
  { key: 'mandatory_review_csam', label: 'Mandatory Human Review — CSAM', description: 'All AI CSAM classifications require human investigator review before action', value: true, locked: true },
];

// ── Mock RBAC ──────────────────────────────────────────────────────

const MOCK_ROLES: RbacRole[] = [
  { id: 'r1', name: 'admin', displayName: 'Administrator', description: 'Full platform access including system configuration and user management', userCount: 2, permissions: ['*'] },
  { id: 'r2', name: 'lead_investigator', displayName: 'Lead Investigator', description: 'Case management, evidence review, OSINT, crypto, dark web access', userCount: 5, permissions: ['cases.*', 'osint.*', 'crypto.*', 'darkweb.*', 'graph.*', 'classify.review', 'export.request'] },
  { id: 'r3', name: 'investigator', displayName: 'Investigator', description: 'Case work, OSINT searches, crypto tracing on assigned cases', userCount: 18, permissions: ['cases.read', 'cases.notes', 'osint.search', 'crypto.trace', 'graph.read', 'graph.expand'] },
  { id: 'r4', name: 'analyst', displayName: 'Analyst', description: 'Read-only access to assigned cases with graph and dashboard views', userCount: 12, permissions: ['cases.read', 'graph.read', 'dashboard.read'] },
  { id: 'r5', name: 'auditor', displayName: 'Auditor', description: 'Read-only access to audit logs and integrity verification', userCount: 3, permissions: ['audit.*', 'dashboard.read'] },
  { id: 'r6', name: 'ethics_board', displayName: 'Ethics Board', description: 'Review and approve threshold changes, warrant requirements, data exports', userCount: 4, permissions: ['settings.thresholds.approve', 'export.approve', 'audit.read'] },
];

const MOCK_SESSIONS: ActiveSession[] = [
  { id: 's1', userId: 'u1', userEmail: 'admin@marypoppins.int', ipAddress: '10.0.1.15', userAgent: 'Chrome 120 / macOS', createdAt: '2024-11-15T08:00:00Z', lastActivity: new Date().toISOString(), mfaVerified: true },
  { id: 's2', userId: 'u2', userEmail: 'j.smith@agency.gov', ipAddress: '10.0.2.42', userAgent: 'Firefox 121 / Windows', createdAt: '2024-11-15T09:30:00Z', lastActivity: new Date(Date.now() - 300000).toISOString(), mfaVerified: true },
  { id: 's3', userId: 'u3', userEmail: 'a.chen@agency.gov', ipAddress: '10.0.2.87', userAgent: 'Chrome 120 / Linux', createdAt: '2024-11-15T07:15:00Z', lastActivity: new Date(Date.now() - 1800000).toISOString(), mfaVerified: true },
];

// ── Mock Service Health ────────────────────────────────────────────

const MOCK_SERVICES: ServiceHealth[] = [
  { name: 'Core API', status: 'healthy', latencyMs: 12, version: '1.8.0', uptime: '14d 6h 23m' },
  { name: 'PostgreSQL', status: 'healthy', latencyMs: 3, version: '16.1', uptime: '14d 6h 23m' },
  { name: 'Neo4j', status: 'healthy', latencyMs: 8, version: '5.15.0', uptime: '14d 6h 23m' },
  { name: 'Elasticsearch', status: 'healthy', latencyMs: 15, version: '8.12.0', uptime: '14d 6h 22m' },
  { name: 'Redis', status: 'healthy', latencyMs: 1, version: '7.2.3', uptime: '14d 6h 23m' },
  { name: 'Kafka', status: 'healthy', latencyMs: 5, version: '3.6.1', uptime: '14d 6h 20m' },
  { name: 'Keycloak', status: 'healthy', latencyMs: 22, version: '23.0.3', uptime: '14d 6h 23m' },
  { name: 'Ingestion Worker', status: 'healthy', latencyMs: 0, version: '1.4.2', uptime: '7d 3h 12m' },
  { name: 'Classifier Worker', status: 'healthy', latencyMs: 0, version: '2.1.0', uptime: '7d 3h 12m' },
  { name: 'OSINT Worker', status: 'healthy', latencyMs: 0, version: '1.3.1', uptime: '7d 3h 12m' },
  { name: 'Crypto Worker', status: 'healthy', latencyMs: 0, version: '1.5.0', uptime: '7d 3h 12m' },
  { name: 'Dark Web Crawler', status: 'down', latencyMs: 0, version: '0.9.2', uptime: '—' },
  { name: 'MinIO', status: 'healthy', latencyMs: 4, version: '2024.01.13', uptime: '14d 6h 23m' },
  { name: 'Vault', status: 'healthy', latencyMs: 6, version: '1.15.4', uptime: '14d 6h 23m' },
];

/* ================================================================== */
/*  3. MOCK API                                                        */
/* ================================================================== */

async function mockDelay(ms = 400) {
  await new Promise((r) => setTimeout(r, randInt(ms / 2, ms)));
}

async function mockFetchIntegrations(): Promise<Integration[]> {
  await mockDelay();
  return MOCK_INTEGRATIONS;
}
async function mockFetchThresholds(): Promise<ThresholdEntry[]> {
  await mockDelay();
  return MOCK_THRESHOLDS;
}
async function mockFetchModules(): Promise<ModuleConfig[]> {
  await mockDelay();
  return MOCK_MODULES;
}
async function mockFetchChannels(): Promise<NotificationChannel[]> {
  await mockDelay();
  return MOCK_CHANNELS;
}
async function mockFetchNotifRules(): Promise<NotificationRule[]> {
  await mockDelay();
  return MOCK_NOTIFICATION_RULES;
}
async function mockFetchRetention(): Promise<RetentionPolicy[]> {
  await mockDelay();
  return MOCK_RETENTION;
}
async function mockFetchEthicalSettings(): Promise<EthicalSetting[]> {
  await mockDelay();
  return MOCK_ETHICAL_SETTINGS;
}
async function mockFetchRoles(): Promise<RbacRole[]> {
  await mockDelay();
  return MOCK_ROLES;
}
async function mockFetchSessions(): Promise<ActiveSession[]> {
  await mockDelay();
  return MOCK_SESSIONS;
}
async function mockFetchServiceHealth(): Promise<ServiceHealth[]> {
  await mockDelay();
  return MOCK_SERVICES;
}
async function mockFetchPreferences(): Promise<UserPreferences> {
  await mockDelay();
  return {
    timezone: 'America/New_York',
    dateFormat: 'YYYY-MM-DD',
    itemsPerPage: 25,
    theme: 'dark',
    graphLayout: 'cose',
    sidebarCollapsed: false,
    dashboardWidgets: ['risk_timeline', 'alerts_table', 'geo_heatmap', 'classification_donut', 'active_cases', 'crypto_volume'],
  };
}
async function mockTestIntegration(id: string): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  await new Promise((r) => setTimeout(r, randInt(500, 2000)));
  return Math.random() > 0.15
    ? { ok: true, latencyMs: randInt(50, 400) }
    : { ok: false, latencyMs: 0, error: 'Connection refused' };
}

/* ================================================================== */
/*  4. SHARED UI COMPONENTS                                            */
/* ================================================================== */

const Toggle: FC<{ checked: boolean; onChange: () => void; disabled?: boolean }> = ({
  checked, onChange, disabled,
}) => (
  <label className={`relative inline-flex items-center ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>
    <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} className="sr-only peer" />
    <div className="w-9 h-5 bg-slate-600 peer-checked:bg-violet-600 rounded-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
  </label>
);

const Badge: FC<{ children: ReactNode; className?: string }> = ({ children, className = '' }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${className}`}>{children}</span>
);

const SectionHeader: FC<{ title: string; description: string; action?: ReactNode }> = ({
  title, description, action,
}) => (
  <div className="flex items-start justify-between mb-6">
    <div>
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <p className="text-sm text-slate-400 mt-1 max-w-2xl">{description}</p>
    </div>
    {action}
  </div>
);

const Card: FC<{ children: ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`bg-slate-800/50 border border-slate-700/50 rounded-lg ${className}`}>{children}</div>
);

const LoadingState: FC<{ text?: string }> = ({ text = 'Loading...' }) => (
  <div className="flex items-center justify-center py-16 text-slate-400">
    <svg className="animate-spin h-5 w-5 mr-3 text-violet-500" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
    <span className="text-sm">{text}</span>
  </div>
);

const EmptyTenantState: FC<{ title: string; description: string }> = ({ title, description }) => (
  <div className="flex flex-col items-center justify-center py-20 text-center">
    <svg className="w-14 h-14 text-slate-700 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
    </svg>
    <h3 className="text-lg font-semibold text-slate-400 mb-2">{title}</h3>
    <p className="text-sm text-slate-500 max-w-md">{description}</p>
  </div>
);

const SaveBar: FC<{ onSave: () => void; onReset: () => void; saving?: boolean }> = ({
  onSave, onReset, saving,
}) => (
  <div className="flex gap-3 pt-4 border-t border-slate-700/50 mt-6">
    <button
      onClick={onSave}
      disabled={saving}
      className="px-5 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-violet-800 text-white rounded-lg text-sm font-medium transition-colors"
    >
      {saving ? 'Saving...' : 'Save Changes'}
    </button>
    <button
      onClick={onReset}
      className="px-5 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm font-medium transition-colors"
    >
      Reset to Defaults
    </button>
  </div>
);

/* ================================================================== */
/*  5. TAB PANELS                                                      */
/* ================================================================== */

// ── 5a. Integrations Panel ─────────────────────────────────────────

const IntegrationsPanel: FC = () => {
  const isDemoTenant = useIsDemoTenant();
  const { data: initialIntegrations, isLoading } = useQuery({
    queryKey: ['settings-integrations'],
    queryFn: mockFetchIntegrations,
    enabled: isDemoTenant,
  });

  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [filterCat, setFilterCat] = useState<string>('all');
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; latencyMs: number; error?: string }>>({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [configModalId, setConfigModalId] = useState<string | null>(null);
  const [llmConfig, setLlmConfig] = useState<{ apiKey: string; model: string; tasks: string[]; temperature: number; maxTokens: number }>({ apiKey: '', model: '', tasks: [], temperature: 0.7, maxTokens: 4096 });
  const { addToast } = useToast();

  React.useEffect(() => {
    if (initialIntegrations) setIntegrations(initialIntegrations);
  }, [initialIntegrations]);

  if (!isDemoTenant) {
    return <EmptyTenantState title="No Integrations Configured" description="Configure your API integrations to connect external services. Add OSINT, crypto tracing, hash databases, and notification channels." />;
  }

  const handleTest = useCallback(async (id: string) => {
    setTestingId(id);
    const result = await mockTestIntegration(id);
    setTestResult((prev) => ({ ...prev, [id]: result }));
    if (result.ok) {
      setIntegrations((prev) =>
        prev.map((i) =>
          i.id === id ? { ...i, status: 'connected' as const, lastChecked: new Date().toISOString() } : i
        )
      );
    }
    setTestingId(null);
  }, []);

  if (isLoading || integrations.length === 0) return <LoadingState text="Loading integrations..." />;

  const categories = ['all', ...new Set(integrations.map((i) => i.category))];
  const filtered = filterCat === 'all' ? integrations : integrations.filter((i) => i.category === filterCat);
  const connectedCount = integrations.filter((i) => i.status === 'connected' && i.isEnabled).length;

  return (
    <div>
      <SectionHeader
        title="API Integrations"
        description={`Manage external API connections for OSINT, crypto tracing, threat intelligence, and hash databases. ${connectedCount}/${integrations.length} active.`}
        action={
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            + Add Integration
          </button>
        }
      />

      {/* Category filter */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setFilterCat(cat)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              filterCat === cat
                ? 'border-violet-500/50 bg-violet-500/10 text-violet-300'
                : 'border-slate-700/50 bg-slate-800/50 text-slate-400 hover:text-slate-300'
            }`}
          >
            {cat === 'all' ? 'All' : cat.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.map((integration) => {
          const catStyle = CATEGORY_COLORS[integration.category] || CATEGORY_COLORS.storage;
          const tr = testResult[integration.id];
          return (
            <Card key={integration.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-2 h-2 rounded-full ${integration.isEnabled && integration.status === 'connected' ? 'bg-teal-400' : integration.status === 'error' ? 'bg-red-400' : 'bg-slate-500'}`} />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium">{integration.name}</span>
                      <Badge className={`${catStyle.bg} ${catStyle.text}`}>
                        {integration.category.replace(/_/g, ' ')}
                      </Badge>
                      <Badge className={STATUS_STYLES[integration.status]}>
                        {integration.status}
                      </Badge>
                    </div>
                    <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                      <span>{integration.provider}</span>
                      <span>&middot;</span>
                      <span className="font-mono">{integration.authType}</span>
                      <span>&middot;</span>
                      <span>{integration.rateLimit} req/min</span>
                      {integration.lastChecked && (
                        <>
                          <span>&middot;</span>
                          <span>Checked {new Date(integration.lastChecked).toLocaleDateString()}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {tr && (
                    <span className={`text-xs font-mono ${tr.ok ? 'text-teal-400' : 'text-red-400'}`}>
                      {tr.ok ? `${tr.latencyMs}ms` : tr.error}
                    </span>
                  )}
                  <button
                    onClick={() => handleTest(integration.id)}
                    disabled={testingId === integration.id}
                    className="text-xs text-slate-400 hover:text-white transition-colors disabled:text-slate-600"
                  >
                    {testingId === integration.id ? 'Testing...' : 'Test'}
                  </button>
                  <button onClick={() => setConfigModalId(integration.id)} className="text-xs text-slate-400 hover:text-white transition-colors">
                    Configure
                  </button>
                  <Toggle checked={integration.isEnabled} onChange={() => setIntegrations((prev) => prev.map((i) => i.id === integration.id ? { ...i, isEnabled: !i.isEnabled } : i))} />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* LLM / AI Analysis Configuration Modal */}
      {configModalId && (() => {
        const configIntegration = integrations.find((i) => i.id === configModalId);
        if (!configIntegration) return null;

        const MODEL_OPTIONS: Record<string, string[]> = {
          Anthropic: ['claude-opus-4-6', 'claude-sonnet-4-5-20250929', 'claude-haiku-4-5-20251001'],
          OpenAI: ['gpt-4o', 'gpt-4o-mini', 'o1-preview'],
          DeepSeek: ['deepseek-chat', 'deepseek-reasoner'],
          OpenRouter: ['auto', 'anthropic/claude-sonnet-4-5-20250929', 'openai/gpt-4o'],
        };

        const TASK_OPTIONS = ['content_analysis', 'image_analysis', 'decision_support', 'osint_agent'];

        const isLlm = configIntegration.category === 'llm';
        const isAiAnalysis = configIntegration.category === 'ai_analysis';

        return (
          <Modal
            isOpen={true}
            onClose={() => setConfigModalId(null)}
            title={`Configure ${configIntegration.name}`}
            size="lg"
          >
            <div className="space-y-5">
              {/* API Key — shown for both LLM and AI Analysis */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">API Key</label>
                <input
                  type="password"
                  placeholder="Enter API key..."
                  value={llmConfig.apiKey}
                  onChange={(e) => setLlmConfig((prev) => ({ ...prev, apiKey: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500"
                />
              </div>

              {isLlm && (
                <>
                  {/* Model Selector */}
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Model</label>
                    <select
                      value={llmConfig.model}
                      onChange={(e) => setLlmConfig((prev) => ({ ...prev, model: e.target.value }))}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-violet-500"
                    >
                      <option value="">Select a model...</option>
                      {(MODEL_OPTIONS[configIntegration.provider] || []).map((model) => (
                        <option key={model} value={model}>{model}</option>
                      ))}
                    </select>
                  </div>

                  {/* Task Assignment */}
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Task Assignment</label>
                    <div className="grid grid-cols-2 gap-2">
                      {TASK_OPTIONS.map((task) => (
                        <label key={task} className="flex items-center gap-2 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg cursor-pointer hover:border-slate-600">
                          <input
                            type="checkbox"
                            checked={llmConfig.tasks.includes(task)}
                            onChange={(e) => {
                              setLlmConfig((prev) => ({
                                ...prev,
                                tasks: e.target.checked
                                  ? [...prev.tasks, task]
                                  : prev.tasks.filter((t) => t !== task),
                              }));
                            }}
                            className="rounded border-slate-600 bg-slate-900 text-violet-600 focus:ring-violet-500"
                          />
                          <span className="text-sm text-slate-300">{task.replace(/_/g, ' ')}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Temperature Slider */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-sm font-medium text-slate-300">Temperature</label>
                      <span className="text-sm font-mono text-violet-400">{llmConfig.temperature.toFixed(1)}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={2}
                      step={0.1}
                      value={llmConfig.temperature}
                      onChange={(e) => setLlmConfig((prev) => ({ ...prev, temperature: parseFloat(e.target.value) }))}
                      className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-violet-600"
                    />
                    <div className="flex justify-between mt-1">
                      <span className="text-[10px] text-slate-600">0.0</span>
                      <span className="text-[10px] text-slate-600">2.0</span>
                    </div>
                  </div>

                  {/* Max Tokens Slider */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-sm font-medium text-slate-300">Max Tokens</label>
                      <span className="text-sm font-mono text-violet-400">{llmConfig.maxTokens}</span>
                    </div>
                    <input
                      type="range"
                      min={256}
                      max={16384}
                      step={256}
                      value={llmConfig.maxTokens}
                      onChange={(e) => setLlmConfig((prev) => ({ ...prev, maxTokens: parseInt(e.target.value) }))}
                      className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-violet-600"
                    />
                    <div className="flex justify-between mt-1">
                      <span className="text-[10px] text-slate-600">256</span>
                      <span className="text-[10px] text-slate-600">16384</span>
                    </div>
                  </div>
                </>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4 border-t border-slate-700/50">
                <button
                  onClick={() => handleTest(configIntegration.id)}
                  disabled={testingId === configIntegration.id}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 text-slate-300 rounded-lg text-sm font-medium transition-colors"
                >
                  {testingId === configIntegration.id ? 'Testing...' : 'Test Connection'}
                </button>
                <button
                  onClick={() => {
                    setIntegrations((prev) =>
                      prev.map((i) =>
                        i.id === configIntegration.id
                          ? { ...i, status: 'connected' as const, isEnabled: true, lastChecked: new Date().toISOString() }
                          : i
                      )
                    );
                    setTestResult((prev) => ({
                      ...prev,
                      [configIntegration.id]: { ok: true, latencyMs: 0 },
                    }));
                    setConfigModalId(null);
                    addToast({ severity: 'success', title: 'Configuration Saved', message: `${configIntegration.name} has been configured and connected.` });
                  }}
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Save Configuration
                </button>
              </div>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
};

// ── 5b. Thresholds Panel ───────────────────────────────────────────

const ThresholdsPanel: FC = () => {
  const isDemoTenant = useIsDemoTenant();
  const { data: initial, isLoading } = useQuery({
    queryKey: ['settings-thresholds'],
    queryFn: mockFetchThresholds,
    enabled: isDemoTenant,
  });

  const [thresholds, setThresholds] = useState<ThresholdEntry[]>([]);
  const [dirty, setDirty] = useState(false);

  React.useEffect(() => {
    if (initial) setThresholds(initial);
  }, [initial]);

  if (!isDemoTenant) {
    return <EmptyTenantState title="No Thresholds Configured" description="Detection thresholds will appear here once AI/ML models are configured and integrations are active." />;
  }

  const updateValue = useCallback((id: string, value: number) => {
    setThresholds((prev) => prev.map((t) => (t.id === id ? { ...t, value } : t)));
    setDirty(true);
  }, []);

  const resetAll = useCallback(() => {
    setThresholds((prev) => prev.map((t) => ({ ...t, value: t.defaultValue })));
    setDirty(true);
  }, []);

  if (isLoading || thresholds.length === 0) return <LoadingState text="Loading thresholds..." />;

  const categories = [...new Set(thresholds.map((t) => t.category))];

  return (
    <div>
      <SectionHeader
        title="Detection Thresholds"
        description="Configure sensitivity levels for AI classification, risk scoring, and alerting. Thresholds marked with a shield require Ethics Board approval to modify."
      />

      {categories.map((category) => (
        <div key={category} className="mb-8">
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">{category}</h3>
          <div className="space-y-3">
            {thresholds
              .filter((t) => t.category === category)
              .map((threshold) => {
                const isDefault = threshold.value === threshold.defaultValue;
                const pct = ((threshold.value - threshold.min) / (threshold.max - threshold.min)) * 100;
                return (
                  <Card key={threshold.id} className="p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium text-sm">{threshold.name}</span>
                        {threshold.requiresApproval && (
                          <Badge className="bg-amber-500/15 text-amber-400 border border-amber-500/30">
                            Ethics Board
                          </Badge>
                        )}
                        {!isDefault && (
                          <Badge className="bg-violet-500/15 text-violet-400">Modified</Badge>
                        )}
                      </div>
                      <span className="text-violet-400 font-mono text-sm font-semibold tabular-nums">
                        {threshold.unit === '%'
                          ? `${(threshold.value * 100).toFixed(0)}%`
                          : `${threshold.value}${threshold.unit ? ' ' + threshold.unit : ''}`}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mb-3">{threshold.description}</p>
                    <div className="relative">
                      <input
                        type="range"
                        min={threshold.min}
                        max={threshold.max}
                        step={threshold.step}
                        value={threshold.value}
                        onChange={(e) => updateValue(threshold.id, parseFloat(e.target.value))}
                        className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-violet-600"
                      />
                      {/* Default marker */}
                      {!isDefault && (
                        <div
                          className="absolute top-0 w-0.5 h-1.5 bg-slate-400 rounded pointer-events-none"
                          style={{ left: `${((threshold.defaultValue - threshold.min) / (threshold.max - threshold.min)) * 100}%` }}
                          title={`Default: ${threshold.defaultValue}`}
                        />
                      )}
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-[10px] text-slate-600">{threshold.min}</span>
                      <span className="text-[10px] text-slate-600">{threshold.max}</span>
                    </div>
                  </Card>
                );
              })}
          </div>
        </div>
      ))}

      {dirty && <SaveBar onSave={() => setDirty(false)} onReset={resetAll} />}
    </div>
  );
};

// ── 5c. Modules Panel ──────────────────────────────────────────────

const ModulesPanel: FC = () => {
  const isDemoTenant = useIsDemoTenant();
  const { data: modules, isLoading } = useQuery({
    queryKey: ['settings-modules'],
    queryFn: mockFetchModules,
    enabled: isDemoTenant,
  });

  const [warrantModal, setWarrantModal] = useState<string | null>(null);

  if (!isDemoTenant) {
    return <EmptyTenantState title="No Modules Activated" description="Platform modules will be available for activation once the tenant environment is provisioned." />;
  }

  if (isLoading || !modules) return <LoadingState text="Loading modules..." />;

  const categories = [...new Set(modules.map((m) => m.category))];
  const enabledCount = modules.filter((m) => m.isEnabled).length;
  const healthyCount = modules.filter((m) => m.healthy).length;

  return (
    <div>
      <SectionHeader
        title="Module Activation"
        description={`Enable or disable platform capabilities. ${enabledCount}/${modules.length} enabled, ${healthyCount}/${modules.length} healthy. Modules with warrant requirements need legal authorization before activation.`}
      />

      {categories.map((category) => (
        <div key={category} className="mb-6">
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">{category}</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {modules
              .filter((m) => m.category === category)
              .map((mod) => (
                <Card
                  key={mod.id}
                  className={`p-4 transition-colors ${mod.isEnabled ? 'border-violet-500/30 bg-violet-500/5' : ''}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`w-2 h-2 rounded-full ${mod.healthy ? 'bg-teal-400' : 'bg-red-400'}`} />
                        <span className="text-white font-medium text-sm">{mod.name}</span>
                        <span className="text-[10px] font-mono text-slate-600">v{mod.version}</span>
                        {mod.requiresWarrant && (
                          <Badge className="bg-amber-500/15 text-amber-400 border border-amber-500/30">
                            WARRANT
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-1">{mod.description}</p>
                      {mod.dependencies.length > 0 && (
                        <div className="flex items-center gap-1 mt-2">
                          <span className="text-[10px] text-slate-600">Requires:</span>
                          {mod.dependencies.map((dep) => (
                            <span key={dep} className="px-1.5 py-0.5 bg-slate-700/50 rounded text-[10px] text-slate-400">
                              {dep}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="ml-3 shrink-0">
                      <Toggle checked={mod.isEnabled} onChange={() => {}} />
                    </div>
                  </div>
                </Card>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
};

// ── 5d. Notifications Panel ────────────────────────────────────────

const NotificationsPanel: FC = () => {
  const isDemoTenant = useIsDemoTenant();
  const { data: channels, isLoading: chLoading } = useQuery({ queryKey: ['settings-channels'], queryFn: mockFetchChannels, enabled: isDemoTenant });
  const { data: rules, isLoading: rLoading } = useQuery({ queryKey: ['settings-notif-rules'], queryFn: mockFetchNotifRules, enabled: isDemoTenant });

  if (!isDemoTenant) {
    return <EmptyTenantState title="No Notifications Configured" description="Set up delivery channels (email, Slack, Teams, webhooks) and notification rules for alert routing." />;
  }

  if (chLoading || rLoading || !channels || !rules) return <LoadingState text="Loading notification settings..." />;

  return (
    <div>
      <SectionHeader
        title="Notifications"
        description="Configure alert delivery channels and notification rules for each event type."
      />

      {/* Channels */}
      <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">Delivery Channels</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
        {channels.map((ch) => (
          <Card key={ch.id} className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">
                  {ch.type === 'email' ? '📧' : ch.type === 'slack' ? '💬' : ch.type === 'teams' ? '🟦' : ch.type === 'webhook' ? '🔗' : '🔔'}
                </span>
                <span className="text-white font-medium text-sm">{ch.label}</span>
              </div>
              <Toggle checked={ch.enabled} onChange={() => {}} />
            </div>
            {Object.entries(ch.config).length > 0 && (
              <div className="mt-2 space-y-1">
                {Object.entries(ch.config).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2 text-xs">
                    <span className="text-slate-500">{k.replace(/_/g, ' ')}:</span>
                    <span className="text-slate-400 font-mono truncate">{v || '(not set)'}</span>
                  </div>
                ))}
              </div>
            )}
            {ch.enabled && (
              <button className="mt-2 text-xs text-violet-400 hover:text-violet-300">Configure</button>
            )}
          </Card>
        ))}
      </div>

      {/* Rules */}
      <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">Notification Rules</h3>
      <div className="space-y-3">
        {rules.map((rule) => (
          <Card key={rule.id} className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-white font-medium text-sm">{rule.label}</span>
                  <Badge
                    className="border"
                    style={{ backgroundColor: `${SEVERITY_COLORS[rule.minSeverity]}15`, color: SEVERITY_COLORS[rule.minSeverity], borderColor: `${SEVERITY_COLORS[rule.minSeverity]}30` } as React.CSSProperties}
                  >
                    {rule.minSeverity}+
                  </Badge>
                </div>
                <p className="text-xs text-slate-500 mt-1">{rule.description}</p>
                <div className="flex gap-1 mt-2">
                  {rule.channels.map((chId) => {
                    const ch = channels.find((c) => c.id === chId);
                    return ch ? (
                      <span key={chId} className="px-1.5 py-0.5 bg-slate-700/50 rounded text-[10px] text-slate-400">
                        {ch.label}
                      </span>
                    ) : null;
                  })}
                </div>
              </div>
              <Toggle checked={rule.enabled} onChange={() => {}} />
            </div>
          </Card>
        ))}
      </div>

      <SaveBar onSave={() => {}} onReset={() => {}} />
    </div>
  );
};

// ── 5e. User Preferences Panel ─────────────────────────────────────

const TIMEZONE_OPTIONS = [
  'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'Europe/London', 'Europe/Berlin', 'Europe/Paris', 'Asia/Tokyo', 'Asia/Shanghai',
  'Australia/Sydney', 'Pacific/Auckland',
];

const DATE_FORMATS = ['YYYY-MM-DD', 'MM/DD/YYYY', 'DD/MM/YYYY', 'DD.MM.YYYY'];
const GRAPH_LAYOUTS = ['cose', 'dagre', 'concentric', 'grid'];
const ITEMS_PER_PAGE_OPTIONS = [10, 25, 50, 100, 200];

const DASHBOARD_WIDGET_OPTIONS = [
  { id: 'risk_timeline', label: 'Risk Timeline' },
  { id: 'alerts_table', label: 'Recent Alerts' },
  { id: 'geo_heatmap', label: 'Geo Heatmap' },
  { id: 'classification_donut', label: 'Classification Donut' },
  { id: 'active_cases', label: 'Active Cases' },
  { id: 'crypto_volume', label: 'Crypto Volume' },
  { id: 'osint_activity', label: 'OSINT Activity' },
  { id: 'grooming_alerts', label: 'Grooming Alerts' },
];

const PreferencesPanel: FC = () => {
  const { data: initial, isLoading } = useQuery({ queryKey: ['settings-prefs'], queryFn: mockFetchPreferences });
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [dirty, setDirty] = useState(false);

  React.useEffect(() => {
    if (initial) setPrefs(initial);
  }, [initial]);

  const update = useCallback(<K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => {
    setPrefs((p) => p ? { ...p, [key]: value } : p);
    setDirty(true);
  }, []);

  if (isLoading || !prefs) return <LoadingState text="Loading preferences..." />;

  return (
    <div>
      <SectionHeader
        title="User Preferences"
        description="Personal display settings for the current user. These do not affect other investigators."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Timezone */}
        <Card className="p-4">
          <label className="text-sm text-white font-medium">Timezone</label>
          <select
            value={prefs.timezone}
            onChange={(e) => update('timezone', e.target.value)}
            className="mt-2 w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
          >
            {TIMEZONE_OPTIONS.map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
        </Card>

        {/* Date format */}
        <Card className="p-4">
          <label className="text-sm text-white font-medium">Date Format</label>
          <select
            value={prefs.dateFormat}
            onChange={(e) => update('dateFormat', e.target.value)}
            className="mt-2 w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
          >
            {DATE_FORMATS.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </Card>

        {/* Items per page */}
        <Card className="p-4">
          <label className="text-sm text-white font-medium">Items Per Page</label>
          <select
            value={prefs.itemsPerPage}
            onChange={(e) => update('itemsPerPage', parseInt(e.target.value))}
            className="mt-2 w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
          >
            {ITEMS_PER_PAGE_OPTIONS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </Card>

        {/* Theme */}
        <Card className="p-4">
          <label className="text-sm text-white font-medium">Theme</label>
          <div className="flex gap-2 mt-2">
            {(['dark', 'light', 'system'] as const).map((t) => (
              <button
                key={t}
                onClick={() => update('theme', t)}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  prefs.theme === t
                    ? 'border-violet-500/50 bg-violet-500/10 text-violet-300'
                    : 'border-slate-700/50 bg-slate-900 text-slate-400 hover:text-slate-300'
                }`}
              >
                {t === 'dark' ? '🌙' : t === 'light' ? '☀️' : '💻'} {t}
              </button>
            ))}
          </div>
        </Card>

        {/* Graph layout */}
        <Card className="p-4">
          <label className="text-sm text-white font-medium">Default Graph Layout</label>
          <select
            value={prefs.graphLayout}
            onChange={(e) => update('graphLayout', e.target.value as UserPreferences['graphLayout'])}
            className="mt-2 w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
          >
            {GRAPH_LAYOUTS.map((l) => (
              <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>
            ))}
          </select>
        </Card>

        {/* Sidebar */}
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm text-white font-medium">Sidebar Collapsed</label>
              <p className="text-xs text-slate-500 mt-1">Start with sidebar collapsed by default</p>
            </div>
            <Toggle checked={prefs.sidebarCollapsed} onChange={() => update('sidebarCollapsed', !prefs.sidebarCollapsed)} />
          </div>
        </Card>
      </div>

      {/* Dashboard widgets */}
      <div className="mt-6">
        <h3 className="text-sm font-semibold text-slate-300 mb-3">Dashboard Widgets</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {DASHBOARD_WIDGET_OPTIONS.map((w) => {
            const enabled = prefs.dashboardWidgets.includes(w.id);
            return (
              <button
                key={w.id}
                onClick={() => {
                  update(
                    'dashboardWidgets',
                    enabled
                      ? prefs.dashboardWidgets.filter((id) => id !== w.id)
                      : [...prefs.dashboardWidgets, w.id],
                  );
                }}
                className={`px-3 py-2 rounded-lg text-sm border transition-colors ${
                  enabled
                    ? 'border-violet-500/50 bg-violet-500/10 text-violet-300'
                    : 'border-slate-700/50 bg-slate-800/50 text-slate-500 hover:text-slate-300'
                }`}
              >
                {w.label}
              </button>
            );
          })}
        </div>
      </div>

      {dirty && <SaveBar onSave={() => setDirty(false)} onReset={() => { if (initial) { setPrefs(initial); setDirty(false); } }} />}
    </div>
  );
};

// ── 5f. Data Retention & Ethical Safeguards ─────────────────────────

const RetentionPanel: FC = () => {
  const isDemoTenant = useIsDemoTenant();
  const { data: policies, isLoading: polLoading } = useQuery({ queryKey: ['settings-retention'], queryFn: mockFetchRetention, enabled: isDemoTenant });
  const { data: ethical, isLoading: ethLoading } = useQuery({ queryKey: ['settings-ethical'], queryFn: mockFetchEthicalSettings, enabled: isDemoTenant });

  if (!isDemoTenant) {
    return <EmptyTenantState title="No Retention Policies Configured" description="Data retention policies and ethical safeguards will be configured during tenant provisioning." />;
  }

  if (polLoading || ethLoading || !policies || !ethical) return <LoadingState text="Loading retention settings..." />;

  return (
    <div>
      <SectionHeader
        title="Data Retention & Ethical Safeguards"
        description="Configure data lifecycle policies and ethical guard rails. Locked settings are enforced by platform architecture and cannot be disabled."
      />

      {/* Ethical settings */}
      <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">Ethical Guard Rails</h3>
      <div className="space-y-3 mb-8">
        {ethical.map((setting) => (
          <Card key={setting.key} className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-white font-medium text-sm">{setting.label}</span>
                  {setting.locked && (
                    <Badge className="bg-slate-600/30 text-slate-400 border border-slate-600/50">
                      Locked
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1">{setting.description}</p>
              </div>
              <Toggle checked={setting.value} onChange={() => {}} disabled={setting.locked} />
            </div>
          </Card>
        ))}
      </div>

      {/* Retention policies */}
      <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">Retention Policies</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/50">
              <th className="text-left text-slate-400 font-medium py-2 px-3">Data Type</th>
              <th className="text-left text-slate-400 font-medium py-2 px-3">Retention</th>
              <th className="text-center text-slate-400 font-medium py-2 px-3">Auto-Purge</th>
              <th className="text-center text-slate-400 font-medium py-2 px-3">Dual Auth</th>
            </tr>
          </thead>
          <tbody>
            {policies.map((p) => (
              <tr key={p.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                <td className="py-3 px-3">
                  <div>
                    <span className="text-slate-200 font-medium">{p.label}</span>
                    <p className="text-xs text-slate-500 mt-0.5">{p.description}</p>
                  </div>
                </td>
                <td className="py-3 px-3">
                  <span className="font-mono text-slate-300">
                    {p.retentionDays === 0 ? 'Immediate' : p.retentionDays >= 365 ? `${(p.retentionDays / 365).toFixed(1)}y` : `${p.retentionDays}d`}
                  </span>
                </td>
                <td className="py-3 px-3 text-center">
                  {p.autoPurge ? (
                    <span className="text-teal-400">Enabled</span>
                  ) : (
                    <span className="text-slate-500">Manual</span>
                  )}
                </td>
                <td className="py-3 px-3 text-center">
                  {p.requiresDualAuth ? (
                    <Badge className="bg-amber-500/15 text-amber-400">Required</Badge>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SaveBar onSave={() => {}} onReset={() => {}} />
    </div>
  );
};

// ── 5g. Security Panel ─────────────────────────────────────────────

const MOCK_USERS: PlatformUser[] = [
  { id: 'pu1', name: 'Platform Admin', email: 'admin@marypoppins.int', role: 'Administrator', status: 'active', mfaEnabled: true, lastLogin: new Date(Date.now() - 600000).toISOString(), createdAt: '2024-01-10T00:00:00Z', tenant: 'tenant-demo' },
  { id: 'pu2', name: 'Jennifer Chen', email: 'j.chen@agency.gov', role: 'Lead Investigator', status: 'active', mfaEnabled: true, lastLogin: new Date(Date.now() - 1800000).toISOString(), createdAt: '2024-02-15T00:00:00Z', tenant: 'tenant-demo' },
  { id: 'pu3', name: 'Marco Rivera', email: 'm.rivera@agency.gov', role: 'Lead Investigator', status: 'active', mfaEnabled: true, lastLogin: new Date(Date.now() - 3600000).toISOString(), createdAt: '2024-02-20T00:00:00Z', tenant: 'tenant-demo' },
  { id: 'pu4', name: 'Alexei Petrov', email: 'a.petrov@agency.gov', role: 'Investigator', status: 'active', mfaEnabled: true, lastLogin: new Date(Date.now() - 7200000).toISOString(), createdAt: '2024-03-01T00:00:00Z', tenant: 'tenant-demo' },
  { id: 'pu5', name: 'Saki Nakamura', email: 's.nakamura@agency.gov', role: 'Investigator', status: 'active', mfaEnabled: true, lastLogin: new Date(Date.now() - 5400000).toISOString(), createdAt: '2024-03-05T00:00:00Z', tenant: 'tenant-demo' },
  { id: 'pu6', name: 'Liam Okafor', email: 'l.okafor@agency.gov', role: 'Investigator', status: 'active', mfaEnabled: true, lastLogin: new Date(Date.now() - 86400000).toISOString(), createdAt: '2024-04-01T00:00:00Z', tenant: 'tenant-demo' },
  { id: 'pu7', name: 'Rachel Thompson', email: 'r.thompson@agency.gov', role: 'Analyst', status: 'active', mfaEnabled: true, lastLogin: new Date(Date.now() - 43200000).toISOString(), createdAt: '2024-04-10T00:00:00Z', tenant: 'tenant-demo' },
  { id: 'pu8', name: 'Dev Kumar', email: 'd.kumar@agency.gov', role: 'Auditor', status: 'active', mfaEnabled: true, lastLogin: new Date(Date.now() - 172800000).toISOString(), createdAt: '2024-05-01T00:00:00Z', tenant: 'tenant-demo' },
];

const ROLE_OPTIONS = ['Administrator', 'Lead Investigator', 'Investigator', 'Analyst', 'Auditor', 'Ethics Board'] as const;

const SecurityPanel: FC = () => {
  const { data: roles, isLoading: rolesLoading } = useQuery({ queryKey: ['settings-roles'], queryFn: mockFetchRoles });
  const { data: sessions, isLoading: sessLoading } = useQuery({ queryKey: ['settings-sessions'], queryFn: mockFetchSessions });

  const [users, setUsers] = useState<PlatformUser[]>(() => loadFromStorage(STORAGE_KEYS.tenantUsers, MOCK_USERS));
  const availableTenants = useMemo(() => loadFromStorage<Tenant[]>(STORAGE_KEYS.tenants, MOCK_TENANTS), []);

  // Persist users to localStorage on change
  useEffect(() => { saveToStorage(STORAGE_KEYS.tenantUsers, users); }, [users]);
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<{ name: string; email: string; password: string; tenant: string } | null>(null);
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [newUser, setNewUser] = useState<{ name: string; email: string; role: string; mfaEnabled: boolean; tenant: string }>({
    name: '',
    email: '',
    role: 'Investigator',
    mfaEnabled: true,
    tenant: 'tenant-demo',
  });

  const handleCreateUser = () => {
    if (!newUser.name.trim() || !newUser.email.trim()) return;
    const tempPassword = generateTempPassword();
    const tenantName = availableTenants.find((t) => t.id === newUser.tenant)?.name ?? newUser.tenant;
    const created: PlatformUser = {
      id: `pu${Date.now()}`,
      name: newUser.name.trim(),
      email: newUser.email.trim(),
      role: newUser.role,
      status: 'active',
      mfaEnabled: newUser.mfaEnabled,
      lastLogin: 'Never',
      createdAt: new Date().toISOString(),
      tenant: newUser.tenant,
    };
    setUsers((prev) => [...prev, created]);
    saveUserCredential({
      email: created.email,
      password: tempPassword,
      name: created.name,
      role: created.role,
      tenantId: newUser.tenant,
      tenantName,
    });
    setCreatedCredentials({ name: created.name, email: created.email, password: tempPassword, tenant: tenantName });
    setCopiedPassword(false);
    setNewUser({ name: '', email: '', role: 'Investigator', mfaEnabled: true, tenant: 'tenant-demo' });
    setShowCreateUserModal(false);
    setShowCredentialsModal(true);
  };

  if (rolesLoading || sessLoading || !roles || !sessions) return <LoadingState text="Loading security settings..." />;

  const totalUsers = roles.reduce((s, r) => s + r.userCount, 0);

  const roleBadgeColors: Record<string, string> = {
    Administrator: 'bg-red-500/15 text-red-400',
    'Lead Investigator': 'bg-violet-500/15 text-violet-400',
    Investigator: 'bg-blue-500/15 text-blue-400',
    Analyst: 'bg-teal-500/15 text-teal-400',
    Auditor: 'bg-amber-500/15 text-amber-400',
    'Ethics Board': 'bg-emerald-500/15 text-emerald-400',
  };

  const statusBadgeColors: Record<string, string> = {
    active: 'bg-teal-500/15 text-teal-400',
    suspended: 'bg-red-500/15 text-red-400',
    pending: 'bg-amber-500/15 text-amber-400',
  };

  return (
    <div>
      <SectionHeader
        title="Security & Access Control"
        description={`RBAC role management via Keycloak OIDC. ${totalUsers} users across ${roles.length} roles. MFA enforcement: TOTP + FIDO2.`}
        action={
          <a
            href="#"
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm font-medium transition-colors"
          >
            Open Keycloak Console
          </a>
        }
      />

      {/* Platform Users */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
          Platform Users <span className="text-slate-500 ml-1">({users.length})</span>
        </h3>
        <button
          onClick={() => setShowCreateUserModal(true)}
          className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-xs font-medium transition-colors"
        >
          + Create User
        </button>
      </div>
      <Card className="overflow-hidden mb-8">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/50 bg-slate-800/30">
              <th className="text-left text-slate-400 font-medium py-2.5 px-4">Name</th>
              <th className="text-left text-slate-400 font-medium py-2.5 px-4">Email</th>
              <th className="text-left text-slate-400 font-medium py-2.5 px-4">Tenant</th>
              <th className="text-left text-slate-400 font-medium py-2.5 px-4">Role</th>
              <th className="text-center text-slate-400 font-medium py-2.5 px-4">Status</th>
              <th className="text-center text-slate-400 font-medium py-2.5 px-4">MFA</th>
              <th className="text-left text-slate-400 font-medium py-2.5 px-4">Last Login</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                <td className="py-2.5 px-4 text-white text-xs font-medium">{u.name}</td>
                <td className="py-2.5 px-4 font-mono text-violet-400 text-xs">{u.email}</td>
                <td className="py-2.5 px-4 text-xs text-slate-400">
                  {u.tenant === 'tenant-demo' ? (
                    <Badge className="bg-amber-500/15 text-amber-400">Demo</Badge>
                  ) : (
                    <span className="text-slate-500 font-mono">{u.tenant.replace('tenant-', '')}</span>
                  )}
                </td>
                <td className="py-2.5 px-4">
                  <Badge className={roleBadgeColors[u.role] || 'bg-slate-500/15 text-slate-400'}>{u.role}</Badge>
                </td>
                <td className="py-2.5 px-4 text-center">
                  <Badge className={statusBadgeColors[u.status]}>{u.status}</Badge>
                </td>
                <td className="py-2.5 px-4 text-center">
                  {u.mfaEnabled ? (
                    <span className="text-teal-400 text-xs">Enabled</span>
                  ) : (
                    <span className="text-red-400 text-xs">Disabled</span>
                  )}
                </td>
                <td className="py-2.5 px-4 text-slate-400 text-xs">
                  {u.lastLogin === 'Never' ? 'Never' : new Date(u.lastLogin).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Create User Modal */}
      <Modal isOpen={showCreateUserModal} onClose={() => setShowCreateUserModal(false)} title="Create User">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Full Name</label>
            <input
              type="text"
              value={newUser.name}
              onChange={(e) => setNewUser((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="e.g. Jane Smith"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-violet-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
            <input
              type="email"
              value={newUser.email}
              onChange={(e) => setNewUser((prev) => ({ ...prev, email: e.target.value }))}
              placeholder="e.g. j.smith@agency.gov"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-violet-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Role</label>
            <select
              value={newUser.role}
              onChange={(e) => setNewUser((prev) => ({ ...prev, role: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-violet-500"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Assign to Tenant</label>
            <select
              value={newUser.tenant}
              onChange={(e) => setNewUser((prev) => ({ ...prev, tenant: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-violet-500"
            >
              {availableTenants.map((t) => (
                <option key={t.id} value={t.id}>{t.name} ({t.slug})</option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-slate-300">Require MFA</label>
            <Toggle checked={newUser.mfaEnabled} onChange={() => setNewUser((prev) => ({ ...prev, mfaEnabled: !prev.mfaEnabled }))} />
          </div>
          <div className="flex gap-3 pt-2 border-t border-slate-700/50">
            <button
              onClick={handleCreateUser}
              disabled={!newUser.name.trim() || !newUser.email.trim()}
              className="flex-1 px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-violet-800 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Create User
            </button>
            <button
              onClick={() => setShowCreateUserModal(false)}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* Credentials Created Modal */}
      <Modal isOpen={showCredentialsModal} onClose={() => setShowCredentialsModal(false)} title="User Created — Temporary Credentials">
        {createdCredentials && (
          <div className="space-y-4">
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
                <span className="text-amber-400 text-sm font-medium">Temporary password — user must change on first login</span>
              </div>
              <p className="text-amber-400/70 text-xs">Keycloak required action: UPDATE_PASSWORD will be set automatically.</p>
            </div>

            <div className="bg-slate-800/50 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Name</span>
                <span className="text-sm text-white font-medium">{createdCredentials.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Email</span>
                <span className="text-sm text-violet-400 font-mono">{createdCredentials.email}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Tenant</span>
                <span className="text-sm text-slate-300">{createdCredentials.tenant}</span>
              </div>
              <div className="border-t border-slate-700/50 pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Temporary Password</span>
                  <div className="flex items-center gap-2">
                    <code className="text-sm text-emerald-400 font-mono bg-slate-900 px-2.5 py-1 rounded select-all">{createdCredentials.password}</code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(createdCredentials.password);
                        setCopiedPassword(true);
                        setTimeout(() => setCopiedPassword(false), 2000);
                      }}
                      className="p-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-400 hover:text-white transition-colors"
                      title="Copy password"
                    >
                      {copiedPassword ? (
                        <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-800/30 rounded-lg p-3 space-y-1.5">
              <p className="text-xs text-slate-400 font-medium">Keycloak provisioning steps:</p>
              <div className="space-y-1 text-xs text-slate-500">
                <p>1. User created in Keycloak realm with temporary password</p>
                <p>2. Required action UPDATE_PASSWORD set on account</p>
                <p>3. Welcome email sent to {createdCredentials.email}</p>
                <p>4. First login forces password change + MFA enrollment</p>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowCredentialsModal(false)}
                className="px-5 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Roles */}
      <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">Roles</h3>
      <div className="space-y-3 mb-8">
        {roles.map((role) => (
          <Card key={role.id} className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-white font-medium">{role.displayName}</span>
                  <span className="text-xs font-mono text-slate-500">{role.name}</span>
                  <Badge className="bg-violet-500/15 text-violet-400">
                    {role.userCount} user{role.userCount !== 1 ? 's' : ''}
                  </Badge>
                </div>
                <p className="text-xs text-slate-500 mt-1">{role.description}</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {role.permissions.slice(0, 8).map((p) => (
                    <span key={p} className="px-1.5 py-0.5 bg-slate-700/50 rounded text-[10px] text-slate-400 font-mono">
                      {p}
                    </span>
                  ))}
                  {role.permissions.length > 8 && (
                    <span className="text-[10px] text-slate-500">+{role.permissions.length - 8} more</span>
                  )}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Active sessions */}
      <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">Active Sessions</h3>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/50 bg-slate-800/30">
              <th className="text-left text-slate-400 font-medium py-2.5 px-4">User</th>
              <th className="text-left text-slate-400 font-medium py-2.5 px-4">IP</th>
              <th className="text-left text-slate-400 font-medium py-2.5 px-4">Client</th>
              <th className="text-left text-slate-400 font-medium py-2.5 px-4">Last Activity</th>
              <th className="text-center text-slate-400 font-medium py-2.5 px-4">MFA</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                <td className="py-2.5 px-4 font-mono text-violet-400 text-xs">{s.userEmail}</td>
                <td className="py-2.5 px-4 font-mono text-slate-300 text-xs">{s.ipAddress}</td>
                <td className="py-2.5 px-4 text-slate-400 text-xs">{s.userAgent}</td>
                <td className="py-2.5 px-4 text-slate-400 text-xs">{new Date(s.lastActivity).toLocaleString()}</td>
                <td className="py-2.5 px-4 text-center">
                  {s.mfaVerified ? (
                    <span className="text-teal-400 text-xs">Verified</span>
                  ) : (
                    <span className="text-red-400 text-xs">Pending</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
};

// ── 5h. System Panel ───────────────────────────────────────────────

const SystemPanel: FC = () => {
  const { data: services, isLoading } = useQuery({
    queryKey: ['settings-services'],
    queryFn: mockFetchServiceHealth,
    refetchInterval: 15_000,
  });

  if (isLoading || !services) return <LoadingState text="Loading system status..." />;

  const healthyCount = services.filter((s) => s.status === 'healthy').length;
  const degradedCount = services.filter((s) => s.status === 'degraded').length;
  const downCount = services.filter((s) => s.status === 'down').length;

  const statusColors: Record<string, string> = {
    healthy: 'bg-teal-400',
    degraded: 'bg-amber-400',
    down: 'bg-red-400',
  };

  return (
    <div>
      <SectionHeader
        title="System Status"
        description={`${healthyCount} healthy, ${degradedCount} degraded, ${downCount} down — ${services.length} total services`}
      />

      {/* Environment info */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card className="p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Environment</p>
          <p className="text-lg font-bold text-amber-400">Development</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Platform Version</p>
          <p className="text-lg font-bold text-white">1.8.0</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Services</p>
          <p className="text-lg font-bold text-teal-400">{healthyCount}/{services.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">API Gateway</p>
          <p className="text-lg font-bold text-violet-400">Kong 3.5</p>
        </Card>
      </div>

      {/* Service grid */}
      <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">Service Health</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {services.map((svc) => (
          <Card key={svc.name} className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${statusColors[svc.status]}`} />
                <span className="text-white font-medium text-sm">{svc.name}</span>
              </div>
              <span className="text-[10px] font-mono text-slate-500">v{svc.version}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Uptime: {svc.uptime}</span>
              {svc.latencyMs > 0 && <span>{svc.latencyMs}ms</span>}
            </div>
          </Card>
        ))}
      </div>

      {/* Build info */}
      <Card className="p-4 mt-6">
        <h3 className="text-sm font-semibold text-slate-300 mb-3">Build Information</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div>
            <span className="text-slate-500">Backend</span>
            <p className="text-slate-200 font-mono mt-0.5">Python 3.12 / FastAPI 0.109</p>
          </div>
          <div>
            <span className="text-slate-500">Frontend</span>
            <p className="text-slate-200 font-mono mt-0.5">React 18.3 / TypeScript 5.4</p>
          </div>
          <div>
            <span className="text-slate-500">Graph DB</span>
            <p className="text-slate-200 font-mono mt-0.5">Neo4j 5.15 / GDS 2.6</p>
          </div>
          <div>
            <span className="text-slate-500">Auth</span>
            <p className="text-slate-200 font-mono mt-0.5">Keycloak 23.0 / OIDC + MFA</p>
          </div>
        </div>
      </Card>
    </div>
  );
};

// ── 5i. AI Models Panel ─────────────────────────────────────────────

interface AIModelConfig {
  id: string;
  name: string;
  version: string;
  task: 'nsfw_detection' | 'nsfl_detection' | 'age_estimation' | 'scene_classification';
  modelType: 'onnx' | 'pytorch' | 'api';
  enabled: boolean;
  weight: number;
  inputSize: string;
  preprocessing: string;
  avgLatencyMs: number;
  totalInferences: number;
  license: string;
  source: string;
  status: 'loaded' | 'ready' | 'disabled' | 'error';
  categories: string[];
}

const TASK_LABELS: Record<string, { label: string; color: string }> = {
  nsfw_detection: { label: 'NSFW Detection', color: 'text-red-400' },
  nsfl_detection: { label: 'NSFL Detection', color: 'text-orange-400' },
  age_estimation: { label: 'Age Estimation', color: 'text-blue-400' },
  scene_classification: { label: 'Scene Classification', color: 'text-emerald-400' },
};

const ENSEMBLE_METHODS = [
  { value: 'weighted_average', label: 'Weighted Average', description: 'Combines scores using configured model weights' },
  { value: 'majority_vote', label: 'Majority Vote', description: 'Uses the category most models agree on' },
  { value: 'max_confidence', label: 'Max Confidence', description: 'Takes the highest-confidence prediction' },
];

const MOCK_AI_MODELS: AIModelConfig[] = [
  {
    id: 'nsfw_detector_v3', name: 'Internal NSFW Detector', version: '3.2.1',
    task: 'nsfw_detection', modelType: 'onnx', enabled: true, weight: 0.30,
    inputSize: '224x224', preprocessing: 'imagenet', avgLatencyMs: 12,
    totalInferences: 284_392, license: 'Proprietary', source: 'Internal',
    status: 'loaded',
    categories: ['explicit_sexual', 'suggestive', 'violence_graphic', 'violence_mild', 'drugs', 'safe'],
  },
  {
    id: 'yahoo_open_nsfw', name: 'Yahoo Open NSFW', version: '1.1.0',
    task: 'nsfw_detection', modelType: 'onnx', enabled: true, weight: 0.30,
    inputSize: '224x224', preprocessing: 'caffe', avgLatencyMs: 8,
    totalInferences: 284_392, license: 'BSD-2-Clause', source: 'Yahoo Research',
    status: 'loaded',
    categories: ['nsfw', 'sfw'],
  },
  {
    id: 'nudenet_v3', name: 'NudeNet', version: '3.4.0',
    task: 'nsfw_detection', modelType: 'onnx', enabled: true, weight: 0.25,
    inputSize: '320x320', preprocessing: 'raw_0_1', avgLatencyMs: 18,
    totalInferences: 284_392, license: 'GPL-3.0', source: 'Open Source',
    status: 'loaded',
    categories: ['nude', 'partially_nude', 'safe'],
  },
  {
    id: 'clip_safety', name: 'CLIP Safety Classifier', version: '1.0.0',
    task: 'nsfw_detection', modelType: 'onnx', enabled: false, weight: 0.15,
    inputSize: '224x224', preprocessing: 'clip', avgLatencyMs: 25,
    totalInferences: 0, license: 'MIT', source: 'OpenAI / Stability',
    status: 'disabled',
    categories: ['safe', 'unsafe'],
  },
  {
    id: 'nsfl_detector_v1', name: 'NSFL Detector', version: '1.0.2',
    task: 'nsfl_detection', modelType: 'onnx', enabled: true, weight: 1.0,
    inputSize: '224x224', preprocessing: 'imagenet', avgLatencyMs: 14,
    totalInferences: 91_205, license: 'Proprietary', source: 'Internal',
    status: 'loaded',
    categories: ['gore', 'violence_graphic', 'shock', 'disturbing', 'safe'],
  },
  {
    id: 'age_estimator_v2', name: 'Age Estimator', version: '2.3.0',
    task: 'age_estimation', modelType: 'onnx', enabled: true, weight: 1.0,
    inputSize: '224x224', preprocessing: 'imagenet', avgLatencyMs: 10,
    totalInferences: 284_392, license: 'Proprietary', source: 'Internal',
    status: 'loaded',
    categories: ['child', 'adolescent', 'adult', 'elderly'],
  },
  {
    id: 'scene_classifier_v1', name: 'Scene Classifier', version: '1.2.0',
    task: 'scene_classification', modelType: 'onnx', enabled: true, weight: 1.0,
    inputSize: '299x299', preprocessing: 'imagenet', avgLatencyMs: 22,
    totalInferences: 284_392, license: 'Proprietary', source: 'Internal',
    status: 'loaded',
    categories: ['indoor_residential', 'indoor_commercial', 'outdoor', 'vehicle', 'online_platform', 'ambiguous'],
  },
];

const LICENSE_COLORS: Record<string, string> = {
  'Proprietary': 'bg-violet-500/15 text-violet-400',
  'BSD-2-Clause': 'bg-blue-500/15 text-blue-400',
  'GPL-3.0': 'bg-amber-500/15 text-amber-400',
  'MIT': 'bg-teal-500/15 text-teal-400',
};

const STATUS_DOT: Record<string, string> = {
  loaded: 'bg-teal-400',
  ready: 'bg-blue-400',
  disabled: 'bg-slate-500',
  error: 'bg-red-400',
};

const AIModelsPanel: FC = () => {
  const isDemoTenant = useIsDemoTenant();
  const [models, setModels] = useState<AIModelConfig[]>(isDemoTenant ? MOCK_AI_MODELS : []);
  const [ensembleMethod, setEnsembleMethod] = useState('weighted_average');
  const [lowAgreementThreshold, setLowAgreementThreshold] = useState(0.6);

  if (!isDemoTenant) {
    return <EmptyTenantState title="No AI Models Registered" description="Register and configure AI/ML models for content classification, grooming detection, and risk scoring." />;
  }

  const toggleModel = useCallback((modelId: string) => {
    setModels((prev) =>
      prev.map((m) =>
        m.id === modelId
          ? { ...m, enabled: !m.enabled, status: m.enabled ? 'disabled' : 'loaded' }
          : m,
      ),
    );
  }, []);

  const updateWeight = useCallback((modelId: string, weight: number) => {
    setModels((prev) =>
      prev.map((m) => (m.id === modelId ? { ...m, weight } : m)),
    );
  }, []);

  const tasks = ['nsfw_detection', 'nsfl_detection', 'age_estimation', 'scene_classification'] as const;

  const enabledCount = models.filter((m) => m.enabled).length;
  const totalInferences = models.reduce((sum, m) => sum + m.totalInferences, 0);
  const avgLatency = Math.round(
    models.filter((m) => m.enabled).reduce((sum, m) => sum + m.avgLatencyMs, 0) /
      Math.max(enabledCount, 1),
  );

  return (
    <div>
      <SectionHeader
        title="AI Model Registry"
        description={`${enabledCount} of ${models.length} models active across ${tasks.length} classification tasks`}
      />

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card className="p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Active Models</p>
          <p className="text-lg font-bold text-teal-400">{enabledCount}/{models.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Total Inferences</p>
          <p className="text-lg font-bold text-white">{totalInferences.toLocaleString()}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Avg Latency</p>
          <p className="text-lg font-bold text-blue-400">{avgLatency}ms</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Ensemble Method</p>
          <p className="text-lg font-bold text-violet-400 capitalize">{ensembleMethod.replace(/_/g, ' ')}</p>
        </Card>
      </div>

      {/* Ensemble configuration */}
      <Card className="p-5 mb-6">
        <h3 className="text-sm font-semibold text-white mb-4">Ensemble Configuration</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-xs text-slate-400 mb-2">Ensemble Method</label>
            <select
              value={ensembleMethod}
              onChange={(e) => setEnsembleMethod(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 text-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
            >
              {ENSEMBLE_METHODS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <p className="text-xs text-slate-500 mt-1">
              {ENSEMBLE_METHODS.find((m) => m.value === ensembleMethod)?.description}
            </p>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-2">
              Low Agreement Threshold: <span className="text-white font-medium">{(lowAgreementThreshold * 100).toFixed(0)}%</span>
            </label>
            <input
              type="range"
              min={0.3}
              max={0.9}
              step={0.05}
              value={lowAgreementThreshold}
              onChange={(e) => setLowAgreementThreshold(parseFloat(e.target.value))}
              className="w-full accent-violet-500"
            />
            <p className="text-xs text-slate-500 mt-1">
              Items below this agreement level are flagged for manual review
            </p>
          </div>
        </div>
      </Card>

      {/* Models grouped by task */}
      {tasks.map((task) => {
        const taskModels = models.filter((m) => m.task === task);
        if (taskModels.length === 0) return null;
        const taskInfo = TASK_LABELS[task];

        return (
          <div key={task} className="mb-8">
            <h3 className={`text-sm font-semibold uppercase tracking-wider mb-3 ${taskInfo.color}`}>
              {taskInfo.label}
              <span className="text-slate-500 font-normal ml-2 normal-case">
                ({taskModels.filter((m) => m.enabled).length}/{taskModels.length} active)
              </span>
            </h3>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {taskModels.map((model) => (
                <Card key={model.id} className={`p-4 ${!model.enabled ? 'opacity-60' : ''}`}>
                  {/* Header row */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${STATUS_DOT[model.status]}`} />
                      <span className="text-white font-medium text-sm">{model.name}</span>
                      <span className="text-[10px] font-mono text-slate-500">v{model.version}</span>
                    </div>
                    <Toggle checked={model.enabled} onChange={() => toggleModel(model.id)} />
                  </div>

                  {/* Model info grid */}
                  <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                    <div>
                      <span className="text-slate-500">Format</span>
                      <p className="text-slate-300 font-mono uppercase">{model.modelType}</p>
                    </div>
                    <div>
                      <span className="text-slate-500">Input</span>
                      <p className="text-slate-300 font-mono">{model.inputSize}</p>
                    </div>
                    <div>
                      <span className="text-slate-500">Preprocessing</span>
                      <p className="text-slate-300 font-mono">{model.preprocessing}</p>
                    </div>
                  </div>

                  {/* Stats row */}
                  <div className="flex items-center gap-4 text-xs text-slate-400 mb-3">
                    <span>Latency: <span className="text-white">{model.avgLatencyMs}ms</span></span>
                    <span>Inferences: <span className="text-white">{model.totalInferences.toLocaleString()}</span></span>
                    <Badge className={LICENSE_COLORS[model.license] || 'bg-slate-500/15 text-slate-400'}>
                      {model.license}
                    </Badge>
                  </div>

                  {/* Weight slider (only for tasks with multiple models) */}
                  {taskModels.length > 1 && (
                    <div>
                      <label className="flex items-center justify-between text-xs text-slate-400 mb-1">
                        <span>Weight</span>
                        <span className="text-white font-medium">{(model.weight * 100).toFixed(0)}%</span>
                      </label>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={model.weight}
                        onChange={(e) => updateWeight(model.id, parseFloat(e.target.value))}
                        disabled={!model.enabled}
                        className="w-full accent-violet-500"
                      />
                    </div>
                  )}

                  {/* Categories */}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {model.categories.map((cat) => (
                      <span key={cat} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-400">
                        {cat}
                      </span>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ── 5j. Tenants Panel ─────────────────────────────────────────────

interface Tenant {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: 'active' | 'suspended' | 'provisioning';
  plan: 'enterprise' | 'standard' | 'demo';
  createdAt: string;
  userCount: number;
  caseCount: number;
  storageUsedGb: number;
  maxStorageGb: number;
  adminEmail: string;
}

const MOCK_TENANTS: Tenant[] = [
  {
    id: 'tenant-demo',
    name: 'Mary Poppins Demo',
    slug: 'demo',
    description: 'Demonstration environment with sample data and pre-configured integrations',
    status: 'active',
    plan: 'demo',
    createdAt: '2024-01-01',
    userCount: 44,
    caseCount: 7,
    storageUsedGb: 2.4,
    maxStorageGb: 50,
    adminEmail: 'admin@marypoppins.int',
  },
  {
    id: 'tenant-empty',
    name: 'New Investigation Unit',
    slug: 'new-unit',
    description: 'Fresh tenant for new investigation unit deployment',
    status: 'provisioning',
    plan: 'enterprise',
    createdAt: '2025-02-10',
    userCount: 0,
    caseCount: 0,
    storageUsedGb: 0,
    maxStorageGb: 500,
    adminEmail: '',
  },
];

const TenantsPanel: FC = () => {
  const { addToast } = useToast();
  const [tenants, setTenants] = useState<Tenant[]>(() => loadFromStorage(STORAGE_KEYS.tenants, MOCK_TENANTS));
  const [tenantUsers, setTenantUsers] = useState<PlatformUser[]>(() => loadFromStorage(STORAGE_KEYS.tenantUsers, MOCK_USERS));

  // Persist to localStorage on change
  useEffect(() => { saveToStorage(STORAGE_KEYS.tenants, tenants); }, [tenants]);
  useEffect(() => { saveToStorage(STORAGE_KEYS.tenantUsers, tenantUsers); }, [tenantUsers]);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [showCreateTenantModal, setShowCreateTenantModal] = useState(false);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [showTenantCredentialsModal, setShowTenantCredentialsModal] = useState(false);
  const [tenantCreatedCreds, setTenantCreatedCreds] = useState<{ name: string; email: string; password: string; tenantName: string } | null>(null);
  const [tenantCopiedPwd, setTenantCopiedPwd] = useState(false);
  const [newTenantName, setNewTenantName] = useState('');
  const [newTenantSlug, setNewTenantSlug] = useState('');
  const [newTenantDescription, setNewTenantDescription] = useState('');
  const [newTenantAdminEmail, setNewTenantAdminEmail] = useState('');
  const [newTenantPlan, setNewTenantPlan] = useState<Tenant['plan']>('standard');
  const [newTenantUser, setNewTenantUser] = useState({ name: '', email: '', role: 'Investigator', mfaEnabled: true });
  const [showResetPlatformModal, setShowResetPlatformModal] = useState(false);
  const [showDeleteTenantModal, setShowDeleteTenantModal] = useState<string | null>(null);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState<string | null>(null); // user email
  const [changePasswordValue, setChangePasswordValue] = useState('');

  const statusColors: Record<Tenant['status'], string> = {
    active: 'bg-emerald-500/20 text-emerald-400',
    suspended: 'bg-red-500/20 text-red-400',
    provisioning: 'bg-amber-500/20 text-amber-400',
  };

  const planColors: Record<Tenant['plan'], string> = {
    enterprise: 'bg-violet-500/20 text-violet-400',
    standard: 'bg-blue-500/20 text-blue-400',
    demo: 'bg-slate-500/20 text-slate-300',
  };

  const roleBadgeColors: Record<string, string> = {
    Administrator: 'bg-red-500/15 text-red-400',
    'Lead Investigator': 'bg-violet-500/15 text-violet-400',
    Investigator: 'bg-blue-500/15 text-blue-400',
    Analyst: 'bg-teal-500/15 text-teal-400',
    Auditor: 'bg-amber-500/15 text-amber-400',
    'Ethics Board': 'bg-emerald-500/15 text-emerald-400',
  };

  const selectedTenant = tenants.find((t) => t.id === selectedTenantId) ?? null;
  const selectedTenantUsers = tenantUsers.filter((u) => u.tenant === selectedTenantId);

  const handleCreateTenant = () => {
    const tenant: Tenant = {
      id: `tenant-${newTenantSlug || Date.now()}`,
      name: newTenantName,
      slug: newTenantSlug,
      description: newTenantDescription,
      status: 'provisioning',
      plan: newTenantPlan,
      createdAt: new Date().toISOString().slice(0, 10),
      userCount: 0,
      caseCount: 0,
      storageUsedGb: 0,
      maxStorageGb: newTenantPlan === 'enterprise' ? 500 : newTenantPlan === 'standard' ? 100 : 50,
      adminEmail: newTenantAdminEmail,
    };
    setTenants((prev) => [...prev, tenant]);
    setNewTenantName('');
    setNewTenantSlug('');
    setNewTenantDescription('');
    setNewTenantAdminEmail('');
    setNewTenantPlan('standard');
    setShowCreateTenantModal(false);
  };

  const handleAddUserToTenant = () => {
    if (!newTenantUser.name.trim() || !newTenantUser.email.trim() || !selectedTenantId) return;
    const tempPassword = generateTempPassword();
    const user: PlatformUser = {
      id: `pu${Date.now()}`,
      name: newTenantUser.name.trim(),
      email: newTenantUser.email.trim(),
      role: newTenantUser.role,
      status: 'active',
      mfaEnabled: newTenantUser.mfaEnabled,
      lastLogin: 'Never',
      createdAt: new Date().toISOString(),
      tenant: selectedTenantId,
    };
    setTenantUsers((prev) => [...prev, user]);
    setTenants((prev) =>
      prev.map((t) => t.id === selectedTenantId ? { ...t, userCount: t.userCount + 1 } : t),
    );
    const resolvedTenantName = selectedTenant?.name ?? selectedTenantId;
    saveUserCredential({
      email: user.email,
      password: tempPassword,
      name: user.name,
      role: user.role,
      tenantId: selectedTenantId,
      tenantName: resolvedTenantName,
    });
    setTenantCreatedCreds({
      name: user.name,
      email: user.email,
      password: tempPassword,
      tenantName: resolvedTenantName,
    });
    setTenantCopiedPwd(false);
    setNewTenantUser({ name: '', email: '', role: 'Investigator', mfaEnabled: true });
    setShowAddUserModal(false);
    setShowTenantCredentialsModal(true);
  };

  const handleActivateTenant = (id: string) => {
    setTenants((prev) => prev.map((t) => t.id === id ? { ...t, status: 'active' } : t));
  };

  const handleSuspendTenant = (id: string) => {
    setTenants((prev) => prev.map((t) => t.id === id ? { ...t, status: 'suspended' } : t));
  };

  const handleResetPlatform = () => {
    setTenants((prev) => prev.filter((t) => t.id === 'tenant-demo'));
    setTenantUsers((prev) => prev.filter((u) => u.tenant === 'tenant-demo'));
    // Remove non-demo credentials from mp-platform-users
    try {
      const raw = localStorage.getItem('mp-platform-users');
      if (raw) {
        const existing: Array<Record<string, unknown>> = JSON.parse(raw);
        const filtered = existing.filter((u) => u.tenantId === 'tenant-demo');
        localStorage.setItem('mp-platform-users', JSON.stringify(filtered));
      }
    } catch { /* ignore */ }
    // Clean any tenant-specific localStorage keys (non-demo)
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('mp-tenant-') && !key.startsWith('mp-tenant-demo')
            && key !== 'mp-tenant-users' && key !== 'mp-tenants') {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    } catch { /* ignore */ }
    localStorage.removeItem('mp-pending-tenant-selection');
    setShowResetPlatformModal(false);
    setSelectedTenantId(null);
    addToast({ severity: 'success', title: 'Platform Reset', message: 'All non-demo tenants and their users have been removed. Demo tenant intact.' });
  };

  const handleDeleteTenant = (tenantId: string) => {
    // Never delete demo tenant
    if (tenantId === 'tenant-demo') {
      addToast({ severity: 'error', title: 'Protected Tenant', message: 'The demo tenant cannot be deleted.' });
      return;
    }
    // Remove all users for this tenant
    removeCredentialsByTenant(tenantId);
    setTenantUsers((prev) => prev.filter((u) => u.tenant !== tenantId));
    setTenants((prev) => prev.filter((t) => t.id !== tenantId));
    setShowDeleteTenantModal(null);
    addToast({ severity: 'success', title: 'Tenant Deleted', message: 'Tenant and all associated users have been removed.' });
  };

  const handleDeleteUser = (user: PlatformUser) => {
    removeUserCredential(user.email, user.tenant);
    setTenantUsers((prev) => prev.filter((u) => u.id !== user.id));
    setTenants((prev) =>
      prev.map((t) => t.id === user.tenant ? { ...t, userCount: Math.max(0, t.userCount - 1) } : t),
    );
    addToast({ severity: 'success', title: 'User Deleted', message: `${user.name} has been removed from the tenant.` });
  };

  const handleResetPassword = (user: PlatformUser) => {
    const tempPassword = generateTempPassword();
    updateUserCredentialPassword(user.email, tempPassword, true);
    const tenant = tenants.find((t) => t.id === user.tenant);
    setTenantCreatedCreds({
      name: user.name,
      email: user.email,
      password: tempPassword,
      tenantName: tenant?.name ?? user.tenant,
    });
    setTenantCopiedPwd(false);
    setShowTenantCredentialsModal(true);
    addToast({ severity: 'success', title: 'Password Reset', message: `Temporary password generated for ${user.name}.` });
  };

  const handleChangePassword = () => {
    if (!showChangePasswordModal || !changePasswordValue.trim()) return;
    updateUserCredentialPassword(showChangePasswordModal, changePasswordValue.trim(), false);
    addToast({ severity: 'success', title: 'Password Changed', message: `Password updated for ${showChangePasswordModal}.` });
    setShowChangePasswordModal(null);
    setChangePasswordValue('');
  };

  // ── Tenant Detail View ──
  if (selectedTenant) {
    const storagePct = selectedTenant.maxStorageGb > 0
      ? Math.round((selectedTenant.storageUsedGb / selectedTenant.maxStorageGb) * 100)
      : 0;

    return (
      <div>
        {/* Back button + header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setSelectedTenantId(null)}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-white">{selectedTenant.name}</h2>
              <span className="text-slate-500 text-xs font-mono">/{selectedTenant.slug}</span>
              {selectedTenant.plan === 'demo' && (
                <Badge className="bg-amber-500/20 text-amber-400">Demo Environment</Badge>
              )}
              <Badge className={statusColors[selectedTenant.status]}>{selectedTenant.status}</Badge>
              <Badge className={planColors[selectedTenant.plan]}>{selectedTenant.plan}</Badge>
            </div>
            <p className="text-sm text-slate-400 mt-1">{selectedTenant.description}</p>
          </div>
        </div>

        {/* Tenant stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <Card className="p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Users</p>
            <p className="text-lg font-bold text-white">{selectedTenantUsers.length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Cases</p>
            <p className="text-lg font-bold text-white">{selectedTenant.caseCount}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Storage</p>
            <p className="text-lg font-bold text-violet-400">{selectedTenant.storageUsedGb}/{selectedTenant.maxStorageGb} GB</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Admin</p>
            <p className="text-sm font-medium text-white truncate">{selectedTenant.adminEmail || '\u2014'}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Created</p>
            <p className="text-sm font-medium text-white">{selectedTenant.createdAt}</p>
          </Card>
        </div>

        {/* Storage bar */}
        <Card className="p-4 mb-6">
          <div className="flex justify-between text-xs mb-2">
            <span className="text-slate-400">Storage Usage</span>
            <span className="text-slate-400">{storagePct}%</span>
          </div>
          <div className="w-full h-2.5 bg-slate-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${storagePct > 80 ? 'bg-red-500' : storagePct > 50 ? 'bg-amber-500' : 'bg-violet-500'}`}
              style={{ width: `${storagePct}%` }}
            />
          </div>
        </Card>

        {/* Tenant actions */}
        <div className="flex gap-2 mb-6">
          {selectedTenant.status === 'provisioning' && (
            <button
              onClick={() => handleActivateTenant(selectedTenant.id)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Activate Tenant
            </button>
          )}
          {selectedTenant.status === 'active' && selectedTenant.plan !== 'demo' && (
            <button
              onClick={() => handleSuspendTenant(selectedTenant.id)}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Suspend Tenant
            </button>
          )}
          {selectedTenant.status === 'suspended' && (
            <button
              onClick={() => handleActivateTenant(selectedTenant.id)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Reactivate Tenant
            </button>
          )}
        </div>

        {/* Tenant users */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
            Tenant Users <span className="text-slate-500 ml-1">({selectedTenantUsers.length})</span>
          </h3>
          <button
            onClick={() => setShowAddUserModal(true)}
            className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-xs font-medium transition-colors"
          >
            + Add User to Tenant
          </button>
        </div>

        {selectedTenantUsers.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-slate-500 text-sm">No users in this tenant yet.</p>
            <button
              onClick={() => setShowAddUserModal(true)}
              className="mt-3 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Add First User
            </button>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50 bg-slate-800/30">
                  <th className="text-left text-slate-400 font-medium py-2.5 px-4">Name</th>
                  <th className="text-left text-slate-400 font-medium py-2.5 px-4">Email</th>
                  <th className="text-left text-slate-400 font-medium py-2.5 px-4">Role</th>
                  <th className="text-center text-slate-400 font-medium py-2.5 px-4">Status</th>
                  <th className="text-center text-slate-400 font-medium py-2.5 px-4">MFA</th>
                  <th className="text-left text-slate-400 font-medium py-2.5 px-4">Last Login</th>
                  <th className="text-right text-slate-400 font-medium py-2.5 px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {selectedTenantUsers.map((u) => (
                  <tr key={u.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="py-2.5 px-4 text-white text-xs font-medium">{u.name}</td>
                    <td className="py-2.5 px-4 font-mono text-violet-400 text-xs">{u.email}</td>
                    <td className="py-2.5 px-4">
                      <Badge className={roleBadgeColors[u.role] || 'bg-slate-500/15 text-slate-400'}>{u.role}</Badge>
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      <Badge className={u.status === 'active' ? 'bg-teal-500/15 text-teal-400' : u.status === 'suspended' ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400'}>{u.status}</Badge>
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      <span className={u.mfaEnabled ? 'text-teal-400 text-xs' : 'text-red-400 text-xs'}>{u.mfaEnabled ? 'Enabled' : 'Disabled'}</span>
                    </td>
                    <td className="py-2.5 px-4 text-slate-400 text-xs">
                      {u.lastLogin === 'Never' ? 'Never' : new Date(u.lastLogin).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleResetPassword(u)}
                          className="px-2 py-1 bg-amber-600/20 hover:bg-amber-600/40 text-amber-400 rounded text-xs font-medium transition-colors"
                          title="Reset password"
                        >
                          Reset Pwd
                        </button>
                        <button
                          onClick={() => { setShowChangePasswordModal(u.email); setChangePasswordValue(''); }}
                          className="px-2 py-1 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 rounded text-xs font-medium transition-colors"
                          title="Change password"
                        >
                          Change Pwd
                        </button>
                        {u.role !== 'Administrator' && (
                          <button
                            onClick={() => handleDeleteUser(u)}
                            className="px-2 py-1 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded text-xs font-medium transition-colors"
                            title="Delete user"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        {/* Add User to Tenant Modal */}
        <Modal isOpen={showAddUserModal} onClose={() => setShowAddUserModal(false)} title={`Add User to ${selectedTenant.name}`}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Full Name</label>
              <input
                type="text"
                value={newTenantUser.name}
                onChange={(e) => setNewTenantUser((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Jane Smith"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-violet-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
              <input
                type="email"
                value={newTenantUser.email}
                onChange={(e) => setNewTenantUser((p) => ({ ...p, email: e.target.value }))}
                placeholder="e.g. j.smith@agency.gov"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-violet-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Role</label>
              <select
                value={newTenantUser.role}
                onChange={(e) => setNewTenantUser((p) => ({ ...p, role: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-violet-500"
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-slate-300">Require MFA</label>
              <Toggle checked={newTenantUser.mfaEnabled} onChange={() => setNewTenantUser((p) => ({ ...p, mfaEnabled: !p.mfaEnabled }))} />
            </div>
            <div className="flex gap-3 pt-2 border-t border-slate-700/50">
              <button
                onClick={handleAddUserToTenant}
                disabled={!newTenantUser.name.trim() || !newTenantUser.email.trim()}
                className="flex-1 px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-violet-800 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Add User
              </button>
              <button
                onClick={() => setShowAddUserModal(false)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </Modal>

        {/* Tenant Credentials Modal */}
        <Modal isOpen={showTenantCredentialsModal} onClose={() => setShowTenantCredentialsModal(false)} title="User Created — Temporary Credentials">
          {tenantCreatedCreds && (
            <div className="space-y-4">
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                  </svg>
                  <span className="text-amber-400 text-sm font-medium">Temporary password — must change on first login</span>
                </div>
                <p className="text-amber-400/70 text-xs">Keycloak required action: UPDATE_PASSWORD</p>
              </div>

              <div className="bg-slate-800/50 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Name</span>
                  <span className="text-sm text-white font-medium">{tenantCreatedCreds.name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Email</span>
                  <span className="text-sm text-violet-400 font-mono">{tenantCreatedCreds.email}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Tenant</span>
                  <span className="text-sm text-slate-300">{tenantCreatedCreds.tenantName}</span>
                </div>
                <div className="border-t border-slate-700/50 pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">Temporary Password</span>
                    <div className="flex items-center gap-2">
                      <code className="text-sm text-emerald-400 font-mono bg-slate-900 px-2.5 py-1 rounded select-all">{tenantCreatedCreds.password}</code>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(tenantCreatedCreds.password);
                          setTenantCopiedPwd(true);
                          setTimeout(() => setTenantCopiedPwd(false), 2000);
                        }}
                        className="p-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-400 hover:text-white transition-colors"
                        title="Copy password"
                      >
                        {tenantCopiedPwd ? (
                          <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-slate-800/30 rounded-lg p-3 space-y-1.5">
                <p className="text-xs text-slate-400 font-medium">Keycloak provisioning:</p>
                <div className="space-y-1 text-xs text-slate-500">
                  <p>1. User created in Keycloak realm for tenant {tenantCreatedCreds.tenantName}</p>
                  <p>2. Required action UPDATE_PASSWORD set</p>
                  <p>3. Welcome email sent to {tenantCreatedCreds.email}</p>
                  <p>4. First login forces password change + MFA enrollment</p>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setShowTenantCredentialsModal(false)}
                  className="px-5 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </Modal>

        {/* Change Password Modal */}
        <Modal isOpen={!!showChangePasswordModal} onClose={() => { setShowChangePasswordModal(null); setChangePasswordValue(''); }} title="Change Password">
          <div className="space-y-4">
            <p className="text-sm text-slate-400">
              Set a new password for <span className="text-violet-400 font-mono">{showChangePasswordModal}</span>
            </p>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">New Password</label>
              <input
                type="text"
                value={changePasswordValue}
                onChange={(e) => setChangePasswordValue(e.target.value)}
                placeholder="Enter new password"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-violet-500"
              />
            </div>
            <div className="flex gap-3 pt-2 border-t border-slate-700/50">
              <button
                onClick={handleChangePassword}
                disabled={!changePasswordValue.trim()}
                className="flex-1 px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-violet-800 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Confirm
              </button>
              <button
                onClick={() => { setShowChangePasswordModal(null); setChangePasswordValue(''); }}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      </div>
    );
  }

  // ── Tenant List View ──
  return (
    <div>
      <SectionHeader
        title="Tenant Management"
        description="Master admin console — create and manage tenant environments for multi-organization deployments"
        action={
          <div className="flex gap-2">
            <button
              onClick={() => setShowResetPlatformModal(true)}
              className="px-4 py-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 text-sm font-medium rounded-lg transition-colors border border-red-500/30"
            >
              Reset Platform
            </button>
            <button
              onClick={() => setShowCreateTenantModal(true)}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              + Create Tenant
            </button>
          </div>
        }
      />

      {/* Admin identity bar */}
      <Card className="p-4 mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center text-white font-bold text-sm">A</div>
          <div>
            <p className="text-white text-sm font-medium">admin / admin_dev</p>
            <p className="text-slate-500 text-xs">Master Administrator — manages all tenants</p>
          </div>
        </div>
        <Badge className="bg-red-500/15 text-red-400">Super Admin</Badge>
      </Card>

      {/* Tenant summary */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <Card className="p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Total Tenants</p>
          <p className="text-lg font-bold text-white">{tenants.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Total Users</p>
          <p className="text-lg font-bold text-violet-400">{tenantUsers.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Active Tenants</p>
          <p className="text-lg font-bold text-teal-400">{tenants.filter((t) => t.status === 'active').length}</p>
        </Card>
      </div>

      {/* Tenant cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {tenants.map((tenant) => {
          const storagePct = tenant.maxStorageGb > 0
            ? Math.round((tenant.storageUsedGb / tenant.maxStorageGb) * 100)
            : 0;
          const tUsers = tenantUsers.filter((u) => u.tenant === tenant.id);
          return (
            <Card key={tenant.id} className="p-5 hover:border-violet-500/30 transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-white font-semibold text-base">{tenant.name}</h3>
                  <span className="text-slate-500 text-xs font-mono">/{tenant.slug}</span>
                </div>
                <div className="flex gap-2 flex-wrap justify-end">
                  {tenant.plan === 'demo' && (
                    <Badge className="bg-amber-500/20 text-amber-400">Demo</Badge>
                  )}
                  <Badge className={statusColors[tenant.status]}>{tenant.status}</Badge>
                  <Badge className={planColors[tenant.plan]}>{tenant.plan}</Badge>
                </div>
              </div>

              <p className="text-slate-400 text-sm mb-4">{tenant.description}</p>

              <div className="grid grid-cols-3 gap-3 text-sm mb-4">
                <div>
                  <span className="text-slate-500 text-xs">Users</span>
                  <p className="text-slate-200 font-medium">{tUsers.length}</p>
                </div>
                <div>
                  <span className="text-slate-500 text-xs">Cases</span>
                  <p className="text-slate-200 font-medium">{tenant.caseCount}</p>
                </div>
                <div>
                  <span className="text-slate-500 text-xs">Admin</span>
                  <p className="text-slate-200 font-medium truncate text-xs">{tenant.adminEmail || '\u2014'}</p>
                </div>
              </div>

              {/* Storage */}
              <div className="mb-4">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-500">Storage</span>
                  <span className="text-slate-400">{tenant.storageUsedGb}/{tenant.maxStorageGb} GB</span>
                </div>
                <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-violet-500 rounded-full" style={{ width: `${storagePct}%` }} />
                </div>
              </div>

              {/* Manage & Delete buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedTenantId(tenant.id)}
                  className="flex-1 px-3 py-2 bg-slate-700/50 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-medium transition-colors border border-slate-700 hover:border-violet-500/30"
                >
                  Manage Tenant
                </button>
                {tenant.id !== 'tenant-demo' && (
                  <button
                    onClick={() => setShowDeleteTenantModal(tenant.id)}
                    className="px-3 py-2 bg-red-600/15 hover:bg-red-600/30 text-red-400 rounded-lg text-xs font-medium transition-colors border border-red-500/20 hover:border-red-500/40"
                    title="Delete tenant"
                  >
                    Delete
                  </button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Create Tenant Modal */}
      <Modal
        isOpen={showCreateTenantModal}
        onClose={() => setShowCreateTenantModal(false)}
        title="Create New Tenant"
        size="lg"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Tenant Name</label>
            <input
              type="text"
              value={newTenantName}
              onChange={(e) => setNewTenantName(e.target.value)}
              placeholder="e.g. Regional Investigation Unit"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-200 text-sm focus:outline-none focus:border-violet-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Slug</label>
            <input
              type="text"
              value={newTenantSlug}
              onChange={(e) => setNewTenantSlug(e.target.value)}
              placeholder="e.g. regional-unit"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-200 text-sm focus:outline-none focus:border-violet-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Description</label>
            <textarea
              value={newTenantDescription}
              onChange={(e) => setNewTenantDescription(e.target.value)}
              rows={2}
              placeholder="Brief description of this tenant environment"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-200 text-sm focus:outline-none focus:border-violet-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Tenant Admin Email</label>
            <input
              type="email"
              value={newTenantAdminEmail}
              onChange={(e) => setNewTenantAdminEmail(e.target.value)}
              placeholder="admin@example.org"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-200 text-sm focus:outline-none focus:border-violet-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Plan</label>
            <select
              value={newTenantPlan}
              onChange={(e) => setNewTenantPlan(e.target.value as Tenant['plan'])}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-200 text-sm focus:outline-none focus:border-violet-500"
            >
              <option value="enterprise">Enterprise</option>
              <option value="standard">Standard</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => setShowCreateTenantModal(false)}
              className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateTenant}
              disabled={!newTenantName.trim() || !newTenantSlug.trim()}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              Create Tenant
            </button>
          </div>
        </div>
      </Modal>

      {/* Reset Platform Confirmation Modal */}
      <Modal isOpen={showResetPlatformModal} onClose={() => setShowResetPlatformModal(false)} title="Reset Platform">
        <div className="space-y-4">
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
              <span className="text-red-400 text-sm font-medium">Destructive Action</span>
            </div>
          </div>
          <p className="text-sm text-slate-300">
            This will remove all non-demo tenants and their users. The Demo tenant will remain intact. Are you sure?
          </p>
          <div className="flex gap-3 pt-2 border-t border-slate-700/50">
            <button
              onClick={handleResetPlatform}
              className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Yes, Reset Platform
            </button>
            <button
              onClick={() => setShowResetPlatformModal(false)}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Tenant Confirmation Modal */}
      <Modal isOpen={!!showDeleteTenantModal} onClose={() => setShowDeleteTenantModal(null)} title="Delete Tenant">
        <div className="space-y-4">
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
              <span className="text-red-400 text-sm font-medium">Destructive Action</span>
            </div>
          </div>
          <p className="text-sm text-slate-300">
            This will permanently delete the tenant <span className="text-white font-medium">{tenants.find((t) => t.id === showDeleteTenantModal)?.name}</span> and all associated users. This action cannot be undone.
          </p>
          <div className="flex gap-3 pt-2 border-t border-slate-700/50">
            <button
              onClick={() => showDeleteTenantModal && handleDeleteTenant(showDeleteTenantModal)}
              className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Yes, Delete Tenant
            </button>
            <button
              onClick={() => setShowDeleteTenantModal(null)}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

/* ================================================================== */
/*  6. MAIN SETTINGS PAGE                                              */
/* ================================================================== */

type SettingsTab =
  | 'integrations'
  | 'thresholds'
  | 'modules'
  | 'notifications'
  | 'preferences'
  | 'retention'
  | 'security'
  | 'system'
  | 'ai_models'
  | 'tenants';

const TAB_DEFS: { id: SettingsTab; label: string }[] = [
  { id: 'integrations', label: 'Integrations' },
  { id: 'thresholds', label: 'Thresholds' },
  { id: 'modules', label: 'Modules' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'preferences', label: 'Preferences' },
  { id: 'retention', label: 'Data & Ethics' },
  { id: 'security', label: 'Security' },
  { id: 'system', label: 'System' },
  { id: 'ai_models', label: 'AI Models' },
  { id: 'tenants', label: 'Tenants' },
];

const SettingsPage: FC = () => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('integrations');

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-200">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <p className="text-slate-400 mt-1">
            Platform configuration, integrations, ethical safeguards, and system administration
          </p>
        </div>

        {/* Tab navigation */}
        <div className="flex gap-1 mb-8 border-b border-slate-700/50 overflow-x-auto">
          {TAB_DEFS.map((tab) => (
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

        {/* Tab content */}
        <div>
          {activeTab === 'integrations' && <IntegrationsPanel />}
          {activeTab === 'thresholds' && <ThresholdsPanel />}
          {activeTab === 'modules' && <ModulesPanel />}
          {activeTab === 'notifications' && <NotificationsPanel />}
          {activeTab === 'preferences' && <PreferencesPanel />}
          {activeTab === 'retention' && <RetentionPanel />}
          {activeTab === 'security' && <SecurityPanel />}
          {activeTab === 'system' && <SystemPanel />}
          {activeTab === 'ai_models' && <AIModelsPanel />}
          {activeTab === 'tenants' && <TenantsPanel />}
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;

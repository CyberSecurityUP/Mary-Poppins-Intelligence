/**
 * Mary Poppins Digital Intelligence Platform
 * Main Dashboard Page
 *
 * Comprehensive overview including:
 * - Summary metric cards (Active Cases, Open Alerts, Content Analyzed, OSINT Queries, Active Crawlers)
 * - Risk timeline chart (ECharts line)
 * - Alert severity distribution (donut chart)
 * - Recent alerts table
 * - Active investigations sidebar
 * - Content classification breakdown (bar chart)
 * - Geographic heatmap placeholder (Leaflet)
 * - Crypto transaction volume chart
 * - Quick action buttons
 *
 * All data is fetched via React Query with mocked API calls and full TypeScript interfaces.
 */

import React, { useCallback, useMemo, useRef, useEffect, useState, type FC } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import ReactECharts from 'echarts-for-react';
import { MapContainer, TileLayer, CircleMarker, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useAuth, useIsDemoTenant } from '../App';

/* ------------------------------------------------------------------ */
/*  TypeScript Interfaces                                             */
/* ------------------------------------------------------------------ */

/** Severity enum used across alerts and cases. */
export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/** Status for alerts and cases. */
export type AlertStatus = 'open' | 'acknowledged' | 'investigating' | 'resolved' | 'false_positive';
export type CaseStatus = 'open' | 'active' | 'pending_review' | 'closed' | 'archived';
export type CasePriority = 'critical' | 'high' | 'medium' | 'low';
export type InvestigationStatus = 'active' | 'paused' | 'completed';

/** Content classification labels produced by the ML pipeline. */
export type ContentClassification = 'safe' | 'suggestive' | 'nsfw' | 'csam_suspect';

/** Summary metrics displayed in top-level cards. */
export interface DashboardMetrics {
  activeCases: number;
  activeCasesDelta: number;
  openAlerts: AlertSeverityBreakdown;
  openAlertsDelta: number;
  contentAnalyzed24h: number;
  contentAnalyzedDelta: number;
  osintQueries24h: number;
  osintQueriesDelta: number;
  activeCrawlers: number;
  activeCrawlersTotal: number;
}

export interface AlertSeverityBreakdown {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  total: number;
}

/** Risk timeline data point for the line chart. */
export interface RiskTimelinePoint {
  timestamp: string;
  overallRisk: number;
  contentRisk: number;
  darkWebRisk: number;
  cryptoRisk: number;
}

/** Alert severity distribution for the donut chart. */
export interface SeverityDistribution {
  severity: AlertSeverity;
  count: number;
  color: string;
}

/** Recent alert entry for the alerts table. */
export interface RecentAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  source: string;
  timestamp: string;
  status: AlertStatus;
  caseId?: string;
}

/** Active investigation entry. */
export interface ActiveInvestigation {
  id: string;
  name: string;
  caseId: string;
  status: InvestigationStatus;
  entityCount: number;
  lastActivity: string;
  leadAnalyst: string;
  priority: CasePriority;
}

/** Content classification breakdown for the bar chart. */
export interface ContentClassificationData {
  label: ContentClassification;
  count: number;
  percentage: number;
}

/** Geographic point for the IP heatmap. */
export interface GeoPoint {
  id: string;
  lat: number;
  lng: number;
  label: string;
  count: number;
  severity: AlertSeverity;
}

/** Crypto transaction volume data point. */
export interface CryptoVolumePoint {
  date: string;
  btcVolume: number;
  ethVolume: number;
  usdtVolume: number;
  suspiciousCount: number;
}

/** Grooming detection summary data. */
export interface GroomingSummary {
  activeMonitors: number;
  conversationsAnalyzed24h: number;
  alertsRaised24h: number;
  stageBreakdown: { stage: string; count: number; color: string }[];
  recentDetections: {
    id: string;
    riskScore: number;
    stage: string;
    platform: string;
    timestamp: string;
    caseId: string | null;
  }[];
}

/** Dark web monitor status. */
export interface DarkWebMonitorData {
  activeCrawlers: number;
  totalCrawlers: number;
  pagesIndexed24h: number;
  newSightings24h: number;
  recentSightings: {
    id: string;
    type: 'marketplace' | 'forum' | 'paste' | 'onion_site';
    title: string;
    severity: AlertSeverity;
    timestamp: string;
    url: string;
  }[];
  forumActivity: { forum: string; posts24h: number; color: string }[];
}

/** Hash match activity data. */
export interface HashMatchData {
  totalMatches24h: number;
  matchesByDb: { database: string; matches: number; color: string }[];
  matchesByHour: { hour: string; ncmec: number; interpol: number; photodna: number }[];
  recentMatches: {
    id: string;
    hashType: 'pHash' | 'PDQ' | 'PhotoDNA';
    database: string;
    hammingDistance: number;
    confidence: number;
    timestamp: string;
    caseId: string | null;
  }[];
}

/** OSINT activity feed. */
export interface OsintActivityData {
  queriesByType: { type: string; count: number; color: string }[];
  findingsTotal24h: number;
  breachesDetected24h: number;
  recentSearches: {
    id: string;
    queryType: string;
    queryValue: string;
    findingCount: number;
    timestamp: string;
    analyst: string;
  }[];
}

/** Case pipeline breakdown. */
export interface CasePipelineData {
  byStatus: { status: string; count: number; color: string }[];
  byPriority: { priority: string; count: number; color: string }[];
  avgResolutionDays: number;
  casesTrend: { date: string; opened: number; closed: number }[];
}

/** Top risk entities for triage. */
export interface RiskEntity {
  id: string;
  label: string;
  entityType: string;
  riskScore: number;
  caseId: string | null;
  lastSeen: string;
  indicators: string[];
}

/** Service health for the status strip. */
export interface ServiceHealthEntry {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  latencyMs: number;
}

/** Audit log ticker entry. */
export interface AuditTickerEntry {
  id: string;
  action: string;
  user: string;
  resource: string;
  timestamp: string;
}

/** Full dashboard API response. */
export interface DashboardData {
  metrics: DashboardMetrics;
  riskTimeline: RiskTimelinePoint[];
  severityDistribution: SeverityDistribution[];
  recentAlerts: RecentAlert[];
  activeInvestigations: ActiveInvestigation[];
  contentClassification: ContentClassificationData[];
  geoPoints: GeoPoint[];
  cryptoVolume: CryptoVolumePoint[];
  groomingSummary: GroomingSummary;
  darkWebMonitor: DarkWebMonitorData;
  hashMatches: HashMatchData;
  osintActivity: OsintActivityData;
  casePipeline: CasePipelineData;
  topRiskEntities: RiskEntity[];
  serviceHealth: ServiceHealthEntry[];
  auditTicker: AuditTickerEntry[];
  lastUpdated: string;
}

/* ------------------------------------------------------------------ */
/*  Color constants (matching brand palette)                          */
/* ------------------------------------------------------------------ */

const COLORS = {
  navy: '#0F172A',
  navyLight: '#1E293B',
  purple: '#6D28D9',
  purpleLight: '#7C3AED',
  teal: '#14B8A6',
  tealLight: '#2DD4BF',
  red: '#EF4444',
  redLight: '#F87171',
  gold: '#F59E0B',
  goldLight: '#FBBF24',
  blue: '#3B82F6',
  orange: '#F97316',
  slate100: '#F8FAFC',
  slate300: '#CBD5E1',
  slate400: '#94A3B8',
  slate500: '#64748B',
  slate600: '#475569',
  slate700: '#334155',
  slate800: '#1E293B',
} as const;

/* ------------------------------------------------------------------ */
/*  Mock API functions                                                */
/* ------------------------------------------------------------------ */

/** Simulate network latency. */
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Generate mock dashboard data with realistic values. */
async function fetchDashboardData(): Promise<DashboardData> {
  await delay(600);

  const now = new Date();

  // --- Metrics ---
  const metrics: DashboardMetrics = {
    activeCases: 47,
    activeCasesDelta: 3,
    openAlerts: {
      critical: 4,
      high: 12,
      medium: 28,
      low: 53,
      info: 19,
      total: 116,
    },
    openAlertsDelta: -7,
    contentAnalyzed24h: 12_847,
    contentAnalyzedDelta: 2_341,
    osintQueries24h: 3_219,
    osintQueriesDelta: 412,
    activeCrawlers: 8,
    activeCrawlersTotal: 12,
  };

  // --- Risk Timeline (last 24h, hourly) ---
  const riskTimeline: RiskTimelinePoint[] = Array.from({ length: 24 }, (_, i) => {
    const ts = new Date(now.getTime() - (23 - i) * 3600_000);
    return {
      timestamp: ts.toISOString(),
      overallRisk: 35 + Math.floor(Math.random() * 40),
      contentRisk: 20 + Math.floor(Math.random() * 50),
      darkWebRisk: 15 + Math.floor(Math.random() * 35),
      cryptoRisk: 10 + Math.floor(Math.random() * 30),
    };
  });

  // --- Severity Distribution ---
  const severityDistribution: SeverityDistribution[] = [
    { severity: 'critical', count: 4, color: COLORS.red },
    { severity: 'high', count: 12, color: COLORS.orange },
    { severity: 'medium', count: 28, color: COLORS.gold },
    { severity: 'low', count: 53, color: COLORS.blue },
    { severity: 'info', count: 19, color: COLORS.slate500 },
  ];

  // --- Recent Alerts ---
  const alertSources = ['Dark Web Monitor', 'Content Pipeline', 'Crypto Tracer', 'OSINT Engine', 'Threat Intel Feed'];
  const alertTitles: Record<AlertSeverity, string[]> = {
    critical: [
      'CSAM content detected in upload batch #4821',
      'Known offender identity matched via facial recognition',
      'Cryptocurrency tumbler pattern linked to known trafficking ring',
    ],
    high: [
      'Suspicious TOR hidden service mentions platform keywords',
      'Unusual BTC transaction cluster exceeding $500K',
      'New dark web marketplace listing matches case #MP-2024-0312',
    ],
    medium: [
      'OSINT query returned new social media account for POI',
      'Content classification confidence below threshold for batch #4819',
      'Crypto wallet address appeared in two unrelated investigations',
    ],
    low: [
      'Scheduled crawler completed with 12 new pages indexed',
      'WHOIS data changed for monitored domain',
      'New Telegram channel detected in monitored keyword group',
    ],
    info: [
      'Daily content analysis report generated',
      'Crawler health check: all services operational',
      'OSINT data enrichment completed for 47 entities',
    ],
  };
  const statuses: AlertStatus[] = ['open', 'acknowledged', 'investigating', 'resolved'];

  const recentAlerts: RecentAlert[] = Array.from({ length: 15 }, (_, i) => {
    const severities: AlertSeverity[] = ['critical', 'high', 'medium', 'low', 'info'];
    const sev = severities[Math.min(i < 2 ? 0 : i < 5 ? 1 : i < 9 ? 2 : i < 13 ? 3 : 4, severities.length - 1)];
    const titles = alertTitles[sev];
    return {
      id: `ALR-${String(1000 + i).padStart(6, '0')}`,
      severity: sev,
      title: titles[i % titles.length],
      source: alertSources[i % alertSources.length],
      timestamp: new Date(now.getTime() - i * 1_800_000).toISOString(),
      status: statuses[i % statuses.length],
      caseId: i < 8 ? `MP-2024-${String(300 + i).padStart(4, '0')}` : undefined,
    };
  });

  // --- Active Investigations ---
  const investigationNames = [
    'Operation Nightwatch',
    'Project Lighthouse',
    'Case Umbrella Alpha',
    'Taskforce Meridian',
    'Op Dark Tide',
  ];
  const analysts = ['J. Banks', 'M. Andrews', 'B. Robertson', 'E. Clark', 'S. Patel'];

  const activeInvestigations: ActiveInvestigation[] = investigationNames.map((name, i) => ({
    id: `INV-${String(100 + i).padStart(4, '0')}`,
    name,
    caseId: `MP-2024-${String(300 + i).padStart(4, '0')}`,
    status: (i < 3 ? 'active' : 'paused') as InvestigationStatus,
    entityCount: 15 + Math.floor(Math.random() * 80),
    lastActivity: new Date(now.getTime() - i * 3_600_000 * (1 + Math.random())).toISOString(),
    leadAnalyst: analysts[i],
    priority: (['critical', 'high', 'high', 'medium', 'low'] as CasePriority[])[i],
  }));

  // --- Content Classification ---
  const contentClassification: ContentClassificationData[] = [
    { label: 'safe', count: 11_204, percentage: 87.2 },
    { label: 'suggestive', count: 982, percentage: 7.6 },
    { label: 'nsfw', count: 548, percentage: 4.3 },
    { label: 'csam_suspect', count: 113, percentage: 0.9 },
  ];

  // --- Geo Points ---
  const geoPoints: GeoPoint[] = [
    { id: 'geo-1', lat: 51.5074, lng: -0.1278, label: 'London, UK', count: 234, severity: 'high' },
    { id: 'geo-2', lat: 40.7128, lng: -74.006, label: 'New York, US', count: 189, severity: 'medium' },
    { id: 'geo-3', lat: 48.8566, lng: 2.3522, label: 'Paris, France', count: 145, severity: 'medium' },
    { id: 'geo-4', lat: 55.7558, lng: 37.6173, label: 'Moscow, Russia', count: 312, severity: 'critical' },
    { id: 'geo-5', lat: 35.6762, lng: 139.6503, label: 'Tokyo, Japan', count: 87, severity: 'low' },
    { id: 'geo-6', lat: -33.8688, lng: 151.2093, label: 'Sydney, Australia', count: 63, severity: 'low' },
    { id: 'geo-7', lat: 1.3521, lng: 103.8198, label: 'Singapore', count: 178, severity: 'high' },
    { id: 'geo-8', lat: 52.52, lng: 13.405, label: 'Berlin, Germany', count: 124, severity: 'medium' },
    { id: 'geo-9', lat: -23.5505, lng: -46.6333, label: 'Sao Paulo, Brazil', count: 201, severity: 'high' },
    { id: 'geo-10', lat: 37.5665, lng: 126.978, label: 'Seoul, South Korea', count: 96, severity: 'medium' },
    { id: 'geo-11', lat: 19.076, lng: 72.8777, label: 'Mumbai, India', count: 267, severity: 'high' },
    { id: 'geo-12', lat: 25.2048, lng: 55.2708, label: 'Dubai, UAE', count: 143, severity: 'medium' },
  ];

  // --- Crypto Volume (last 14 days) ---
  const cryptoVolume: CryptoVolumePoint[] = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(now.getTime() - (13 - i) * 86_400_000);
    return {
      date: d.toISOString().split('T')[0],
      btcVolume: 12 + Math.random() * 25,
      ethVolume: 80 + Math.random() * 120,
      usdtVolume: 150_000 + Math.random() * 300_000,
      suspiciousCount: Math.floor(Math.random() * 20),
    };
  });

  // --- Grooming Summary ---
  const groomingStages = [
    { stage: 'Friendship Forming', count: 24, color: COLORS.blue },
    { stage: 'Relationship Forming', count: 18, color: COLORS.teal },
    { stage: 'Risk Assessment', count: 12, color: COLORS.gold },
    { stage: 'Exclusivity', count: 8, color: COLORS.orange },
    { stage: 'Sexual Stage', count: 5, color: COLORS.red },
    { stage: 'Compliance', count: 2, color: '#DC2626' },
  ];
  const groomingPlatforms = ['Discord', 'Telegram', 'Instagram DM', 'Snapchat', 'WhatsApp', 'Omegle'];
  const groomingSummary: GroomingSummary = {
    activeMonitors: 342,
    conversationsAnalyzed24h: 8_421,
    alertsRaised24h: 17,
    stageBreakdown: groomingStages,
    recentDetections: Array.from({ length: 6 }, (_, i) => ({
      id: `GRM-${String(500 + i).padStart(5, '0')}`,
      riskScore: 0.5 + Math.random() * 0.5,
      stage: groomingStages[Math.min(i, groomingStages.length - 1)].stage,
      platform: groomingPlatforms[i % groomingPlatforms.length],
      timestamp: new Date(now.getTime() - i * 2_400_000).toISOString(),
      caseId: i < 3 ? `MP-2024-${String(320 + i).padStart(4, '0')}` : null,
    })),
  };

  // --- Dark Web Monitor ---
  const darkWebMonitor: DarkWebMonitorData = {
    activeCrawlers: 8,
    totalCrawlers: 12,
    pagesIndexed24h: 4_287,
    newSightings24h: 23,
    recentSightings: [
      { id: 'dw-1', type: 'marketplace', title: 'New listing on Genesis Market matches POI fingerprint', severity: 'critical', timestamp: new Date(now.getTime() - 1_800_000).toISOString(), url: 'http://genesis[.]onion/...' },
      { id: 'dw-2', type: 'forum', title: 'Subject alias detected in Dread forum post', severity: 'high', timestamp: new Date(now.getTime() - 5_400_000).toISOString(), url: 'http://dread[.]onion/...' },
      { id: 'dw-3', type: 'paste', title: 'Credential dump contains monitored email addresses', severity: 'high', timestamp: new Date(now.getTime() - 7_200_000).toISOString(), url: 'http://paste[.]onion/...' },
      { id: 'dw-4', type: 'onion_site', title: 'Newly discovered .onion hosting suspected CSAM keywords', severity: 'critical', timestamp: new Date(now.getTime() - 10_800_000).toISOString(), url: 'http://suspect[.]onion' },
      { id: 'dw-5', type: 'forum', title: 'PGP key match with known suspect in dark forum', severity: 'medium', timestamp: new Date(now.getTime() - 14_400_000).toISOString(), url: 'http://forum[.]onion/...' },
    ],
    forumActivity: [
      { forum: 'Dread', posts24h: 847, color: COLORS.purple },
      { forum: 'BreachForums', posts24h: 612, color: COLORS.red },
      { forum: 'XSS', posts24h: 389, color: COLORS.gold },
      { forum: 'Exploit.in', posts24h: 245, color: COLORS.orange },
      { forum: 'RaidForums Mirror', posts24h: 178, color: COLORS.blue },
    ],
  };

  // --- Hash Matches ---
  const hashMatches: HashMatchData = {
    totalMatches24h: 87,
    matchesByDb: [
      { database: 'NCMEC', matches: 42, color: COLORS.red },
      { database: 'INTERPOL ICSE', matches: 28, color: COLORS.orange },
      { database: 'PhotoDNA Cloud', matches: 17, color: COLORS.purple },
    ],
    matchesByHour: Array.from({ length: 24 }, (_, i) => ({
      hour: `${String(i).padStart(2, '0')}:00`,
      ncmec: Math.floor(Math.random() * 5),
      interpol: Math.floor(Math.random() * 4),
      photodna: Math.floor(Math.random() * 3),
    })),
    recentMatches: Array.from({ length: 5 }, (_, i) => ({
      id: `HM-${String(200 + i).padStart(5, '0')}`,
      hashType: (['pHash', 'PDQ', 'PhotoDNA'] as const)[i % 3],
      database: ['NCMEC', 'INTERPOL ICSE', 'PhotoDNA Cloud'][i % 3],
      hammingDistance: Math.floor(Math.random() * 8) + 1,
      confidence: 0.85 + Math.random() * 0.15,
      timestamp: new Date(now.getTime() - i * 3_600_000).toISOString(),
      caseId: i < 3 ? `MP-2024-${String(310 + i).padStart(4, '0')}` : null,
    })),
  };

  // --- OSINT Activity ---
  const osintActivity: OsintActivityData = {
    queriesByType: [
      { type: 'Email', count: 892, color: '#8B5CF6' },
      { type: 'Username', count: 734, color: COLORS.teal },
      { type: 'Domain', count: 521, color: COLORS.purple },
      { type: 'Phone', count: 412, color: COLORS.gold },
      { type: 'IP Address', count: 387, color: COLORS.red },
      { type: 'Name', count: 198, color: COLORS.blue },
      { type: 'Social', count: 75, color: '#EC4899' },
    ],
    findingsTotal24h: 4_812,
    breachesDetected24h: 234,
    recentSearches: [
      { id: 'os-1', queryType: 'email', queryValue: 'suspect42@protonmail.com', findingCount: 8, timestamp: new Date(now.getTime() - 600_000).toISOString(), analyst: 'J. Banks' },
      { id: 'os-2', queryType: 'username', queryValue: 'darkphoenix99', findingCount: 14, timestamp: new Date(now.getTime() - 1_200_000).toISOString(), analyst: 'M. Andrews' },
      { id: 'os-3', queryType: 'domain', queryValue: 'suspicious-shop.net', findingCount: 6, timestamp: new Date(now.getTime() - 2_400_000).toISOString(), analyst: 'B. Robertson' },
      { id: 'os-4', queryType: 'ip_address', queryValue: '185.220.101.42', findingCount: 4, timestamp: new Date(now.getTime() - 3_600_000).toISOString(), analyst: 'E. Clark' },
      { id: 'os-5', queryType: 'phone', queryValue: '+44 7911 ******', findingCount: 3, timestamp: new Date(now.getTime() - 5_400_000).toISOString(), analyst: 'S. Patel' },
    ],
  };

  // --- Case Pipeline ---
  const casePipeline: CasePipelineData = {
    byStatus: [
      { status: 'Open', count: 12, color: COLORS.red },
      { status: 'Active', count: 23, color: COLORS.teal },
      { status: 'Pending Review', count: 8, color: COLORS.gold },
      { status: 'Closed', count: 156, color: COLORS.blue },
      { status: 'Archived', count: 89, color: COLORS.slate500 },
    ],
    byPriority: [
      { priority: 'Critical', count: 5, color: COLORS.red },
      { priority: 'High', count: 14, color: COLORS.orange },
      { priority: 'Medium', count: 16, color: COLORS.gold },
      { priority: 'Low', count: 12, color: COLORS.blue },
    ],
    avgResolutionDays: 18.4,
    casesTrend: Array.from({ length: 30 }, (_, i) => {
      const d = new Date(now.getTime() - (29 - i) * 86_400_000);
      return {
        date: d.toISOString().split('T')[0],
        opened: Math.floor(Math.random() * 4) + 1,
        closed: Math.floor(Math.random() * 5),
      };
    }),
  };

  // --- Top Risk Entities ---
  const entityTypes = ['Person', 'Wallet', 'Domain', 'Email', 'IP Address', 'Phone'];
  const topRiskEntities: RiskEntity[] = [
    { id: 'ent-1', label: 'bc1q...7x4m', entityType: 'Wallet', riskScore: 0.97, caseId: 'MP-2024-0301', lastSeen: new Date(now.getTime() - 600_000).toISOString(), indicators: ['Mixer exposure', 'Darknet market', 'High volume'] },
    { id: 'ent-2', label: 'darkphoenix99', entityType: 'Person', riskScore: 0.94, caseId: 'MP-2024-0303', lastSeen: new Date(now.getTime() - 1_200_000).toISOString(), indicators: ['CSAM forum', 'Multiple aliases', 'Crypto link'] },
    { id: 'ent-3', label: '185.220.101.42', entityType: 'IP Address', riskScore: 0.91, caseId: 'MP-2024-0305', lastSeen: new Date(now.getTime() - 3_600_000).toISOString(), indicators: ['Tor exit', 'Abuse reports', 'Dark web host'] },
    { id: 'ent-4', label: 'suspect-market.onion', entityType: 'Domain', riskScore: 0.89, caseId: null, lastSeen: new Date(now.getTime() - 7_200_000).toISOString(), indicators: ['CSAM keywords', 'New listing', 'Crypto payments'] },
    { id: 'ent-5', label: '0x4a3...f821', entityType: 'Wallet', riskScore: 0.86, caseId: 'MP-2024-0312', lastSeen: new Date(now.getTime() - 14_400_000).toISOString(), indicators: ['Tornado Cash', 'Ransomware link'] },
    { id: 'ent-6', label: 'j.smith_anon@tutanota.com', entityType: 'Email', riskScore: 0.82, caseId: 'MP-2024-0308', lastSeen: new Date(now.getTime() - 18_000_000).toISOString(), indicators: ['Breach data', 'Dark web mention'] },
    { id: 'ent-7', label: '+7 916 ***-**-42', entityType: 'Phone', riskScore: 0.78, caseId: null, lastSeen: new Date(now.getTime() - 36_000_000).toISOString(), indicators: ['Linked to suspect', 'VoIP'] },
  ];

  // --- Service Health ---
  const serviceHealth: ServiceHealthEntry[] = [
    { name: 'API', status: 'healthy', latencyMs: 12 },
    { name: 'PostgreSQL', status: 'healthy', latencyMs: 3 },
    { name: 'Neo4j', status: 'healthy', latencyMs: 8 },
    { name: 'Elasticsearch', status: 'healthy', latencyMs: 15 },
    { name: 'Redis', status: 'healthy', latencyMs: 1 },
    { name: 'Kafka', status: 'healthy', latencyMs: 5 },
    { name: 'Keycloak', status: 'healthy', latencyMs: 22 },
    { name: 'Classifier', status: 'healthy', latencyMs: 0 },
    { name: 'Tor Proxy', status: 'degraded', latencyMs: 450 },
    { name: 'MinIO', status: 'healthy', latencyMs: 4 },
  ];

  // --- Audit Ticker ---
  const auditActions = ['osint.query', 'case.update', 'classify.review', 'crypto.trace', 'export.request', 'alert.acknowledge', 'graph.expand', 'darkweb.crawl'];
  const auditTicker: AuditTickerEntry[] = Array.from({ length: 12 }, (_, i) => ({
    id: `aud-${1000 + i}`,
    action: auditActions[i % auditActions.length],
    user: analysts[i % analysts.length],
    resource: `MP-2024-${String(300 + (i % 8)).padStart(4, '0')}`,
    timestamp: new Date(now.getTime() - i * 180_000).toISOString(),
  }));

  return {
    metrics,
    riskTimeline,
    severityDistribution,
    recentAlerts,
    activeInvestigations,
    contentClassification,
    geoPoints,
    cryptoVolume,
    groomingSummary,
    darkWebMonitor,
    hashMatches,
    osintActivity,
    casePipeline,
    topRiskEntities,
    serviceHealth,
    auditTicker,
    lastUpdated: now.toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/*  Helper: relative time formatter                                   */
/* ------------------------------------------------------------------ */

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                    */
/* ------------------------------------------------------------------ */

/** Delta indicator (up / down arrow with color). */
const DeltaBadge: FC<{ value: number; invert?: boolean; suffix?: string }> = ({ value, invert = false, suffix = '' }) => {
  const isPositive = invert ? value < 0 : value > 0;
  const color = isPositive ? 'text-emerald-400' : value === 0 ? 'text-slate-500' : 'text-red-400';
  const arrow = value > 0 ? '\u2191' : value < 0 ? '\u2193' : '';
  return (
    <span className={`text-xs font-medium ${color}`}>
      {arrow} {Math.abs(value)}{suffix}
    </span>
  );
};

/** Severity badge component. */
const SeverityBadge: FC<{ severity: AlertSeverity }> = ({ severity }) => {
  const styles: Record<AlertSeverity, string> = {
    critical: 'bg-red-500/20 text-red-400 ring-red-500/30',
    high: 'bg-orange-500/20 text-orange-400 ring-orange-500/30',
    medium: 'bg-amber-500/20 text-amber-400 ring-amber-500/30',
    low: 'bg-blue-500/20 text-blue-400 ring-blue-500/30',
    info: 'bg-slate-500/20 text-slate-400 ring-slate-500/30',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ring-1 ${styles[severity]}`}>
      {severity}
    </span>
  );
};

/** Status badge component. */
const StatusBadge: FC<{ status: AlertStatus | InvestigationStatus }> = ({ status }) => {
  const styles: Record<string, string> = {
    open: 'bg-red-500/15 text-red-400',
    acknowledged: 'bg-amber-500/15 text-amber-400',
    investigating: 'bg-purple-500/15 text-purple-400',
    resolved: 'bg-emerald-500/15 text-emerald-400',
    false_positive: 'bg-slate-500/15 text-slate-400',
    active: 'bg-teal-500/15 text-teal-400',
    paused: 'bg-amber-500/15 text-amber-400',
    completed: 'bg-emerald-500/15 text-emerald-400',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium uppercase ${styles[status] ?? ''}`}>
      {status.replace('_', ' ')}
    </span>
  );
};

/** Metric card used in the summary row. */
interface MetricCardProps {
  title: string;
  value: string | number;
  delta?: number;
  deltaInvert?: boolean;
  deltaSuffix?: string;
  subtitle?: string;
  icon: React.ReactNode;
  accentColor: string;
  children?: React.ReactNode;
}

const MetricCard: FC<MetricCardProps> = ({ title, value, delta, deltaInvert, deltaSuffix, subtitle, icon, accentColor, children }) => (
  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-colors group">
    <div className="flex items-start justify-between mb-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${accentColor}`}>
        {icon}
      </div>
      {delta !== undefined && <DeltaBadge value={delta} invert={deltaInvert} suffix={deltaSuffix} />}
    </div>
    <p className="text-2xl font-bold text-slate-100 tabular-nums">
      {typeof value === 'number' ? value.toLocaleString() : value}
    </p>
    <p className="text-xs text-slate-500 mt-1">{title}</p>
    {subtitle && <p className="text-[10px] text-slate-600 mt-0.5">{subtitle}</p>}
    {children}
  </div>
);

/* ------------------------------------------------------------------ */
/*  Chart components                                                  */
/* ------------------------------------------------------------------ */

/** Risk Timeline (ECharts line chart). */
const RiskTimelineChart: FC<{ data: RiskTimelinePoint[] }> = ({ data }) => {
  const option = useMemo(
    () => ({
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis' as const,
        backgroundColor: COLORS.navyLight,
        borderColor: COLORS.slate700,
        textStyle: { color: COLORS.slate300, fontSize: 12 },
        axisPointer: { type: 'cross' as const, lineStyle: { color: COLORS.slate600 } },
      },
      legend: {
        data: ['Overall', 'Content', 'Dark Web', 'Crypto'],
        textStyle: { color: COLORS.slate500, fontSize: 11 },
        top: 0,
        right: 0,
      },
      grid: { top: 40, right: 16, bottom: 32, left: 48 },
      xAxis: {
        type: 'category' as const,
        data: data.map((d) => {
          const dt = new Date(d.timestamp);
          return `${dt.getHours().toString().padStart(2, '0')}:00`;
        }),
        axisLine: { lineStyle: { color: COLORS.slate700 } },
        axisLabel: { color: COLORS.slate500, fontSize: 10 },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value' as const,
        min: 0,
        max: 100,
        axisLine: { show: false },
        axisLabel: { color: COLORS.slate500, fontSize: 10 },
        splitLine: { lineStyle: { color: COLORS.slate700, type: 'dashed' as const } },
      },
      series: [
        {
          name: 'Overall',
          type: 'line' as const,
          data: data.map((d) => d.overallRisk),
          smooth: true,
          lineStyle: { width: 2.5, color: COLORS.purple },
          itemStyle: { color: COLORS.purple },
          areaStyle: {
            color: {
              type: 'linear' as const,
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(109,40,217,0.3)' },
                { offset: 1, color: 'rgba(109,40,217,0.02)' },
              ],
            },
          },
          symbol: 'none',
        },
        {
          name: 'Content',
          type: 'line' as const,
          data: data.map((d) => d.contentRisk),
          smooth: true,
          lineStyle: { width: 1.5, color: COLORS.red },
          itemStyle: { color: COLORS.red },
          symbol: 'none',
        },
        {
          name: 'Dark Web',
          type: 'line' as const,
          data: data.map((d) => d.darkWebRisk),
          smooth: true,
          lineStyle: { width: 1.5, color: COLORS.teal },
          itemStyle: { color: COLORS.teal },
          symbol: 'none',
        },
        {
          name: 'Crypto',
          type: 'line' as const,
          data: data.map((d) => d.cryptoRisk),
          smooth: true,
          lineStyle: { width: 1.5, color: COLORS.gold },
          itemStyle: { color: COLORS.gold },
          symbol: 'none',
        },
      ],
    }),
    [data],
  );

  return <ReactECharts option={option} style={{ height: 300 }} />;
};

/** Alert Severity Distribution (donut chart). */
const SeverityDonutChart: FC<{ data: SeverityDistribution[] }> = ({ data }) => {
  const option = useMemo(
    () => ({
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item' as const,
        backgroundColor: COLORS.navyLight,
        borderColor: COLORS.slate700,
        textStyle: { color: COLORS.slate300, fontSize: 12 },
        formatter: (params: { name: string; value: number; percent: number }) =>
          `${params.name}: ${params.value} (${params.percent}%)`,
      },
      legend: {
        orient: 'vertical' as const,
        right: 16,
        top: 'center' as const,
        textStyle: { color: COLORS.slate400, fontSize: 11 },
      },
      series: [
        {
          type: 'pie' as const,
          radius: ['50%', '75%'],
          center: ['35%', '50%'],
          avoidLabelOverlap: true,
          label: {
            show: true,
            position: 'center' as const,
            formatter: () => {
              const total = data.reduce((s, d) => s + d.count, 0);
              return `{total|${total}}\n{label|Total}`;
            },
            rich: {
              total: { fontSize: 28, fontWeight: 'bold' as const, color: COLORS.slate100 },
              label: { fontSize: 11, color: COLORS.slate500, padding: [4, 0, 0, 0] },
            },
          },
          data: data.map((d) => ({
            value: d.count,
            name: d.severity.charAt(0).toUpperCase() + d.severity.slice(1),
            itemStyle: { color: d.color },
          })),
          emphasis: {
            itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.5)' },
          },
        },
      ],
    }),
    [data],
  );

  return <ReactECharts option={option} style={{ height: 280 }} />;
};

/** Content Classification Breakdown (bar chart). */
const ContentClassificationChart: FC<{ data: ContentClassificationData[] }> = ({ data }) => {
  const labelColors: Record<ContentClassification, string> = {
    safe: COLORS.teal,
    suggestive: COLORS.gold,
    nsfw: COLORS.orange,
    csam_suspect: COLORS.red,
  };

  const option = useMemo(
    () => ({
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis' as const,
        backgroundColor: COLORS.navyLight,
        borderColor: COLORS.slate700,
        textStyle: { color: COLORS.slate300, fontSize: 12 },
        formatter: (params: Array<{ name: string; value: number }>) => {
          const item = params[0];
          const dataItem = data.find(
            (d) => d.label.replace('_', ' ') === item.name.toLowerCase().replace(' ', '_') || d.label === item.name.toLowerCase(),
          );
          return `${item.name}: ${item.value.toLocaleString()} (${dataItem?.percentage ?? 0}%)`;
        },
      },
      grid: { top: 16, right: 16, bottom: 40, left: 80 },
      xAxis: {
        type: 'value' as const,
        axisLine: { show: false },
        axisLabel: { color: COLORS.slate500, fontSize: 10 },
        splitLine: { lineStyle: { color: COLORS.slate700, type: 'dashed' as const } },
      },
      yAxis: {
        type: 'category' as const,
        data: data.map((d) => d.label.charAt(0).toUpperCase() + d.label.slice(1).replace('_', ' ')),
        axisLine: { lineStyle: { color: COLORS.slate700 } },
        axisLabel: { color: COLORS.slate400, fontSize: 11 },
      },
      series: [
        {
          type: 'bar' as const,
          data: data.map((d) => ({
            value: d.count,
            itemStyle: {
              color: labelColors[d.label],
              borderRadius: [0, 4, 4, 0],
            },
          })),
          barWidth: 20,
        },
      ],
    }),
    [data],
  );

  return <ReactECharts option={option} style={{ height: 200 }} />;
};

/** Crypto Transaction Volume (ECharts bar + line combo). */
const CryptoVolumeChart: FC<{ data: CryptoVolumePoint[] }> = ({ data }) => {
  const option = useMemo(
    () => ({
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis' as const,
        backgroundColor: COLORS.navyLight,
        borderColor: COLORS.slate700,
        textStyle: { color: COLORS.slate300, fontSize: 12 },
      },
      legend: {
        data: ['BTC (vol)', 'ETH (vol)', 'Suspicious Txns'],
        textStyle: { color: COLORS.slate500, fontSize: 11 },
        top: 0,
      },
      grid: { top: 40, right: 56, bottom: 32, left: 56 },
      xAxis: {
        type: 'category' as const,
        data: data.map((d) => d.date.slice(5)), // MM-DD
        axisLine: { lineStyle: { color: COLORS.slate700 } },
        axisLabel: { color: COLORS.slate500, fontSize: 10, rotate: 30 },
      },
      yAxis: [
        {
          type: 'value' as const,
          name: 'Volume',
          nameTextStyle: { color: COLORS.slate500, fontSize: 10 },
          axisLine: { show: false },
          axisLabel: { color: COLORS.slate500, fontSize: 10, formatter: (v: number) => `${v.toFixed(0)}` },
          splitLine: { lineStyle: { color: COLORS.slate700, type: 'dashed' as const } },
        },
        {
          type: 'value' as const,
          name: 'Suspicious',
          nameTextStyle: { color: COLORS.slate500, fontSize: 10 },
          axisLine: { show: false },
          axisLabel: { color: COLORS.slate500, fontSize: 10 },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: 'BTC (vol)',
          type: 'bar' as const,
          data: data.map((d) => d.btcVolume.toFixed(2)),
          itemStyle: { color: COLORS.gold, borderRadius: [4, 4, 0, 0] },
          barGap: '10%',
        },
        {
          name: 'ETH (vol)',
          type: 'bar' as const,
          data: data.map((d) => d.ethVolume.toFixed(2)),
          itemStyle: { color: COLORS.purple, borderRadius: [4, 4, 0, 0] },
        },
        {
          name: 'Suspicious Txns',
          type: 'line' as const,
          yAxisIndex: 1,
          data: data.map((d) => d.suspiciousCount),
          smooth: true,
          lineStyle: { width: 2, color: COLORS.red },
          itemStyle: { color: COLORS.red },
          symbol: 'circle',
          symbolSize: 6,
        },
      ],
    }),
    [data],
  );

  return <ReactECharts option={option} style={{ height: 280 }} />;
};

/** Geographic Heatmap (Leaflet). */
const GeoHeatmap: FC<{ points: GeoPoint[] }> = ({ points }) => {
  const severityRadius: Record<AlertSeverity, number> = {
    critical: 14,
    high: 11,
    medium: 8,
    low: 6,
    info: 4,
  };
  const severityColor: Record<AlertSeverity, string> = {
    critical: COLORS.red,
    high: COLORS.orange,
    medium: COLORS.gold,
    low: COLORS.blue,
    info: COLORS.slate500,
  };

  return (
    <MapContainer
      center={[20, 0]}
      zoom={2}
      scrollWheelZoom={false}
      className="w-full h-full rounded-lg"
      style={{ background: COLORS.navy }}
    >
      <TileLayer
        attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />
      {points.map((p) => (
        <CircleMarker
          key={p.id}
          center={[p.lat, p.lng]}
          radius={severityRadius[p.severity]}
          pathOptions={{
            color: severityColor[p.severity],
            fillColor: severityColor[p.severity],
            fillOpacity: 0.5,
            weight: 1.5,
          }}
        >
          <Tooltip>
            <div className="text-xs">
              <p className="font-semibold">{p.label}</p>
              <p>{p.count} events ({p.severity})</p>
            </div>
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
};

/* ------------------------------------------------------------------ */
/*  Quick Action Buttons                                              */
/* ------------------------------------------------------------------ */

interface QuickAction {
  label: string;
  icon: React.ReactNode;
  path: string;
  color: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: 'New Case',
    path: '/cases/new',
    color: 'bg-purple-600 hover:bg-purple-500',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
    ),
  },
  {
    label: 'Upload Content',
    path: '/content-analysis/upload',
    color: 'bg-teal-600 hover:bg-teal-500',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
      </svg>
    ),
  },
  {
    label: 'OSINT Search',
    path: '/osint/search',
    color: 'bg-blue-600 hover:bg-blue-500',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
      </svg>
    ),
  },
  {
    label: 'Start Crawler',
    path: '/dark-web/crawlers/new',
    color: 'bg-amber-600 hover:bg-amber-500',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 12.75c1.148 0 2.278.08 3.383.237 1.037.146 1.866.966 1.866 2.013 0 3.728-2.35 6.75-5.25 6.75S6.75 18.728 6.75 15c0-1.046.83-1.867 1.866-2.013A24.204 24.204 0 0 1 12 12.75ZM12 12.75c2.883 0 5.647.508 8.207 1.44a23.91 23.91 0 0 1-1.152-6.135c-.22-2.504-1.9-4.555-4.055-4.555-2.155 0-3.835 2.051-4.055 4.555a23.91 23.91 0 0 1-1.152 6.135A24.093 24.093 0 0 1 12 12.75Z" />
      </svg>
    ),
  },
];

/* ------------------------------------------------------------------ */
/*  Recent Alerts Table                                               */
/* ------------------------------------------------------------------ */

const RecentAlertsTable: FC<{ alerts: RecentAlert[] }> = ({ alerts }) => {
  const navigate = useNavigate();
  return (
  <div className="overflow-x-auto">
    <table className="w-full">
      <thead>
        <tr className="border-b border-slate-800">
          <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Severity</th>
          <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Title</th>
          <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden lg:table-cell">Source</th>
          <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden md:table-cell">Time</th>
          <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Status</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-800/50">
        {alerts.map((alert) => (
          <tr key={alert.id} className="hover:bg-slate-800/30 transition-colors cursor-pointer group" onClick={() => navigate('/alerts')}>
            <td className="px-4 py-3">
              <SeverityBadge severity={alert.severity} />
            </td>
            <td className="px-4 py-3">
              <div className="flex flex-col">
                <span className="text-sm text-slate-200 group-hover:text-teal-400 transition-colors truncate max-w-[360px]">
                  {alert.title}
                </span>
                <span className="text-[10px] text-slate-600 mt-0.5">{alert.id}</span>
              </div>
            </td>
            <td className="px-4 py-3 hidden lg:table-cell">
              <span className="text-xs text-slate-400">{alert.source}</span>
            </td>
            <td className="px-4 py-3 hidden md:table-cell">
              <span className="text-xs text-slate-500 tabular-nums">{timeAgo(alert.timestamp)}</span>
            </td>
            <td className="px-4 py-3">
              <StatusBadge status={alert.status} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
); };

/* ------------------------------------------------------------------ */
/*  Active Investigations Sidebar                                     */
/* ------------------------------------------------------------------ */

const ActiveInvestigationsList: FC<{ investigations: ActiveInvestigation[] }> = ({ investigations }) => {
  const priorityDot: Record<CasePriority, string> = {
    critical: 'bg-red-500',
    high: 'bg-orange-500',
    medium: 'bg-amber-500',
    low: 'bg-blue-500',
  };

  return (
    <div className="space-y-3">
      {investigations.map((inv) => (
        <Link
          key={inv.id}
          to={`/investigations/${inv.id}`}
          className="block p-3 rounded-lg bg-slate-800/50 border border-slate-800 hover:border-slate-700 transition-colors group"
        >
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`w-2 h-2 rounded-full shrink-0 ${priorityDot[inv.priority]}`} />
              <h4 className="text-sm font-medium text-slate-200 truncate group-hover:text-teal-400 transition-colors">
                {inv.name}
              </h4>
            </div>
            <StatusBadge status={inv.status} />
          </div>
          <div className="flex items-center gap-4 text-[11px] text-slate-500">
            <span>{inv.entityCount} entities</span>
            <span>{inv.leadAnalyst}</span>
            <span className="ml-auto tabular-nums">{timeAgo(inv.lastActivity)}</span>
          </div>
        </Link>
      ))}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Grooming Detection Panel                                          */
/* ------------------------------------------------------------------ */

const GroomingPanel: FC<{ data: GroomingSummary }> = ({ data }) => {
  const navigate = useNavigate();
  const radarOption = useMemo(
    () => ({
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item' as const,
        backgroundColor: COLORS.navyLight,
        borderColor: COLORS.slate700,
        textStyle: { color: COLORS.slate300, fontSize: 11 },
      },
      radar: {
        indicator: data.stageBreakdown.map((s) => ({ name: s.stage, max: Math.max(...data.stageBreakdown.map((d) => d.count)) * 1.2 })),
        shape: 'polygon' as const,
        splitNumber: 4,
        axisName: { color: COLORS.slate400, fontSize: 10 },
        splitArea: { areaStyle: { color: ['rgba(15,23,42,0.5)', 'rgba(30,41,59,0.3)'] } },
        splitLine: { lineStyle: { color: COLORS.slate700 } },
        axisLine: { lineStyle: { color: COLORS.slate700 } },
      },
      series: [
        {
          type: 'radar' as const,
          data: [
            {
              value: data.stageBreakdown.map((s) => s.count),
              name: 'Detections',
              areaStyle: { color: 'rgba(239,68,68,0.15)' },
              lineStyle: { color: COLORS.red, width: 2 },
              itemStyle: { color: COLORS.red },
            },
          ],
        },
      ],
    }),
    [data],
  );

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-slate-200">Grooming Detection (24h)</h2>
        <Link to="/grooming-analysis" className="text-[10px] text-teal-400 hover:text-teal-300">Details</Link>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="text-center">
          <p className="text-lg font-bold text-slate-100 tabular-nums">{data.conversationsAnalyzed24h.toLocaleString()}</p>
          <p className="text-[10px] text-slate-500">Conversations</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-red-400 tabular-nums">{data.alertsRaised24h}</p>
          <p className="text-[10px] text-slate-500">Alerts Raised</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-teal-400 tabular-nums">{data.activeMonitors}</p>
          <p className="text-[10px] text-slate-500">Active Monitors</p>
        </div>
      </div>

      {/* Radar chart */}
      <ReactECharts option={radarOption} style={{ height: 240 }} />

      {/* Recent detections */}
      <div className="mt-4 space-y-2">
        <h3 className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">Recent Detections</h3>
        {data.recentDetections.slice(0, 4).map((d) => (
          <div key={d.id} className="flex items-center justify-between py-1.5 px-2 rounded bg-slate-800/50 hover:bg-slate-800 transition-colors cursor-pointer" onClick={() => navigate('/content-analysis')}>
            <div className="flex items-center gap-2 min-w-0">
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: d.riskScore >= 0.8 ? COLORS.red : d.riskScore >= 0.6 ? COLORS.orange : COLORS.gold }}
              />
              <span className="text-xs text-slate-300 truncate">{d.platform}</span>
              <span className="text-[10px] text-slate-500 truncate hidden sm:inline">{d.stage}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] font-mono text-red-400">{(d.riskScore * 100).toFixed(0)}%</span>
              <span className="text-[10px] text-slate-600 tabular-nums">{timeAgo(d.timestamp)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Dark Web Monitor Panel                                            */
/* ------------------------------------------------------------------ */

const DarkWebPanel: FC<{ data: DarkWebMonitorData }> = ({ data }) => {
  const navigate = useNavigate();
  const sightingTypeIcon: Record<string, string> = {
    marketplace: '🛒',
    forum: '💬',
    paste: '📋',
    onion_site: '🧅',
  };

  const forumBarOption = useMemo(
    () => ({
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis' as const, backgroundColor: COLORS.navyLight, borderColor: COLORS.slate700, textStyle: { color: COLORS.slate300, fontSize: 11 } },
      grid: { top: 8, right: 8, bottom: 24, left: 80 },
      xAxis: { type: 'value' as const, axisLine: { show: false }, axisLabel: { color: COLORS.slate500, fontSize: 10 }, splitLine: { lineStyle: { color: COLORS.slate700, type: 'dashed' as const } } },
      yAxis: { type: 'category' as const, data: data.forumActivity.map((f) => f.forum), axisLine: { lineStyle: { color: COLORS.slate700 } }, axisLabel: { color: COLORS.slate400, fontSize: 10 } },
      series: [{ type: 'bar' as const, data: data.forumActivity.map((f) => ({ value: f.posts24h, itemStyle: { color: f.color, borderRadius: [0, 3, 3, 0] } })), barWidth: 14 }],
    }),
    [data],
  );

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-slate-200">Dark Web Monitor</h2>
        <Link to="/dark-web" className="text-[10px] text-teal-400 hover:text-teal-300">Open Monitor</Link>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="text-center">
          <p className="text-lg font-bold text-amber-400 tabular-nums">{data.activeCrawlers}/{data.totalCrawlers}</p>
          <p className="text-[10px] text-slate-500">Crawlers</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-slate-100 tabular-nums">{data.pagesIndexed24h.toLocaleString()}</p>
          <p className="text-[10px] text-slate-500">Pages Indexed</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-red-400 tabular-nums">{data.newSightings24h}</p>
          <p className="text-[10px] text-slate-500">New Sightings</p>
        </div>
      </div>

      {/* Forum activity */}
      <ReactECharts option={forumBarOption} style={{ height: 160 }} />

      {/* Recent sightings */}
      <div className="mt-3 space-y-2">
        <h3 className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">Recent Sightings</h3>
        {data.recentSightings.slice(0, 4).map((s) => (
          <div key={s.id} className="flex items-start gap-2 py-1.5 px-2 rounded bg-slate-800/50 hover:bg-slate-800 transition-colors cursor-pointer" onClick={() => navigate('/dark-web')}>
            <span className="text-sm shrink-0">{sightingTypeIcon[s.type] || '🔍'}</span>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-slate-300 truncate">{s.title}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <SeverityBadge severity={s.severity} />
                <span className="text-[10px] text-slate-600 tabular-nums">{timeAgo(s.timestamp)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Hash Match Activity Panel                                         */
/* ------------------------------------------------------------------ */

const HashMatchPanel: FC<{ data: HashMatchData }> = ({ data }) => {
  const stackedOption = useMemo(
    () => ({
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis' as const, backgroundColor: COLORS.navyLight, borderColor: COLORS.slate700, textStyle: { color: COLORS.slate300, fontSize: 11 } },
      legend: { data: ['NCMEC', 'INTERPOL', 'PhotoDNA'], textStyle: { color: COLORS.slate500, fontSize: 10 }, top: 0, right: 0 },
      grid: { top: 30, right: 8, bottom: 28, left: 40 },
      xAxis: { type: 'category' as const, data: data.matchesByHour.map((h) => h.hour), axisLine: { lineStyle: { color: COLORS.slate700 } }, axisLabel: { color: COLORS.slate500, fontSize: 9, interval: 3 } },
      yAxis: { type: 'value' as const, axisLine: { show: false }, axisLabel: { color: COLORS.slate500, fontSize: 10 }, splitLine: { lineStyle: { color: COLORS.slate700, type: 'dashed' as const } } },
      series: [
        { name: 'NCMEC', type: 'bar' as const, stack: 'total', data: data.matchesByHour.map((h) => h.ncmec), itemStyle: { color: COLORS.red }, barWidth: '60%' },
        { name: 'INTERPOL', type: 'bar' as const, stack: 'total', data: data.matchesByHour.map((h) => h.interpol), itemStyle: { color: COLORS.orange } },
        { name: 'PhotoDNA', type: 'bar' as const, stack: 'total', data: data.matchesByHour.map((h) => h.photodna), itemStyle: { color: COLORS.purple } },
      ],
    }),
    [data],
  );

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-slate-200">Hash Matches (24h)</h2>
        <span className="text-xs text-red-400 font-semibold tabular-nums">{data.totalMatches24h} matches</span>
      </div>

      {/* Database breakdown */}
      <div className="flex items-center gap-4 mb-4">
        {data.matchesByDb.map((db) => (
          <div key={db.database} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: db.color }} />
            <span className="text-xs text-slate-400">{db.database}</span>
            <span className="text-xs font-semibold text-slate-200">{db.matches}</span>
          </div>
        ))}
      </div>

      <ReactECharts option={stackedOption} style={{ height: 200 }} />

      {/* Recent matches */}
      <div className="mt-3 space-y-1.5">
        {data.recentMatches.slice(0, 3).map((m) => (
          <div key={m.id} className="flex items-center justify-between py-1.5 px-2 rounded bg-red-500/5 border border-red-500/10">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">{m.hashType}</span>
              <span className="text-xs text-slate-300">{m.database}</span>
              <span className="text-[10px] text-slate-500">d={m.hammingDistance}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-teal-400">{(m.confidence * 100).toFixed(0)}%</span>
              <span className="text-[10px] text-slate-600 tabular-nums">{timeAgo(m.timestamp)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  OSINT Activity Panel                                              */
/* ------------------------------------------------------------------ */

const OsintActivityPanel: FC<{ data: OsintActivityData }> = ({ data }) => {
  const navigate = useNavigate();
  const donutOption = useMemo(
    () => ({
      backgroundColor: 'transparent',
      tooltip: { trigger: 'item' as const, backgroundColor: COLORS.navyLight, borderColor: COLORS.slate700, textStyle: { color: COLORS.slate300, fontSize: 11 } },
      series: [{
        type: 'pie' as const,
        radius: ['45%', '70%'],
        center: ['50%', '50%'],
        data: data.queriesByType.map((q) => ({ value: q.count, name: q.type, itemStyle: { color: q.color } })),
        label: { show: true, color: COLORS.slate400, fontSize: 10, formatter: '{b}: {c}' },
        itemStyle: { borderColor: COLORS.navy, borderWidth: 2 },
        emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.3)' } },
      }],
    }),
    [data],
  );

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-slate-200">OSINT Activity (24h)</h2>
        <Link to="/osint" className="text-[10px] text-teal-400 hover:text-teal-300">Open OSINT</Link>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="text-center p-2 rounded bg-slate-800/50">
          <p className="text-lg font-bold text-violet-400 tabular-nums">{data.findingsTotal24h.toLocaleString()}</p>
          <p className="text-[10px] text-slate-500">Findings</p>
        </div>
        <div className="text-center p-2 rounded bg-slate-800/50">
          <p className="text-lg font-bold text-red-400 tabular-nums">{data.breachesDetected24h}</p>
          <p className="text-[10px] text-slate-500">Breaches Detected</p>
        </div>
      </div>

      <ReactECharts option={donutOption} style={{ height: 220 }} />

      {/* Recent searches */}
      <div className="mt-3 space-y-1.5">
        <h3 className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">Recent Searches</h3>
        {data.recentSearches.map((s) => (
          <div key={s.id} className="flex items-center justify-between py-1.5 px-2 rounded bg-slate-800/50 hover:bg-slate-800 transition-colors cursor-pointer" onClick={() => navigate('/osint')}>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[10px] text-slate-500 uppercase w-12 shrink-0">{s.queryType}</span>
              <span className="text-xs font-mono text-slate-300 truncate">{s.queryValue}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] text-violet-400">{s.findingCount} hits</span>
              <span className="text-[10px] text-slate-600 tabular-nums">{timeAgo(s.timestamp)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Case Pipeline Panel                                               */
/* ------------------------------------------------------------------ */

const CasePipelinePanel: FC<{ data: CasePipelineData }> = ({ data }) => {
  const trendOption = useMemo(
    () => ({
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis' as const, backgroundColor: COLORS.navyLight, borderColor: COLORS.slate700, textStyle: { color: COLORS.slate300, fontSize: 11 } },
      legend: { data: ['Opened', 'Closed'], textStyle: { color: COLORS.slate500, fontSize: 10 }, top: 0, right: 0 },
      grid: { top: 30, right: 8, bottom: 28, left: 40 },
      xAxis: { type: 'category' as const, data: data.casesTrend.map((d) => d.date.slice(5)), axisLine: { lineStyle: { color: COLORS.slate700 } }, axisLabel: { color: COLORS.slate500, fontSize: 9, interval: 4 } },
      yAxis: { type: 'value' as const, axisLine: { show: false }, axisLabel: { color: COLORS.slate500, fontSize: 10 }, splitLine: { lineStyle: { color: COLORS.slate700, type: 'dashed' as const } } },
      series: [
        { name: 'Opened', type: 'bar' as const, data: data.casesTrend.map((d) => d.opened), itemStyle: { color: COLORS.red, borderRadius: [3, 3, 0, 0] }, barGap: '10%' },
        { name: 'Closed', type: 'bar' as const, data: data.casesTrend.map((d) => d.closed), itemStyle: { color: COLORS.teal, borderRadius: [3, 3, 0, 0] } },
      ],
    }),
    [data],
  );

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-slate-200">Case Pipeline</h2>
        <Link to="/cases" className="text-[10px] text-teal-400 hover:text-teal-300">View all cases</Link>
      </div>

      {/* Status funnel */}
      <div className="flex items-center gap-1 mb-4">
        {data.byStatus.map((s) => {
          const total = data.byStatus.reduce((sum, item) => sum + item.count, 0);
          const width = Math.max(12, (s.count / total) * 100);
          return (
            <div key={s.status} className="text-center" style={{ width: `${width}%` }}>
              <div className="h-6 rounded flex items-center justify-center" style={{ backgroundColor: `${s.color}25` }}>
                <span className="text-[10px] font-bold tabular-nums" style={{ color: s.color }}>{s.count}</span>
              </div>
              <p className="text-[9px] text-slate-500 mt-1 truncate">{s.status}</p>
            </div>
          );
        })}
      </div>

      {/* Priority breakdown */}
      <div className="flex items-center gap-3 mb-4 py-2 px-3 rounded bg-slate-800/50">
        {data.byPriority.map((p) => (
          <div key={p.priority} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="text-[10px] text-slate-400">{p.priority}</span>
            <span className="text-[10px] font-bold text-slate-200">{p.count}</span>
          </div>
        ))}
        <span className="ml-auto text-[10px] text-slate-500">Avg resolution: <span className="text-slate-300 font-medium">{data.avgResolutionDays}d</span></span>
      </div>

      {/* 30-day trend */}
      <ReactECharts option={trendOption} style={{ height: 180 }} />
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Top Risk Entities Table                                           */
/* ------------------------------------------------------------------ */

const TopRiskEntitiesTable: FC<{ entities: RiskEntity[] }> = ({ entities }) => {
  const navigate = useNavigate();
  const typeColors: Record<string, string> = {
    Person: COLORS.purple,
    Wallet: COLORS.gold,
    Domain: COLORS.teal,
    Email: '#8B5CF6',
    'IP Address': COLORS.red,
    Phone: COLORS.blue,
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-800">
            <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5">Risk</th>
            <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5">Entity</th>
            <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5 hidden md:table-cell">Type</th>
            <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5 hidden lg:table-cell">Indicators</th>
            <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5 hidden sm:table-cell">Case</th>
            <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5">Seen</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/50">
          {entities.map((ent) => (
            <tr key={ent.id} className="hover:bg-slate-800/30 transition-colors cursor-pointer" onClick={() => navigate(ent.caseId ? `/cases/${ent.caseId}` : '/cases')}>
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-2 rounded-full bg-slate-700 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${ent.riskScore * 100}%`,
                        backgroundColor: ent.riskScore >= 0.9 ? COLORS.red : ent.riskScore >= 0.7 ? COLORS.orange : COLORS.gold,
                      }}
                    />
                  </div>
                  <span className="text-xs font-mono font-bold tabular-nums" style={{
                    color: ent.riskScore >= 0.9 ? COLORS.red : ent.riskScore >= 0.7 ? COLORS.orange : COLORS.gold,
                  }}>
                    {(ent.riskScore * 100).toFixed(0)}
                  </span>
                </div>
              </td>
              <td className="px-4 py-2.5">
                <span className="text-xs font-mono text-slate-200 hover:text-teal-400 transition-colors">{ent.label}</span>
              </td>
              <td className="px-4 py-2.5 hidden md:table-cell">
                <span className="inline-flex items-center gap-1 text-[10px]">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: typeColors[ent.entityType] || COLORS.slate500 }} />
                  <span className="text-slate-400">{ent.entityType}</span>
                </span>
              </td>
              <td className="px-4 py-2.5 hidden lg:table-cell">
                <div className="flex gap-1 flex-wrap">
                  {ent.indicators.map((ind) => (
                    <span key={ind} className="px-1.5 py-0.5 bg-slate-800 rounded text-[9px] text-slate-400">{ind}</span>
                  ))}
                </div>
              </td>
              <td className="px-4 py-2.5 hidden sm:table-cell">
                {ent.caseId ? (
                  <span className="text-[10px] font-mono text-violet-400">{ent.caseId}</span>
                ) : (
                  <span className="text-[10px] text-slate-600">Unlinked</span>
                )}
              </td>
              <td className="px-4 py-2.5">
                <span className="text-[10px] text-slate-500 tabular-nums">{timeAgo(ent.lastSeen)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Service Health Strip                                              */
/* ------------------------------------------------------------------ */

const ServiceHealthStrip: FC<{ services: ServiceHealthEntry[] }> = ({ services }) => {
  const statusDot: Record<string, string> = { healthy: 'bg-teal-400', degraded: 'bg-amber-400', down: 'bg-red-400' };
  return (
    <div className="flex items-center gap-3 overflow-x-auto py-2 px-1">
      {services.map((s) => (
        <div key={s.name} className="flex items-center gap-1.5 shrink-0">
          <span className={`w-1.5 h-1.5 rounded-full ${statusDot[s.status]}`} />
          <span className="text-[10px] text-slate-400">{s.name}</span>
          {s.latencyMs > 0 && <span className="text-[10px] text-slate-600">{s.latencyMs}ms</span>}
        </div>
      ))}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Audit Trail Ticker                                                */
/* ------------------------------------------------------------------ */

const AuditTicker: FC<{ entries: AuditTickerEntry[] }> = ({ entries }) => (
  <div className="overflow-x-auto">
    <div className="flex gap-4 py-1 px-1">
      {entries.slice(0, 8).map((e) => (
        <div key={e.id} className="flex items-center gap-2 shrink-0 py-1 px-2 rounded bg-slate-800/30">
          <span className="text-[10px] font-mono text-violet-400">{e.action}</span>
          <span className="text-[10px] text-slate-500">{e.user}</span>
          <span className="text-[10px] text-slate-600 tabular-nums">{timeAgo(e.timestamp)}</span>
        </div>
      ))}
    </div>
  </div>
);

/* ------------------------------------------------------------------ */
/*  Dashboard Page Component                                          */
/* ------------------------------------------------------------------ */

const Dashboard: FC = () => {
  const navigate = useNavigate();
  const isDemoTenant = useIsDemoTenant();
  const [currentTime, setCurrentTime] = useState(new Date());

  // Refresh clock every minute.
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  // Fetch dashboard data.
  const { data, isLoading, isError, error, refetch } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: fetchDashboardData,
    refetchInterval: 30_000,
  });

  /* --- Loading state --- */
  if (isLoading) {
    return (
      <div className="space-y-6">
        {/* Skeleton metrics row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-5 animate-pulse">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-lg bg-slate-800" />
                <div className="w-12 h-4 rounded bg-slate-800" />
              </div>
              <div className="w-20 h-7 rounded bg-slate-800 mb-2" />
              <div className="w-28 h-3 rounded bg-slate-800" />
            </div>
          ))}
        </div>
        {/* Skeleton charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5 h-[360px] animate-pulse" />
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 h-[360px] animate-pulse" />
        </div>
      </div>
    );
  }

  /* --- Error state --- */
  if (isError) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-4">
          <div className="text-red-500 text-4xl mb-2">
            <svg className="w-12 h-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-slate-200">Failed to load dashboard</h3>
          <p className="text-sm text-slate-500 max-w-sm">{(error as Error)?.message ?? 'An unexpected error occurred.'}</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const {
    metrics: rawMetrics,
    riskTimeline: rawRiskTimeline,
    severityDistribution: rawSeverityDistribution,
    recentAlerts: rawRecentAlerts,
    activeInvestigations: rawActiveInvestigations,
    contentClassification: rawContentClassification,
    geoPoints: rawGeoPoints,
    cryptoVolume: rawCryptoVolume,
    groomingSummary: rawGroomingSummary,
    darkWebMonitor: rawDarkWebMonitor,
    hashMatches: rawHashMatches,
    osintActivity: rawOsintActivity,
    casePipeline: rawCasePipeline,
    topRiskEntities: rawTopRiskEntities,
    serviceHealth: rawServiceHealth,
    auditTicker: rawAuditTicker,
    lastUpdated,
  } = data;

  // Tenant-aware data: show mock data only for demo tenant, zeros/empty for real tenants
  const emptyMetrics: DashboardMetrics = {
    activeCases: 0,
    activeCasesDelta: 0,
    openAlerts: { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 },
    openAlertsDelta: 0,
    contentAnalyzed24h: 0,
    contentAnalyzedDelta: 0,
    osintQueries24h: 0,
    osintQueriesDelta: 0,
    activeCrawlers: 0,
    activeCrawlersTotal: 0,
  };

  const metrics = isDemoTenant ? rawMetrics : emptyMetrics;
  const riskTimeline = isDemoTenant ? rawRiskTimeline : [];
  const severityDistribution = isDemoTenant ? rawSeverityDistribution : [];
  const recentAlerts = isDemoTenant ? rawRecentAlerts : [];
  const activeInvestigations = isDemoTenant ? rawActiveInvestigations : [];
  const contentClassification = isDemoTenant ? rawContentClassification : [];
  const geoPoints = isDemoTenant ? rawGeoPoints : [];
  const cryptoVolume = isDemoTenant ? rawCryptoVolume : [];
  const groomingSummary = isDemoTenant ? rawGroomingSummary : {
    activeMonitors: 0,
    conversationsAnalyzed24h: 0,
    alertsRaised24h: 0,
    stageBreakdown: [],
    recentDetections: [],
  } as GroomingSummary;
  const darkWebMonitor = isDemoTenant ? rawDarkWebMonitor : {
    activeCrawlers: 0,
    totalCrawlers: 0,
    pagesIndexed24h: 0,
    newSightings24h: 0,
    recentSightings: [],
    forumActivity: [],
  } as DarkWebMonitorData;
  const hashMatches = isDemoTenant ? rawHashMatches : {
    totalMatches24h: 0,
    matchesByDb: [],
    matchesByHour: [],
    recentMatches: [],
  } as HashMatchData;
  const osintActivity = isDemoTenant ? rawOsintActivity : {
    queriesByType: [],
    findingsTotal24h: 0,
    breachesDetected24h: 0,
    recentSearches: [],
  } as OsintActivityData;
  const casePipeline = isDemoTenant ? rawCasePipeline : {
    byStatus: [],
    byPriority: [],
    avgResolutionDays: 0,
    casesTrend: [],
  } as CasePipelineData;
  const topRiskEntities = isDemoTenant ? rawTopRiskEntities : [];
  const serviceHealth = isDemoTenant ? rawServiceHealth : [];
  const auditTicker = isDemoTenant ? rawAuditTicker : [];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">
            Intelligence overview &middot; Updated {timeAgo(lastUpdated)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-600 tabular-nums">
            {currentTime.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </span>
          <button
            type="button"
            onClick={() => refetch()}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
            aria-label="Refresh dashboard"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
            </svg>
          </button>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3">
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={() => navigate(action.path)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors ${action.color}`}
          >
            {action.icon}
            {action.label}
          </button>
        ))}
      </div>

      {/* Empty workspace message for non-demo tenants */}
      {!isDemoTenant && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <svg className="w-16 h-16 text-slate-700 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
          <h3 className="text-lg font-semibold text-slate-400 mb-2">Empty Workspace</h3>
          <p className="text-sm text-slate-500 max-w-md">This tenant has no data yet. Start by creating cases and running investigations.</p>
        </div>
      )}

      {/* Summary Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricCard
          title="Active Cases"
          value={metrics.activeCases}
          delta={metrics.activeCasesDelta}
          icon={
            <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 0 0 .75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 0 0-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0 1 12 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 0 1-.673-.38m0 0A2.18 2.18 0 0 1 3 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 0 1 3.413-.387m7.5 0V5.25A2.25 2.25 0 0 0 13.5 3h-3a2.25 2.25 0 0 0-2.25 2.25v.894m7.5 0a48.667 48.667 0 0 0-7.5 0" />
            </svg>
          }
          accentColor="bg-purple-500/15"
        />

        <MetricCard
          title="Open Alerts"
          value={metrics.openAlerts.total}
          delta={metrics.openAlertsDelta}
          deltaInvert
          icon={
            <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
            </svg>
          }
          accentColor="bg-red-500/15"
        >
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">{metrics.openAlerts.critical} crit</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400">{metrics.openAlerts.high} high</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">{metrics.openAlerts.medium} med</span>
          </div>
        </MetricCard>

        <MetricCard
          title="Content Analyzed (24h)"
          value={metrics.contentAnalyzed24h}
          delta={metrics.contentAnalyzedDelta}
          deltaSuffix=" items"
          icon={
            <svg className="w-5 h-5 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
            </svg>
          }
          accentColor="bg-teal-500/15"
        />

        <MetricCard
          title="OSINT Queries (24h)"
          value={metrics.osintQueries24h}
          delta={metrics.osintQueriesDelta}
          icon={
            <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5a17.92 17.92 0 0 1-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
            </svg>
          }
          accentColor="bg-blue-500/15"
        />

        <MetricCard
          title="Active Crawlers"
          value={`${metrics.activeCrawlers}/${metrics.activeCrawlersTotal}`}
          subtitle={`${metrics.activeCrawlersTotal - metrics.activeCrawlers} idle`}
          icon={
            <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 12.75c1.148 0 2.278.08 3.383.237 1.037.146 1.866.966 1.866 2.013 0 3.728-2.35 6.75-5.25 6.75S6.75 18.728 6.75 15c0-1.046.83-1.867 1.866-2.013A24.204 24.204 0 0 1 12 12.75ZM12 12.75c2.883 0 5.647.508 8.207 1.44a23.91 23.91 0 0 1-1.152-6.135c-.22-2.504-1.9-4.555-4.055-4.555-2.155 0-3.835 2.051-4.055 4.555a23.91 23.91 0 0 1-1.152 6.135A24.093 24.093 0 0 1 12 12.75Z" />
            </svg>
          }
          accentColor="bg-amber-500/15"
        />
      </div>

      {/* Row 2: Risk Timeline + Severity Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-200">Risk Timeline (24h)</h2>
            <span className="text-[10px] text-slate-600">Hourly risk scores</span>
          </div>
          <RiskTimelineChart data={riskTimeline} />
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-200">Alert Distribution</h2>
            <Link to="/alerts" className="text-[10px] text-teal-400 hover:text-teal-300">View all</Link>
          </div>
          <SeverityDonutChart data={severityDistribution} />
        </div>
      </div>

      {/* Row 3: Recent Alerts Table + Active Investigations */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
            <h2 className="text-sm font-semibold text-slate-200">Recent Alerts</h2>
            <Link to="/alerts" className="text-xs text-teal-400 hover:text-teal-300 transition-colors">
              View all alerts
            </Link>
          </div>
          <RecentAlertsTable alerts={recentAlerts} />
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-200">Active Investigations</h2>
            <Link to="/investigations" className="text-[10px] text-teal-400 hover:text-teal-300">View all</Link>
          </div>
          <ActiveInvestigationsList investigations={activeInvestigations} />
        </div>
      </div>

      {/* Row 4: Content Classification + Geo Heatmap */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-200">Content Classification (24h)</h2>
            <Link to="/content-analysis" className="text-[10px] text-teal-400 hover:text-teal-300">Details</Link>
          </div>
          <ContentClassificationChart data={contentClassification} />
          {/* CSAM suspect callout */}
          {contentClassification.find((c) => c.label === 'csam_suspect')?.count! > 0 && (
            <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
                <p className="text-xs text-red-400">
                  <strong>{contentClassification.find((c) => c.label === 'csam_suspect')?.count}</strong> items flagged as CSAM suspect require immediate review.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-200">Geographic Activity</h2>
            <span className="text-[10px] text-slate-600">IP-based event locations</span>
          </div>
          <div className="h-[280px] rounded-lg overflow-hidden">
            <GeoHeatmap points={geoPoints} />
          </div>
        </div>
      </div>

      {/* Row 5: Crypto Transaction Volume */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-200">Crypto Transaction Volume (14d)</h2>
          <Link to="/crypto-tracer" className="text-[10px] text-teal-400 hover:text-teal-300">Open Crypto Tracer</Link>
        </div>
        <CryptoVolumeChart data={cryptoVolume} />
      </div>

      {/* Row 6: Grooming Detection + Dark Web Monitor */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <GroomingPanel data={groomingSummary} />
        <DarkWebPanel data={darkWebMonitor} />
      </div>

      {/* Row 7: Hash Matches + OSINT Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <HashMatchPanel data={hashMatches} />
        <OsintActivityPanel data={osintActivity} />
      </div>

      {/* Row 8: Case Pipeline (full width) */}
      <CasePipelinePanel data={casePipeline} />

      {/* Row 9: Top Risk Entities */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h2 className="text-sm font-semibold text-slate-200">Top Risk Entities</h2>
          <Link to="/graph" className="text-xs text-teal-400 hover:text-teal-300 transition-colors">
            Open Investigation Graph
          </Link>
        </div>
        <TopRiskEntitiesTable entities={topRiskEntities} />
      </div>

      {/* Row 10: Service Health Strip */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl px-5 py-3">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Service Health</h2>
          <Link to="/settings" className="text-[10px] text-slate-600 hover:text-slate-400">System Status</Link>
        </div>
        <ServiceHealthStrip services={serviceHealth} />
      </div>

      {/* Row 11: Audit Trail Ticker */}
      <div className="bg-slate-900/50 border border-slate-800/50 rounded-xl px-5 py-3">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Audit Trail</h2>
          <Link to="/audit" className="text-[10px] text-slate-600 hover:text-slate-400">View Full Log</Link>
        </div>
        <AuditTicker entries={auditTicker} />
      </div>

      {/* Footer timestamp */}
      <div className="text-center pb-4">
        <p className="text-[10px] text-slate-700">
          Mary Poppins Intelligence Platform &middot; Dashboard auto-refreshes every 30 seconds
        </p>
      </div>
    </div>
  );
};

export default Dashboard;

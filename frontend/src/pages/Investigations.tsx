/**
 * Mary Poppins — Investigations Page
 * Graph-based investigation workspace with list and detail views.
 * Uses Cytoscape.js for interactive graph visualization.
 */
import { useState, useRef, useEffect, useMemo } from 'react';
import { Routes, Route, useNavigate, useParams, Link } from 'react-router-dom';
import { useToast, useIsDemoTenant } from '../App';
import Modal from '../components/common/Modal';
import CytoscapeComponent from 'react-cytoscapejs';
import type { Core, ElementDefinition, Stylesheet } from 'cytoscape';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface InvestigationItem {
  id: string;
  title: string;
  caseId: string;
  nodes: number;
  edges: number;
  updated: string;
  status: 'active' | 'review' | 'completed';
  leadAnalyst: string;
  description: string;
}

interface InvestigationTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  suggestedNodeTypes: string[];
  suggestedRelationships: string[];
  checklistItems: string[];
  requiredModules: string[];
}

/* ------------------------------------------------------------------ */
/*  Mock Data                                                          */
/* ------------------------------------------------------------------ */
const MOCK_INVESTIGATIONS: InvestigationItem[] = [
  {
    id: 'INV-001',
    title: 'Operation Darklight',
    caseId: 'CS-2024-0891',
    nodes: 47,
    edges: 83,
    updated: '2 hours ago',
    status: 'active',
    leadAnalyst: 'J. Chen',
    description:
      'Graph analysis of CSAM distribution network. Tracking entity relationships across dark web forums and cryptocurrency transactions.',
  },
  {
    id: 'INV-002',
    title: 'Financial Network Alpha',
    caseId: 'CS-2024-0887',
    nodes: 23,
    edges: 41,
    updated: '5 hours ago',
    status: 'active',
    leadAnalyst: 'M. Rivera',
    description:
      'Cryptocurrency wallet cluster analysis. Mapping transaction flows between suspected mixer services and exchanges.',
  },
  {
    id: 'INV-003',
    title: 'Cross-Border Ring',
    caseId: 'CS-2024-0876',
    nodes: 112,
    edges: 278,
    updated: '1 day ago',
    status: 'review',
    leadAnalyst: 'A. Petrov',
    description:
      'Large-scale entity relationship mapping across 7 jurisdictions. Community detection algorithms identified 4 distinct sub-networks.',
  },
  {
    id: 'INV-004',
    title: 'Epstein Network Analysis',
    caseId: 'CS-2024-0900',
    nodes: 156,
    edges: 342,
    updated: '30 min ago',
    status: 'active',
    leadAnalyst: 'J. Chen',
    description:
      'Comprehensive graph analysis of the Epstein network. Entity mapping includes financial flows through shell companies, travel patterns via private aviation, property ownership chains, and communication metadata. Community detection identified 6 distinct sub-networks.',
  },
];

/* ------------------------------------------------------------------ */
/*  Mock Graph Data per Investigation                                  */
/* ------------------------------------------------------------------ */
const INVESTIGATION_GRAPHS: Record<string, ElementDefinition[]> = {
  'INV-001': [
    // Nodes
    { data: { id: 'sa', label: 'Suspect Alpha', entityType: 'Person' } },
    { data: { id: 'h7', label: 'Handler-7', entityType: 'Person' } },
    { data: { id: 'rx', label: 'Recruiter X', entityType: 'Person' } },
    { data: { id: 'e1', label: 'darklight@protonmail.com', entityType: 'Email' } },
    { data: { id: 'e2', label: 'handler7@tutanota.com', entityType: 'Email' } },
    { data: { id: 'w1', label: 'bc1q...a8f3', entityType: 'CryptoWallet' } },
    { data: { id: 'w2', label: 'bc1q...7d2e', entityType: 'CryptoWallet' } },
    { data: { id: 'os1', label: 'darkxxx...onion', entityType: 'OnionService' } },
    { data: { id: 'ch1', label: 'a7f3c2...e91b', entityType: 'ContentHash' } },
    { data: { id: 'ch2', label: 'b1d4e8...f7a3', entityType: 'ContentHash' } },
    { data: { id: 'ip1', label: '185.220.101.xx', entityType: 'IP' } },
    { data: { id: 'u1', label: 'darklight_op', entityType: 'Username' } },
    // Edges
    { data: { source: 'sa', target: 'e1', label: 'USES_EMAIL' } },
    { data: { source: 'h7', target: 'e2', label: 'USES_EMAIL' } },
    { data: { source: 'sa', target: 'w1', label: 'OWNS' } },
    { data: { source: 'h7', target: 'w2', label: 'OWNS' } },
    { data: { source: 'w1', target: 'w2', label: 'TRANSACTED_WITH' } },
    { data: { source: 'sa', target: 'ch1', label: 'SHARES_CONTENT' } },
    { data: { source: 'rx', target: 'ch2', label: 'SHARES_CONTENT' } },
    { data: { source: 'ch1', target: 'os1', label: 'HOSTED_ON' } },
    { data: { source: 'ch2', target: 'os1', label: 'HOSTED_ON' } },
    { data: { source: 'sa', target: 'rx', label: 'COMMUNICATES_WITH' } },
    { data: { source: 'h7', target: 'rx', label: 'LINKED_TO' } },
    { data: { source: 'os1', target: 'ip1', label: 'RESOLVES_TO' } },
    { data: { source: 'sa', target: 'u1', label: 'KNOWN_AS' } },
    { data: { source: 'u1', target: 'os1', label: 'POSTED_ON' } },
  ],

  'INV-002': [
    // Nodes
    { data: { id: 'wm1', label: 'bc1q...mixer1', entityType: 'CryptoWallet' } },
    { data: { id: 'we1', label: 'bc1q...exchange1', entityType: 'CryptoWallet' } },
    { data: { id: 'we2', label: '0xDEF...eth1', entityType: 'CryptoWallet' } },
    { data: { id: 'wo1', label: 'bc1q...out1', entityType: 'CryptoWallet' } },
    { data: { id: 'ex1', label: 'Binance Hot Wallet', entityType: 'Financial' } },
    { data: { id: 'ex2', label: 'Kraken Deposit', entityType: 'Financial' } },
    { data: { id: 'mx1', label: 'Wasabi CoinJoin', entityType: 'OnionService' } },
    { data: { id: 'sb', label: 'Suspect Beta', entityType: 'Person' } },
    // Edges
    { data: { source: 'sb', target: 'wm1', label: 'OWNS' } },
    { data: { source: 'wm1', target: 'mx1', label: 'TRANSACTED_WITH' } },
    { data: { source: 'mx1', target: 'we1', label: 'TRANSACTED_WITH' } },
    { data: { source: 'we1', target: 'ex1', label: 'TRANSACTED_WITH' } },
    { data: { source: 'we2', target: 'ex2', label: 'TRANSACTED_WITH' } },
    { data: { source: 'mx1', target: 'wo1', label: 'TRANSACTED_WITH' } },
    { data: { source: 'wo1', target: 'we2', label: 'TRANSACTED_WITH' } },
    { data: { source: 'sb', target: 'we2', label: 'OWNS' } },
  ],

  'INV-003': [
    // Nodes — Persons
    { data: { id: 'pa', label: 'Subject A (DE)', entityType: 'Person' } },
    { data: { id: 'pb', label: 'Subject B (FR)', entityType: 'Person' } },
    { data: { id: 'pc', label: 'Subject C (NL)', entityType: 'Person' } },
    { data: { id: 'pd', label: 'Subject D (UK)', entityType: 'Person' } },
    { data: { id: 'pe', label: 'Subject E (BE)', entityType: 'Person' } },
    // Usernames
    { data: { id: 'un1', label: 'darkfox_99', entityType: 'Username' } },
    { data: { id: 'un2', label: 'shadow_trader', entityType: 'Username' } },
    { data: { id: 'un3', label: 'anon_collector', entityType: 'Username' } },
    // Domains
    { data: { id: 'dom1', label: 'forum-x.onion', entityType: 'Domain' } },
    { data: { id: 'dom2', label: 'market-z.onion', entityType: 'Domain' } },
    // Forum Posts
    { data: { id: 'fp1', label: 'Post #45821', entityType: 'ForumPost' } },
    { data: { id: 'fp2', label: 'Post #67234', entityType: 'ForumPost' } },
    // Additional nodes
    { data: { id: 'ip2', label: '91.234.xx.xx', entityType: 'IP' } },
    { data: { id: 'em1', label: 'foxden@onionmail.org', entityType: 'Email' } },
    { data: { id: 'cw1', label: 'bc1q...ring1', entityType: 'CryptoWallet' } },
    // Edges
    { data: { source: 'pa', target: 'un1', label: 'KNOWN_AS' } },
    { data: { source: 'pb', target: 'un2', label: 'KNOWN_AS' } },
    { data: { source: 'pc', target: 'un3', label: 'KNOWN_AS' } },
    { data: { source: 'pa', target: 'pb', label: 'COMMUNICATES_WITH' } },
    { data: { source: 'pb', target: 'pc', label: 'COMMUNICATES_WITH' } },
    { data: { source: 'pc', target: 'pd', label: 'COMMUNICATES_WITH' } },
    { data: { source: 'pd', target: 'pe', label: 'COMMUNICATES_WITH' } },
    { data: { source: 'pe', target: 'pa', label: 'LINKED_TO' } },
    { data: { source: 'un1', target: 'fp1', label: 'AUTHORED' } },
    { data: { source: 'un2', target: 'fp2', label: 'AUTHORED' } },
    { data: { source: 'fp1', target: 'dom1', label: 'POSTED_ON' } },
    { data: { source: 'fp2', target: 'dom2', label: 'POSTED_ON' } },
    { data: { source: 'un3', target: 'dom1', label: 'ACTIVE_ON' } },
    { data: { source: 'un3', target: 'dom2', label: 'ACTIVE_ON' } },
    { data: { source: 'pa', target: 'em1', label: 'USES_EMAIL' } },
    { data: { source: 'pa', target: 'cw1', label: 'OWNS' } },
    { data: { source: 'dom1', target: 'ip2', label: 'RESOLVES_TO' } },
    { data: { source: 'pd', target: 'un1', label: 'LINKED_TO' } },
  ],

  'INV-004': [
    // Nodes — Persons
    { data: { id: 'je', label: 'Jeffrey Epstein', entityType: 'Person' } },
    { data: { id: 'gm', label: 'Ghislaine Maxwell', entityType: 'Person' } },
    { data: { id: 'jlb', label: 'Jean-Luc Brunel', entityType: 'Person' } },
    { data: { id: 'sk', label: 'Sarah Kellen', entityType: 'Person' } },
    { data: { id: 'nm', label: 'Nadia Marcinkova', entityType: 'Person' } },
    // Shell Companies
    { data: { id: 'sc1', label: 'Southern Trust Company', entityType: 'ShellCompany' } },
    { data: { id: 'sc2', label: 'JEGE LLC', entityType: 'ShellCompany' } },
    { data: { id: 'sc3', label: 'Financial Trust Co.', entityType: 'ShellCompany' } },
    { data: { id: 'sc4', label: 'Gratitude America Ltd', entityType: 'ShellCompany' } },
    // Properties
    { data: { id: 'pr1', label: '9 E 71st St, NYC', entityType: 'Property' } },
    { data: { id: 'pr2', label: '358 El Brillo Way, Palm Beach', entityType: 'Property' } },
    { data: { id: 'pr3', label: 'Little St. James Island', entityType: 'Property' } },
    { data: { id: 'pr4', label: 'Paris Apartment', entityType: 'Property' } },
    // Aircraft
    { data: { id: 'ac1', label: 'N908JE (Boeing 727-31)', entityType: 'Aircraft' } },
    // Financial
    { data: { id: 'fi1', label: 'JP Morgan Account', entityType: 'Financial' } },
    { data: { id: 'fi2', label: 'Deutsche Bank Account', entityType: 'Financial' } },
    // Additional nodes
    { data: { id: 'mc1', label: 'MC2 Model Management', entityType: 'ShellCompany' } },
    { data: { id: 'pr5', label: 'Zorro Ranch, NM', entityType: 'Property' } },
    { data: { id: 'fi3', label: 'Butterfield Trust', entityType: 'Financial' } },
    { data: { id: 'sc5', label: 'Plan D LLC', entityType: 'ShellCompany' } },
    // Edges
    { data: { source: 'je', target: 'sc1', label: 'OWNS' } },
    { data: { source: 'je', target: 'sc2', label: 'OWNS' } },
    { data: { source: 'je', target: 'sc3', label: 'OWNS' } },
    { data: { source: 'je', target: 'sc4', label: 'OWNS' } },
    { data: { source: 'je', target: 'sc5', label: 'OWNS' } },
    { data: { source: 'je', target: 'pr1', label: 'OWNS' } },
    { data: { source: 'je', target: 'pr2', label: 'OWNS' } },
    { data: { source: 'sc2', target: 'pr3', label: 'OWNS' } },
    { data: { source: 'je', target: 'pr5', label: 'OWNS' } },
    { data: { source: 'jlb', target: 'pr4', label: 'OWNS' } },
    { data: { source: 'jlb', target: 'mc1', label: 'MANAGES' } },
    { data: { source: 'je', target: 'ac1', label: 'OWNS' } },
    { data: { source: 'je', target: 'fi1', label: 'TRANSACTED_WITH' } },
    { data: { source: 'je', target: 'fi2', label: 'TRANSACTED_WITH' } },
    { data: { source: 'sc3', target: 'fi3', label: 'TRANSACTED_WITH' } },
    { data: { source: 'je', target: 'gm', label: 'LINKED_TO' } },
    { data: { source: 'je', target: 'jlb', label: 'LINKED_TO' } },
    { data: { source: 'gm', target: 'sk', label: 'MANAGES' } },
    { data: { source: 'gm', target: 'nm', label: 'LINKED_TO' } },
    { data: { source: 'gm', target: 'jlb', label: 'COMMUNICATES_WITH' } },
    { data: { source: 'sk', target: 'je', label: 'COMMUNICATES_WITH' } },
    { data: { source: 'nm', target: 'je', label: 'LINKED_TO' } },
    { data: { source: 'fi1', target: 'sc1', label: 'TRANSACTED_WITH' } },
    { data: { source: 'fi2', target: 'sc4', label: 'TRANSACTED_WITH' } },
  ],
};

/* ------------------------------------------------------------------ */
/*  Investigation Templates                                            */
/* ------------------------------------------------------------------ */
const INVESTIGATION_TEMPLATES: InvestigationTemplate[] = [
  {
    id: 'tmpl-trafficking',
    name: 'Human Trafficking Network',
    description: 'Map recruitment, transportation, and exploitation networks across jurisdictions',
    icon: 'HT',
    category: 'Organized Crime',
    suggestedNodeTypes: ['Person', 'Phone', 'Location', 'Vehicle', 'Property', 'Financial', 'SocialMedia'],
    suggestedRelationships: ['COMMUNICATES_WITH', 'TRAVELS_TO', 'TRANSACTED_WITH', 'LINKED_TO', 'RESIDES_AT'],
    checklistItems: [
      'Identify recruitment entry points and platforms',
      'Map transportation routes and travel patterns',
      'Trace financial flows and payment methods',
      'Cross-reference phone records and communication metadata',
      'Identify safe houses, properties, and locations of interest',
      'Link social media profiles and online aliases',
      'Document victim statements metadata (no raw content)',
    ],
    requiredModules: ['OSINT', 'Crypto Tracing', 'Graph Engine'],
  },
  {
    id: 'tmpl-financial',
    name: 'Financial Fraud / Money Laundering',
    description: 'Trace illicit financial flows through shell companies, mixers, and exchanges',
    icon: 'FF',
    category: 'Financial Crime',
    suggestedNodeTypes: ['Person', 'ShellCompany', 'CryptoWallet', 'Financial', 'Property', 'Domain'],
    suggestedRelationships: ['OWNS', 'TRANSACTED_WITH', 'MANAGES', 'REGISTERED_TO', 'LINKED_TO'],
    checklistItems: [
      'Map corporate structure and beneficial ownership',
      'Trace cryptocurrency flows through wallets and exchanges',
      'Identify mixer/tumbler usage patterns',
      'Cross-reference exchange KYC data where available',
      'Document property ownership chains',
      'Analyze transaction timing patterns and anomalies',
    ],
    requiredModules: ['Crypto Tracing', 'Graph Engine', 'OSINT'],
  },
  {
    id: 'tmpl-csam',
    name: 'CSAM Distribution Network',
    description: 'Track content distribution, identify producers and consumers, preserve chain of custody',
    icon: 'CS',
    category: 'Child Safety',
    suggestedNodeTypes: ['Person', 'ContentHash', 'OnionService', 'CryptoWallet', 'Username', 'IP', 'Email'],
    suggestedRelationships: ['SHARES_CONTENT', 'HOSTED_ON', 'TRANSACTED_WITH', 'KNOWN_AS', 'POSTED_ON'],
    checklistItems: [
      'Run content through hash databases (NCMEC, INTERPOL, Project VIC)',
      'Map distribution topology and sharing networks',
      'Identify content producers vs consumers',
      'Trace cryptocurrency payments to premium content',
      'Correlate dark web aliases across platforms',
      'Document chain of custody for each content hash',
      'File CyberTipline reports for confirmed matches',
    ],
    requiredModules: ['Content Analysis', 'Dark Web Monitor', 'Crypto Tracing', 'Graph Engine'],
  },
  {
    id: 'tmpl-drugs',
    name: 'Drug Distribution Network',
    description: 'Map drug supply chains from dark web marketplaces to street-level distribution',
    icon: 'DN',
    category: 'Narcotics',
    suggestedNodeTypes: ['Person', 'Username', 'OnionService', 'CryptoWallet', 'Location', 'Phone', 'Domain'],
    suggestedRelationships: ['SELLS_ON', 'SHIPS_TO', 'TRANSACTED_WITH', 'LINKED_TO', 'COMMUNICATES_WITH'],
    checklistItems: [
      'Identify vendor profiles on dark web marketplaces',
      'Correlate aliases across multiple platforms',
      'Trace cryptocurrency payment flows to exchanges',
      'Map shipping and delivery patterns',
      'Identify clearnet infrastructure leaks',
      'Cross-reference PGP key fingerprints across forums',
    ],
    requiredModules: ['Dark Web Monitor', 'Crypto Tracing', 'OSINT', 'Graph Engine'],
  },
  {
    id: 'tmpl-cyber',
    name: 'Cybercrime Operations',
    description: 'Investigate ransomware groups, hacking operations, and cyber fraud rings',
    icon: 'CC',
    category: 'Cybercrime',
    suggestedNodeTypes: ['Person', 'Username', 'IP', 'Domain', 'CryptoWallet', 'Email', 'OnionService'],
    suggestedRelationships: ['OWNS', 'OPERATES', 'TARGETS', 'COMMUNICATES_WITH', 'TRANSACTED_WITH'],
    checklistItems: [
      'Map attack infrastructure (IPs, domains, C2 servers)',
      'Correlate threat actor aliases across forums and channels',
      'Trace ransom and extortion payments',
      'Identify operational security failures and clearnet leaks',
      'Cross-reference with threat intelligence feeds',
      'Document attack timeline and TTPs',
    ],
    requiredModules: ['OSINT', 'Crypto Tracing', 'Dark Web Monitor', 'Graph Engine'],
  },
];

/* ------------------------------------------------------------------ */
/*  Cytoscape Stylesheet                                               */
/* ------------------------------------------------------------------ */
const GRAPH_STYLESHEET: Stylesheet[] = [
  // ---- Default node ----
  {
    selector: 'node',
    style: {
      label: 'data(label)',
      'text-valign': 'bottom',
      'text-halign': 'center',
      'font-size': '9px',
      color: '#94a3b8',
      'text-margin-y': 6,
      'background-color': '#64748b',
      shape: 'ellipse',
      width: 32,
      height: 32,
      'text-max-width': '90px',
      'text-wrap': 'ellipsis',
      'border-width': 0,
      'border-color': '#a78bfa',
    },
  },
  // ---- Entity type selectors ----
  {
    selector: 'node[entityType="Person"]',
    style: { shape: 'ellipse', 'background-color': '#3b82f6' },
  },
  {
    selector: 'node[entityType="Email"]',
    style: { shape: 'diamond', 'background-color': '#f59e0b' },
  },
  {
    selector: 'node[entityType="Phone"]',
    style: { shape: 'triangle', 'background-color': '#10b981' },
  },
  {
    selector: 'node[entityType="Username"]',
    style: { shape: 'round-rectangle', 'background-color': '#8b5cf6' },
  },
  {
    selector: 'node[entityType="IP"]',
    style: { shape: 'pentagon', 'background-color': '#ef4444' },
  },
  {
    selector: 'node[entityType="Domain"]',
    style: { shape: 'rectangle', 'background-color': '#06b6d4' },
  },
  {
    selector: 'node[entityType="CryptoWallet"]',
    style: { shape: 'hexagon', 'background-color': '#eab308' },
  },
  {
    selector: 'node[entityType="ContentHash"]',
    style: { shape: 'octagon', 'background-color': '#f97316' },
  },
  {
    selector: 'node[entityType="OnionService"]',
    style: { shape: 'star', 'background-color': '#dc2626' },
  },
  {
    selector: 'node[entityType="ForumPost"]',
    style: { shape: 'round-rectangle', 'background-color': '#6366f1' },
  },
  {
    selector: 'node[entityType="ShellCompany"]',
    style: { shape: 'rectangle', 'background-color': '#a855f7' },
  },
  {
    selector: 'node[entityType="Property"]',
    style: { shape: 'rectangle', 'background-color': '#14b8a6' },
  },
  {
    selector: 'node[entityType="Aircraft"]',
    style: { shape: 'diamond', 'background-color': '#64748b' },
  },
  {
    selector: 'node[entityType="Financial"]',
    style: { shape: 'hexagon', 'background-color': '#22c55e' },
  },
  // ---- Edges ----
  {
    selector: 'edge',
    style: {
      width: 2,
      'curve-style': 'bezier',
      'target-arrow-shape': 'triangle',
      'line-color': '#475569',
      'target-arrow-color': '#475569',
      label: 'data(label)',
      'font-size': '7px',
      color: '#64748b',
      'text-rotation': 'autorotate',
      'text-margin-y': -8,
    },
  },
  // ---- Selected state ----
  {
    selector: 'node:selected',
    style: {
      'border-width': 3,
      'border-color': '#a78bfa',
    },
  },
];

const statusStyle: Record<string, string> = {
  active: 'bg-emerald-500/20 text-emerald-400',
  review: 'bg-amber-500/20 text-amber-400',
  completed: 'bg-slate-500/20 text-slate-400',
};

/* ------------------------------------------------------------------ */
/*  Investigation Detail (Graph Workspace)                             */
/* ------------------------------------------------------------------ */
function InvestigationDetail() {
  const isDemoTenant = useIsDemoTenant();
  const { investigationId } = useParams<{ investigationId: string }>();
  const investigations = isDemoTenant ? MOCK_INVESTIGATIONS : [];
  const inv = investigations.find((i) => i.id === investigationId);
  const { addToast } = useToast();
  const cyRef = useRef<Core | null>(null);

  const graphElements = useMemo(
    () => (isDemoTenant ? (INVESTIGATION_GRAPHS[inv?.id ?? ''] ?? []) : []),
    [inv?.id, isDemoTenant],
  );

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const handler = (evt: any) => {
      const node = evt.target;
      const label = node.data('label') ?? 'Unknown';
      const entityType = node.data('entityType') ?? 'Entity';
      addToast({
        severity: 'info',
        title: `${entityType}: ${label}`,
        message: `Node ID: ${node.id()}`,
      });
    };

    cy.on('tap', 'node', handler);
    return () => {
      cy.off('tap', 'node', handler);
    };
  }, [addToast, graphElements]);

  if (!inv) {
    return (
      <div className="text-center py-16">
        <div className="text-4xl text-slate-700 mb-2">404</div>
        <p className="text-slate-400">Investigation not found</p>
        <Link
          to="/investigations"
          className="text-teal-400 hover:text-teal-300 text-sm mt-4 inline-block"
        >
          Back to Investigations
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            to="/investigations"
            className="text-slate-400 hover:text-slate-200 transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"
              />
            </svg>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-100">{inv.title}</h1>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs font-mono text-teal-400">{inv.id}</span>
              <span className="text-xs text-slate-500">
                Case:{' '}
                <Link
                  to={`/cases/${inv.caseId}`}
                  className="text-purple-400 hover:text-purple-300"
                >
                  {inv.caseId}
                </Link>
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${statusStyle[inv.status]}`}
          >
            {inv.status}
          </span>
          <button
            onClick={() =>
              addToast({ severity: 'info', title: 'Layout recalculated' })
            }
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg transition-colors"
          >
            Re-layout
          </button>
          <button
            onClick={() =>
              addToast({
                severity: 'info',
                title: 'Expanding graph...',
                message: 'Running community detection',
              })
            }
            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs rounded-lg transition-colors"
          >
            Auto-Expand
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-500">Nodes</p>
          <p className="text-2xl font-bold text-slate-100 mt-1">{inv.nodes}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-500">Edges</p>
          <p className="text-2xl font-bold text-slate-100 mt-1">{inv.edges}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-500">Lead Analyst</p>
          <p className="text-sm font-medium text-slate-200 mt-1">
            {inv.leadAnalyst}
          </p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-500">Last Updated</p>
          <p className="text-sm text-slate-200 mt-1">{inv.updated}</p>
        </div>
      </div>

      {/* Graph Workspace */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200">
            Graph Workspace
          </h2>
          <div className="flex gap-2">
            <button
              onClick={() =>
                addToast({ severity: 'info', title: 'Entity added to graph' })
              }
              className="text-xs text-teal-400 hover:text-teal-300 px-2 py-1 rounded bg-teal-500/10 hover:bg-teal-500/20 transition-colors"
            >
              + Add Entity
            </button>
            <button
              onClick={() =>
                addToast({
                  severity: 'info',
                  title: 'Running path analysis...',
                })
              }
              className="text-xs text-purple-400 hover:text-purple-300 px-2 py-1 rounded bg-purple-500/10 hover:bg-purple-500/20 transition-colors"
            >
              Find Paths
            </button>
            <button
              onClick={() =>
                addToast({ severity: 'info', title: 'Exporting graph...' })
              }
              className="text-xs text-slate-400 hover:text-slate-300 px-2 py-1 rounded bg-slate-500/10 hover:bg-slate-500/20 transition-colors"
            >
              Export
            </button>
          </div>
        </div>
        <div className="h-[500px]">
          <CytoscapeComponent
            elements={graphElements}
            stylesheet={GRAPH_STYLESHEET}
            layout={
              {
                name: 'cose',
                animate: true,
                animationDuration: 800,
                nodeRepulsion: () => 8000,
                idealEdgeLength: () => 100,
              } as any
            }
            style={{ width: '100%', height: '100%' }}
            cy={(cy: Core) => {
              cyRef.current = cy;
            }}
          />
        </div>
      </div>

      {/* Workflow Checklist */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-slate-200 mb-3">Investigation Workflow</h3>
        <div className="space-y-2">
          {(inv.id === 'INV-004'
            ? ['Run content through hash databases (NCMEC, INTERPOL, Project VIC)', 'Map financial flows through shell companies', 'Trace cryptocurrency wallets to exchanges', 'Document property ownership chains', 'Analyze travel patterns via private aviation', 'Cross-reference communication metadata', 'Identify sub-network communities']
            : ['Define investigation scope and objectives', 'Identify initial entities of interest', 'Run OSINT queries on seed entities', 'Expand graph with discovered connections', 'Analyze patterns and clusters', 'Document findings and evidence chain']
          ).map((item, i) => (
            <label key={i} className="flex items-start gap-2 text-xs text-slate-400 cursor-pointer hover:text-slate-300 transition-colors">
              <input type="checkbox" className="mt-0.5 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500/20" />
              <span>{item}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Description */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-slate-300 mb-2">
          Investigation Notes
        </h2>
        <p className="text-sm text-slate-400 leading-relaxed">
          {inv.description}
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Investigation List View                                            */
/* ------------------------------------------------------------------ */
function InvestigationList() {
  const isDemoTenant = useIsDemoTenant();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<InvestigationTemplate | null>(null);
  const navigate = useNavigate();
  const { addToast } = useToast();
  const investigations = isDemoTenant ? MOCK_INVESTIGATIONS : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-100">Investigations</h1>
        <button
          onClick={() => setShowTemplateModal(true)}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-sm font-medium text-white transition-colors"
        >
          + New Investigation
        </button>
      </div>

      {investigations.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <svg className="w-16 h-16 text-slate-700 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
          <h3 className="text-lg font-semibold text-slate-400 mb-2">Empty Workspace</h3>
          <p className="text-sm text-slate-500 max-w-md">This tenant has no data yet. Start creating cases and investigations to populate this view.</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        {investigations.map((inv) => {
          const nodeCount = (INVESTIGATION_GRAPHS[inv.id] ?? []).filter(
            (el) => !el.data.source,
          ).length;
          const edgeCount = (INVESTIGATION_GRAPHS[inv.id] ?? []).filter(
            (el) => !!el.data.source,
          ).length;

          return (
            <div
              key={inv.id}
              className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-purple-500/50 transition-colors cursor-pointer"
              onClick={() => navigate(`/investigations/${inv.id}`)}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-200">
                    {inv.title}
                  </h3>
                  <span className="text-[10px] font-mono text-slate-500">
                    {inv.id}
                  </span>
                </div>
                <span
                  className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${statusStyle[inv.status]}`}
                >
                  {inv.status}
                </span>
              </div>
              <p className="text-xs text-slate-500 mb-3 line-clamp-2">
                {inv.description}
              </p>
              <div className="flex gap-4 text-xs text-slate-500">
                <span>{inv.nodes} nodes</span>
                <span>{inv.edges} edges</span>
              </div>
              <div className="flex items-center justify-between mt-3">
                <p className="text-xs text-slate-600">
                  Updated {inv.updated}
                </p>
                <span className="text-xs text-slate-500">
                  {inv.leadAnalyst}
                </span>
              </div>
              <div className="mt-4 h-32 bg-slate-800 rounded-lg flex items-center justify-center">
                <div className="text-center">
                  <p className="text-xs text-slate-500">
                    {nodeCount} graph nodes &middot; {edgeCount} edges loaded
                  </p>
                  <p className="text-xs text-purple-400 mt-1 font-medium">
                    View graph &rarr;
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Create Investigation Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create New Investigation"
        size="lg"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setShowCreateModal(false);
            addToast({
              severity: 'success',
              title: 'Investigation Created',
              message: 'New graph workspace has been initialized',
            });
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-sm text-slate-300 mb-1">
              Investigation Name
            </label>
            <input
              type="text"
              required
              placeholder="e.g., Operation Nightwatch"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">
              Linked Case
            </label>
            <select className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-purple-500">
              <option value="">Select a case...</option>
              <option value="CS-2024-0891">
                CS-2024-0891 -- Operation Darklight
              </option>
              <option value="CS-2024-0887">
                CS-2024-0887 -- Financial Network Alpha
              </option>
              <option value="CS-2024-0876">
                CS-2024-0876 -- Cross-Border Ring
              </option>
              <option value="CS-2024-0865">
                CS-2024-0865 -- Forum Takedown Bravo
              </option>
              <option value="CS-2024-0900">
                CS-2024-0900 -- Epstein Network Analysis
              </option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">
              Description
            </label>
            <textarea
              rows={3}
              placeholder="Describe the investigation scope and objectives..."
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500 resize-none"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">
              Graph Layout
            </label>
            <select className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-purple-500">
              <option value="cose">COSE (Force-directed)</option>
              <option value="dagre">Dagre (Hierarchical)</option>
              <option value="concentric">Concentric</option>
              <option value="grid">Grid</option>
            </select>
          </div>
          <div className="flex gap-2 pt-4 border-t border-slate-800">
            <button
              type="submit"
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Create Investigation
            </button>
            <button
              type="button"
              onClick={() => setShowCreateModal(false)}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      {/* Template Selector Modal */}
      <Modal isOpen={showTemplateModal} onClose={() => { setShowTemplateModal(false); setSelectedTemplate(null); }} title="New Investigation — Choose Template" size="lg">
        <div className="space-y-4">
          {!selectedTemplate ? (
            <>
              <p className="text-sm text-slate-400">Select an investigation template to get started, or create a blank investigation.</p>
              <div className="grid grid-cols-2 gap-3">
                {INVESTIGATION_TEMPLATES.map(tmpl => (
                  <button
                    key={tmpl.id}
                    onClick={() => setSelectedTemplate(tmpl)}
                    className="text-left p-4 bg-slate-800/50 border border-slate-700 rounded-xl hover:border-blue-500/50 hover:bg-slate-800 transition-all group"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <span className="w-9 h-9 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-xs font-bold text-blue-400">{tmpl.icon}</span>
                      <div>
                        <h4 className="text-sm font-semibold text-slate-200 group-hover:text-blue-300 transition-colors">{tmpl.name}</h4>
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider">{tmpl.category}</span>
                      </div>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">{tmpl.description}</p>
                  </button>
                ))}
              </div>
              <div className="pt-3 border-t border-slate-800">
                <button
                  onClick={() => { setShowTemplateModal(false); addToast({ severity: 'info', title: 'Blank Investigation', message: 'Created new blank investigation' }); }}
                  className="text-sm text-slate-400 hover:text-slate-300 transition-colors"
                >
                  Or start with a blank investigation...
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <button onClick={() => setSelectedTemplate(null)} className="text-xs text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1">
                ← Back to templates
              </button>
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-sm font-bold text-blue-400">{selectedTemplate.icon}</span>
                <div>
                  <h3 className="text-lg font-semibold text-slate-100">{selectedTemplate.name}</h3>
                  <span className="text-xs text-slate-500 uppercase tracking-wider">{selectedTemplate.category}</span>
                </div>
              </div>
              <p className="text-sm text-slate-400">{selectedTemplate.description}</p>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Suggested Entity Types</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedTemplate.suggestedNodeTypes.map(nt => (
                      <span key={nt} className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-[10px] rounded-full border border-blue-500/20">{nt}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Key Relationships</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedTemplate.suggestedRelationships.map(rel => (
                      <span key={rel} className="px-2 py-0.5 bg-purple-500/10 text-purple-400 text-[10px] rounded-full border border-purple-500/20">{rel}</span>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Investigation Workflow Checklist</h4>
                <div className="space-y-1.5">
                  {selectedTemplate.checklistItems.map((item, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-slate-400">
                      <span className="w-4 h-4 mt-0.5 rounded border border-slate-600 flex-shrink-0 flex items-center justify-center text-[10px] text-slate-600">{i + 1}</span>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Required Modules</h4>
                <div className="flex flex-wrap gap-1.5">
                  {selectedTemplate.requiredModules.map(mod => (
                    <span key={mod} className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[10px] rounded-full border border-emerald-500/20">{mod}</span>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-4 border-t border-slate-800">
                <button
                  onClick={() => {
                    setShowTemplateModal(false);
                    setSelectedTemplate(null);
                    addToast({ severity: 'success', title: 'Investigation Created', message: `New ${selectedTemplate.name} investigation created from template` });
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Create Investigation
                </button>
                <button onClick={() => setSelectedTemplate(null)} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm transition-colors">
                  Back
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Router                                                             */
/* ------------------------------------------------------------------ */
export default function Investigations() {
  return (
    <Routes>
      <Route index element={<InvestigationList />} />
      <Route path=":investigationId" element={<InvestigationDetail />} />
    </Routes>
  );
}

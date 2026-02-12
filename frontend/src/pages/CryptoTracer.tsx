/**
 * Mary Poppins Digital Intelligence Platform
 * Crypto Tracer Page — Cryptocurrency Investigation Workspace
 *
 * Complete investigation UI for:
 * - Wallet lookup and analysis (BTC, ETH, LTC, XMR, BCH)
 * - Multi-hop transaction tracing with interactive Sankey flow graph
 * - Wallet cluster visualization (common-input-ownership)
 * - Mixer/tumbler detection (CoinJoin, Wasabi, Tornado Cash, ChipMixer)
 * - Transaction timeline and volume analytics
 * - Risk scoring with exposure analysis
 * - Case integration and evidence export
 *
 * Built with:
 *   Cytoscape.js — Transaction flow graph
 *   Apache ECharts — Sankey diagram, timeline, volume charts
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
  EventObject,
  ElementDefinition,
  Stylesheet,
  LayoutOptions,
  NodeSingular,
} from 'cytoscape';

/* ================================================================== */
/*  1. TYPE DEFINITIONS                                                */
/* ================================================================== */

export type Blockchain = 'bitcoin' | 'ethereum' | 'bitcoin_cash' | 'litecoin' | 'monero';
export type TraceDirection = 'incoming' | 'outgoing' | 'both';
export type WalletLabelType =
  | 'unknown'
  | 'exchange'
  | 'mixer'
  | 'gambling'
  | 'darknet_market'
  | 'ransomware'
  | 'scam'
  | 'mining_pool'
  | 'payment_processor'
  | 'personal'
  | 'suspect';

export type RiskTier = 'critical' | 'high' | 'medium' | 'low' | 'none';

export interface WalletInfo {
  id: string;
  address: string;
  blockchain: Blockchain;
  balance: number;
  totalReceived: number;
  totalSent: number;
  txCount: number;
  firstSeen: string | null;
  lastSeen: string | null;
  label: WalletLabelType;
  knownService: string | null;
  clusterId: string | null;
  riskScore: number;
  tags: string[];
  isMixer: boolean;
  isExchange: boolean;
}

export interface Transaction {
  id: string;
  txHash: string;
  blockchain: Blockchain;
  blockNumber: number;
  blockTimestamp: string;
  fromAddress: string;
  toAddress: string;
  amount: number;
  amountUsd: number | null;
  fee: number;
  isMixerTx: boolean;
  fromLabel: WalletLabelType;
  toLabel: WalletLabelType;
  fromService: string | null;
  toService: string | null;
}

export interface TraceResult {
  wallet: WalletInfo;
  transactions: Transaction[];
  connectedWallets: WalletInfo[];
  traceDepthReached: number;
  totalValueTraced: number;
}

export interface ClusterResult {
  clusterId: string;
  wallets: WalletInfo[];
  totalAddresses: number;
  totalValue: number;
  knownServices: string[];
  riskScore: number;
}

export interface MixerDetection {
  address: string;
  isMixer: boolean;
  confidence: number;
  mixerType: string | null;
  evidence: string[];
}

export interface FlowNode {
  id: string;
  address: string;
  label: WalletLabelType;
  knownService: string | null;
  balance: number;
  riskScore: number;
  blockchain: Blockchain;
  isMixer: boolean;
  isExchange: boolean;
  isCenter: boolean;
}

export interface FlowEdge {
  source: string;
  target: string;
  txHash: string;
  amount: number;
  amountUsd: number | null;
  timestamp: string;
  isMixerTx: boolean;
}

export interface TransactionFlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

export interface VolumeDataPoint {
  date: string;
  incoming: number;
  outgoing: number;
  suspicious: number;
}

/** Page-level composite state. */
interface CryptoTracerState {
  searchAddress: string;
  blockchain: Blockchain;
  traceDepth: number;
  traceDirection: TraceDirection;
  activeTab: 'flow' | 'sankey' | 'timeline' | 'cluster' | 'mixer';
  selectedNodeId: string | null;
  selectedTx: Transaction | null;
  flowLayoutName: 'dagre' | 'cose' | 'breadthfirst' | 'concentric';
  showRiskOverlay: boolean;
  highlightMixers: boolean;
  caseId: string | null;
}

/* ================================================================== */
/*  2. CONSTANTS & STYLE CONFIG                                        */
/* ================================================================== */

const BLOCKCHAIN_CONFIG: Record<Blockchain, { name: string; symbol: string; color: string; icon: string }> = {
  bitcoin:      { name: 'Bitcoin',      symbol: 'BTC',  color: '#F7931A', icon: '\u20BF' },
  ethereum:     { name: 'Ethereum',     symbol: 'ETH',  color: '#627EEA', icon: '\u039E' },
  bitcoin_cash: { name: 'Bitcoin Cash', symbol: 'BCH',  color: '#0AC18E', icon: '\u20BF' },
  litecoin:     { name: 'Litecoin',     symbol: 'LTC',  color: '#BFBBBB', icon: '\u0141' },
  monero:       { name: 'Monero',       symbol: 'XMR',  color: '#FF6600', icon: '\u24C2' },
};

const LABEL_STYLES: Record<WalletLabelType, { color: string; bg: string; icon: string }> = {
  unknown:           { color: '#94A3B8', bg: 'bg-slate-500/20',  icon: '?' },
  exchange:          { color: '#3B82F6', bg: 'bg-blue-500/20',   icon: '\u21C4' },
  mixer:             { color: '#EF4444', bg: 'bg-red-500/20',    icon: '\u21BB' },
  gambling:          { color: '#A855F7', bg: 'bg-purple-500/20', icon: '\u2680' },
  darknet_market:    { color: '#DC2626', bg: 'bg-red-600/20',    icon: '\u26A0' },
  ransomware:        { color: '#FF0000', bg: 'bg-red-700/20',    icon: '\u2620' },
  scam:              { color: '#F97316', bg: 'bg-orange-500/20', icon: '\u26D4' },
  mining_pool:       { color: '#14B8A6', bg: 'bg-teal-500/20',  icon: '\u26CF' },
  payment_processor: { color: '#22D3EE', bg: 'bg-cyan-500/20',  icon: '\u2713' },
  personal:          { color: '#6B7280', bg: 'bg-gray-500/20',   icon: '\u263A' },
  suspect:           { color: '#EAB308', bg: 'bg-yellow-500/20', icon: '!' },
};

function riskTier(score: number): RiskTier {
  if (score >= 0.85) return 'critical';
  if (score >= 0.65) return 'high';
  if (score >= 0.40) return 'medium';
  if (score >= 0.15) return 'low';
  return 'none';
}

const RISK_COLORS: Record<RiskTier, string> = {
  critical: '#EF4444',
  high: '#F97316',
  medium: '#EAB308',
  low: '#3B82F6',
  none: '#22C55E',
};

function formatCrypto(amount: number, symbol: string): string {
  if (amount >= 1000) return `${(amount / 1000).toFixed(2)}K ${symbol}`;
  if (amount >= 1) return `${amount.toFixed(4)} ${symbol}`;
  return `${amount.toFixed(8)} ${symbol}`;
}

function formatUsd(amount: number | null): string {
  if (amount === null) return '—';
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(2)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(1)}K`;
  return `$${amount.toFixed(2)}`;
}

function shortenAddr(addr: string, chars = 6): string {
  if (addr.length <= chars * 2 + 3) return addr;
  return `${addr.slice(0, chars)}...${addr.slice(-chars)}`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/* ================================================================== */
/*  3. MOCK API LAYER                                                  */
/* ================================================================== */

function randomAddr(blockchain: Blockchain): string {
  const hex = (n: number) =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  if (blockchain === 'ethereum') return `0x${hex(40)}`;
  if (blockchain === 'bitcoin') {
    const prefixes = ['1', '3', 'bc1q'];
    return prefixes[Math.floor(Math.random() * prefixes.length)] + hex(30);
  }
  return hex(34);
}

function randomLabel(): WalletLabelType {
  const labels: WalletLabelType[] = [
    'unknown', 'unknown', 'unknown', 'exchange', 'exchange',
    'mixer', 'personal', 'personal', 'darknet_market', 'suspect',
    'mining_pool', 'gambling', 'scam', 'payment_processor',
  ];
  return labels[Math.floor(Math.random() * labels.length)];
}

function randomService(label: WalletLabelType): string | null {
  const services: Partial<Record<WalletLabelType, string[]>> = {
    exchange: ['Binance', 'Coinbase', 'Kraken', 'Bitfinex', 'Huobi', 'OKX', 'KuCoin'],
    mixer: ['Wasabi Wallet', 'Tornado Cash', 'ChipMixer', 'CoinJoin'],
    gambling: ['Stake.com', 'Primedice', 'FortuneJack'],
    darknet_market: ['Hydra Market', 'AlphaBay', 'ASAP Market'],
    mining_pool: ['F2Pool', 'AntPool', 'Foundry USA'],
    payment_processor: ['BitPay', 'BTCPay Server', 'CoinGate'],
  };
  const list = services[label];
  if (!list) return null;
  return list[Math.floor(Math.random() * list.length)];
}

function generateMockWallet(address: string, blockchain: Blockchain, isCenter = false): WalletInfo {
  const label = isCenter ? 'suspect' : randomLabel();
  return {
    id: crypto.randomUUID(),
    address,
    blockchain,
    balance: Math.random() * 50,
    totalReceived: Math.random() * 500 + 10,
    totalSent: Math.random() * 480 + 5,
    txCount: Math.floor(Math.random() * 2000) + 1,
    firstSeen: new Date(Date.now() - Math.random() * 365 * 86400000 * 3).toISOString(),
    lastSeen: new Date(Date.now() - Math.random() * 30 * 86400000).toISOString(),
    label,
    knownService: randomService(label),
    clusterId: Math.random() > 0.6 ? `cluster_${address.slice(0, 8)}` : null,
    riskScore: label === 'mixer' ? 0.6 + Math.random() * 0.4
      : label === 'darknet_market' ? 0.85 + Math.random() * 0.15
      : label === 'ransomware' ? 0.9 + Math.random() * 0.1
      : label === 'scam' ? 0.7 + Math.random() * 0.3
      : label === 'suspect' ? 0.5 + Math.random() * 0.4
      : Math.random() * 0.4,
    tags: [],
    isMixer: label === 'mixer',
    isExchange: label === 'exchange',
  };
}

function generateMockTrace(address: string, blockchain: Blockchain, depth: number): TraceResult {
  const center = generateMockWallet(address, blockchain, true);
  const wallets: WalletInfo[] = [center];
  const transactions: Transaction[] = [];
  const symbol = BLOCKCHAIN_CONFIG[blockchain].symbol;

  // Build layered transaction graph
  const layers: string[][] = [[address]];
  for (let d = 0; d < depth; d++) {
    const layer: string[] = [];
    for (const parentAddr of layers[d]) {
      const fanout = Math.floor(Math.random() * 4) + 1;
      for (let i = 0; i < fanout; i++) {
        const childAddr = randomAddr(blockchain);
        const childWallet = generateMockWallet(childAddr, blockchain);
        wallets.push(childWallet);
        layer.push(childAddr);

        const amount = Math.random() * 10 + 0.001;
        const isOutgoing = Math.random() > 0.3;
        transactions.push({
          id: crypto.randomUUID(),
          txHash: Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
          blockchain,
          blockNumber: Math.floor(Math.random() * 800000) + 700000,
          blockTimestamp: new Date(Date.now() - Math.random() * 180 * 86400000).toISOString(),
          fromAddress: isOutgoing ? parentAddr : childAddr,
          toAddress: isOutgoing ? childAddr : parentAddr,
          amount,
          amountUsd: amount * (blockchain === 'bitcoin' ? 43250 : blockchain === 'ethereum' ? 2380 : 100),
          fee: Math.random() * 0.001,
          isMixerTx: childWallet.isMixer || Math.random() > 0.9,
          fromLabel: isOutgoing
            ? (wallets.find(w => w.address === parentAddr)?.label || 'unknown')
            : childWallet.label,
          toLabel: isOutgoing
            ? childWallet.label
            : (wallets.find(w => w.address === parentAddr)?.label || 'unknown'),
          fromService: isOutgoing
            ? (wallets.find(w => w.address === parentAddr)?.knownService || null)
            : childWallet.knownService,
          toService: isOutgoing
            ? childWallet.knownService
            : (wallets.find(w => w.address === parentAddr)?.knownService || null),
        });
      }
    }
    layers.push(layer);
  }

  return {
    wallet: center,
    transactions,
    connectedWallets: wallets.slice(1),
    traceDepthReached: depth,
    totalValueTraced: transactions.reduce((s, t) => s + t.amount, 0),
  };
}

function generateMockCluster(address: string, blockchain: Blockchain): ClusterResult {
  const count = Math.floor(Math.random() * 30) + 5;
  const wallets: WalletInfo[] = [];
  for (let i = 0; i < count; i++) {
    wallets.push(generateMockWallet(
      i === 0 ? address : randomAddr(blockchain),
      blockchain,
      i === 0,
    ));
  }
  const services = [...new Set(wallets.map(w => w.knownService).filter(Boolean))] as string[];
  return {
    clusterId: `cluster_${address.slice(0, 12)}`,
    wallets,
    totalAddresses: count,
    totalValue: wallets.reduce((s, w) => s + w.balance, 0),
    knownServices: services,
    riskScore: Math.max(...wallets.map(w => w.riskScore)),
  };
}

function generateMockMixerDetection(address: string): MixerDetection[] {
  return [{
    address,
    isMixer: Math.random() > 0.4,
    confidence: 0.6 + Math.random() * 0.4,
    mixerType: ['coinjoin', 'wasabi', 'tornado_cash', 'chipmixer', null][Math.floor(Math.random() * 5)],
    evidence: [
      'Equal-value outputs detected in 23 transactions',
      'Fan-in/fan-out topology ratio: 4.7',
      'Round BTC amounts in 67% of outputs',
      'Temporal pattern: rapid in/out within 10-minute windows',
      'Known mixer address in 2-hop neighborhood',
    ].slice(0, Math.floor(Math.random() * 4) + 1),
  }];
}

const api = {
  trace: async (address: string, blockchain: Blockchain, depth: number, direction: TraceDirection): Promise<TraceResult> => {
    await new Promise(r => setTimeout(r, 1200 + Math.random() * 800));
    return generateMockTrace(address, blockchain, depth);
  },
  cluster: async (address: string, blockchain: Blockchain): Promise<ClusterResult> => {
    await new Promise(r => setTimeout(r, 900));
    return generateMockCluster(address, blockchain);
  },
  detectMixer: async (address: string, blockchain: Blockchain): Promise<MixerDetection[]> => {
    await new Promise(r => setTimeout(r, 700));
    return generateMockMixerDetection(address);
  },
};

/* ================================================================== */
/*  4. CYTOSCAPE FLOW GRAPH HELPERS                                    */
/* ================================================================== */

function traceToFlowGraph(trace: TraceResult): TransactionFlowGraph {
  const nodeMap = new Map<string, FlowNode>();

  // Center wallet
  const cw = trace.wallet;
  nodeMap.set(cw.address, {
    id: cw.address,
    address: cw.address,
    label: cw.label,
    knownService: cw.knownService,
    balance: cw.balance,
    riskScore: cw.riskScore,
    blockchain: cw.blockchain,
    isMixer: cw.isMixer,
    isExchange: cw.isExchange,
    isCenter: true,
  });

  for (const w of trace.connectedWallets) {
    if (!nodeMap.has(w.address)) {
      nodeMap.set(w.address, {
        id: w.address,
        address: w.address,
        label: w.label,
        knownService: w.knownService,
        balance: w.balance,
        riskScore: w.riskScore,
        blockchain: w.blockchain,
        isMixer: w.isMixer,
        isExchange: w.isExchange,
        isCenter: false,
      });
    }
  }

  const edges: FlowEdge[] = trace.transactions.map(tx => ({
    source: tx.fromAddress,
    target: tx.toAddress,
    txHash: tx.txHash,
    amount: tx.amount,
    amountUsd: tx.amountUsd,
    timestamp: tx.blockTimestamp,
    isMixerTx: tx.isMixerTx,
  }));

  return { nodes: Array.from(nodeMap.values()), edges };
}

function flowGraphToElements(graph: TransactionFlowGraph, highlightMixers: boolean): ElementDefinition[] {
  const elements: ElementDefinition[] = [];

  for (const node of graph.nodes) {
    const style = LABEL_STYLES[node.label] || LABEL_STYLES.unknown;
    const tier = riskTier(node.riskScore);

    elements.push({
      data: {
        id: node.id,
        label: node.knownService
          ? `${node.knownService}\n${shortenAddr(node.address, 4)}`
          : shortenAddr(node.address, 5),
        nodeType: node.label,
        riskScore: node.riskScore,
        riskTier: tier,
        balance: node.balance,
        knownService: node.knownService,
        isMixer: node.isMixer,
        isExchange: node.isExchange,
        isCenter: node.isCenter,
        fullAddress: node.address,
      },
      classes: [
        node.isCenter ? 'center-node' : '',
        node.isMixer && highlightMixers ? 'mixer-node' : '',
        node.isExchange ? 'exchange-node' : '',
        `risk-${tier}` ,
      ].filter(Boolean).join(' '),
    });
  }

  for (const edge of graph.edges) {
    elements.push({
      data: {
        id: `${edge.source}-${edge.target}-${edge.txHash.slice(0, 8)}`,
        source: edge.source,
        target: edge.target,
        label: formatCrypto(edge.amount, 'BTC'),
        amount: edge.amount,
        amountUsd: edge.amountUsd,
        txHash: edge.txHash,
        timestamp: edge.timestamp,
        isMixerTx: edge.isMixerTx,
      },
      classes: edge.isMixerTx ? 'mixer-edge' : '',
    });
  }

  return elements;
}

function buildFlowStylesheet(): Stylesheet[] {
  return [
    // Base node
    {
      selector: 'node',
      style: {
        'background-color': '#334155',
        'border-width': 2,
        'border-color': '#475569',
        label: 'data(label)',
        'text-wrap': 'wrap' as any,
        'text-max-width': '100px',
        color: '#E2E8F0',
        'font-size': '10px',
        'font-family': 'JetBrains Mono, monospace',
        'text-valign': 'bottom',
        'text-margin-y': 6,
        width: 40,
        height: 40,
        'overlay-padding': 4,
        'text-outline-color': '#0F172A',
        'text-outline-width': 2,
      },
    },
    // Center node (investigated address)
    {
      selector: '.center-node',
      style: {
        'background-color': '#6D28D9',
        'border-color': '#A78BFA',
        'border-width': 4,
        width: 60,
        height: 60,
        'font-size': '12px',
        'font-weight': 'bold' as any,
        'z-index': 100,
      },
    },
    // Label-based coloring
    ...Object.entries(LABEL_STYLES).map(([labelType, cfg]) => ({
      selector: `node[nodeType="${labelType}"]`,
      style: {
        'background-color': cfg.color,
        'border-color': cfg.color,
      },
    })) as Stylesheet[],
    // Risk tiers
    {
      selector: '.risk-critical',
      style: { 'border-color': '#EF4444', 'border-width': 3 },
    },
    {
      selector: '.risk-high',
      style: { 'border-color': '#F97316', 'border-width': 3 },
    },
    // Mixer highlight
    {
      selector: '.mixer-node',
      style: {
        'background-color': '#EF4444',
        'border-color': '#FCA5A5',
        'border-width': 4,
        'border-style': 'dashed' as any,
        shape: 'diamond' as any,
        width: 50,
        height: 50,
      },
    },
    // Exchange
    {
      selector: '.exchange-node',
      style: {
        shape: 'round-rectangle' as any,
        width: 55,
        height: 40,
      },
    },
    // Selected
    {
      selector: ':selected',
      style: {
        'border-color': '#14B8A6',
        'border-width': 4,
        'overlay-color': '#14B8A6',
        'overlay-opacity': 0.15,
      },
    },
    // Base edge
    {
      selector: 'edge',
      style: {
        'curve-style': 'bezier' as any,
        'target-arrow-shape': 'triangle' as any,
        'target-arrow-color': '#475569',
        'line-color': '#475569',
        width: 1.5,
        label: 'data(label)',
        color: '#94A3B8',
        'font-size': '8px',
        'font-family': 'JetBrains Mono, monospace',
        'text-rotation': 'autorotate' as any,
        'text-margin-y': -8,
        'text-outline-color': '#0F172A',
        'text-outline-width': 2,
        opacity: 0.7,
      },
    },
    // Mixer edge
    {
      selector: '.mixer-edge',
      style: {
        'line-color': '#EF4444',
        'line-style': 'dashed' as any,
        'target-arrow-color': '#EF4444',
        width: 2.5,
        opacity: 1,
      },
    },
    // Edge scaled by amount
    {
      selector: 'edge[amount > 1]',
      style: { width: 2.5 },
    },
    {
      selector: 'edge[amount > 5]',
      style: { width: 4 },
    },
    {
      selector: 'edge[amount > 10]',
      style: { width: 6, 'font-size': '10px' },
    },
  ];
}

function buildFlowLayout(name: string): LayoutOptions {
  const base = { animate: true, animationDuration: 500, fit: true, padding: 60 };
  switch (name) {
    case 'dagre':
      return { ...base, name: 'dagre', rankDir: 'LR', nodeSep: 80, rankSep: 150, edgeSep: 30 } as any;
    case 'breadthfirst':
      return { ...base, name: 'breadthfirst', directed: true, spacingFactor: 1.5, circle: false } as any;
    case 'concentric':
      return { ...base, name: 'concentric', minNodeSpacing: 60 } as any;
    case 'cose':
    default:
      return { ...base, name: 'cose', idealEdgeLength: () => 120, nodeRepulsion: () => 8000, gravity: 0.25 } as any;
  }
}

/* ================================================================== */
/*  5. SUB-COMPONENTS                                                  */
/* ================================================================== */

// ── Search Bar ──────────────────────────────────────────────────────

const SearchPanel: FC<{
  state: CryptoTracerState;
  onUpdate: (partial: Partial<CryptoTracerState>) => void;
  onSubmit: () => void;
  isLoading: boolean;
}> = ({ state, onUpdate, onSubmit, isLoading }) => {
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (state.searchAddress.trim()) onSubmit();
  };

  return (
    <form onSubmit={handleSubmit} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-lg bg-yellow-500/20 flex items-center justify-center text-yellow-400 text-lg font-bold">
          {BLOCKCHAIN_CONFIG[state.blockchain].icon}
        </div>
        <div>
          <h2 className="text-white font-semibold text-sm">Cryptocurrency Tracer</h2>
          <p className="text-slate-500 text-xs">Trace wallet transactions and analyze fund flows</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-3">
        {/* Address input */}
        <div className="flex-1 relative">
          <input
            type="text"
            value={state.searchAddress}
            onChange={e => onUpdate({ searchAddress: e.target.value })}
            placeholder="Enter wallet address (e.g., 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa)"
            className="w-full bg-slate-900/80 border border-slate-600/50 rounded-lg px-4 py-2.5 text-white text-sm font-mono placeholder:text-slate-600 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/30"
          />
        </div>

        {/* Blockchain selector */}
        <select
          value={state.blockchain}
          onChange={e => onUpdate({ blockchain: e.target.value as Blockchain })}
          className="bg-slate-900/80 border border-slate-600/50 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500/50 min-w-[140px]"
        >
          {Object.entries(BLOCKCHAIN_CONFIG).map(([key, cfg]) => (
            <option key={key} value={key}>{cfg.name} ({cfg.symbol})</option>
          ))}
        </select>

        {/* Depth selector */}
        <select
          value={state.traceDepth}
          onChange={e => onUpdate({ traceDepth: parseInt(e.target.value) })}
          className="bg-slate-900/80 border border-slate-600/50 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500/50 min-w-[110px]"
        >
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(d => (
            <option key={d} value={d}>{d} hop{d > 1 ? 's' : ''}</option>
          ))}
        </select>

        {/* Direction selector */}
        <select
          value={state.traceDirection}
          onChange={e => onUpdate({ traceDirection: e.target.value as TraceDirection })}
          className="bg-slate-900/80 border border-slate-600/50 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500/50 min-w-[120px]"
        >
          <option value="both">Both</option>
          <option value="incoming">Incoming</option>
          <option value="outgoing">Outgoing</option>
        </select>

        {/* Submit */}
        <button
          type="submit"
          disabled={isLoading || !state.searchAddress.trim()}
          className="px-6 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 min-w-[100px] justify-center"
        >
          {isLoading ? (
            <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>Trace</>
          )}
        </button>
      </div>
    </form>
  );
};

// ── Wallet Detail Card ──────────────────────────────────────────────

const WalletCard: FC<{ wallet: WalletInfo; blockchain: Blockchain; compact?: boolean }> = ({ wallet, blockchain, compact }) => {
  const cfg = BLOCKCHAIN_CONFIG[blockchain];
  const tier = riskTier(wallet.riskScore);
  const labelStyle = LABEL_STYLES[wallet.label];

  if (compact) {
    return (
      <div className="bg-slate-800/50 border border-slate-700/40 rounded-lg p-3">
        <div className="flex items-center justify-between mb-1">
          <span className="font-mono text-xs text-slate-300">{shortenAddr(wallet.address, 8)}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded ${labelStyle.bg}`} style={{ color: labelStyle.color }}>
            {wallet.knownService || wallet.label}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">{formatCrypto(wallet.balance, cfg.symbol)}</span>
          <RiskBadge score={wallet.riskScore} />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xl" style={{ backgroundColor: `${cfg.color}20`, color: cfg.color }}>
            {cfg.icon}
          </div>
          <div>
            <h3 className="text-white font-semibold text-sm">
              {wallet.knownService || 'Wallet Details'}
            </h3>
            <span className={`text-xs px-2 py-0.5 rounded-full ${labelStyle.bg}`} style={{ color: labelStyle.color }}>
              {wallet.label.replace('_', ' ')}
            </span>
          </div>
        </div>
        <RiskGauge score={wallet.riskScore} />
      </div>

      <div className="bg-slate-900/60 rounded-lg p-3 mb-4 font-mono text-sm text-teal-400 break-all select-all">
        {wallet.address}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatBox label="Balance" value={formatCrypto(wallet.balance, cfg.symbol)} />
        <StatBox label="Total Received" value={formatCrypto(wallet.totalReceived, cfg.symbol)} />
        <StatBox label="Total Sent" value={formatCrypto(wallet.totalSent, cfg.symbol)} />
        <StatBox label="Transactions" value={wallet.txCount.toLocaleString()} />
      </div>

      <div className="grid grid-cols-2 gap-3 mt-3">
        <StatBox label="First Seen" value={wallet.firstSeen ? new Date(wallet.firstSeen).toLocaleDateString() : '—'} />
        <StatBox label="Last Seen" value={wallet.lastSeen ? timeAgo(wallet.lastSeen) : '—'} />
        {wallet.clusterId && <StatBox label="Cluster" value={shortenAddr(wallet.clusterId, 8)} />}
        {wallet.tags.length > 0 && <StatBox label="Tags" value={wallet.tags.join(', ')} />}
      </div>

      {/* Flags */}
      <div className="flex gap-2 mt-4">
        {wallet.isMixer && (
          <span className="px-2 py-1 bg-red-500/20 text-red-400 text-xs rounded-full font-medium border border-red-500/30">
            Mixer / Tumbler
          </span>
        )}
        {wallet.isExchange && (
          <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded-full font-medium border border-blue-500/30">
            Exchange
          </span>
        )}
      </div>
    </div>
  );
};

const StatBox: FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="bg-slate-900/40 rounded-lg px-3 py-2">
    <div className="text-xs text-slate-500 mb-0.5">{label}</div>
    <div className="text-sm text-white font-medium truncate">{value}</div>
  </div>
);

const RiskBadge: FC<{ score: number }> = ({ score }) => {
  const tier = riskTier(score);
  const color = RISK_COLORS[tier];
  return (
    <span
      className="text-[10px] font-bold px-1.5 py-0.5 rounded"
      style={{ backgroundColor: `${color}20`, color }}
    >
      {(score * 100).toFixed(0)}%
    </span>
  );
};

const RiskGauge: FC<{ score: number }> = ({ score }) => {
  const tier = riskTier(score);
  const color = RISK_COLORS[tier];
  const pct = Math.round(score * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-2 bg-slate-700 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs font-bold" style={{ color }}>{pct}%</span>
    </div>
  );
};

// ── Trace Summary Metrics ───────────────────────────────────────────

const TraceSummary: FC<{ trace: TraceResult; blockchain: Blockchain }> = ({ trace, blockchain }) => {
  const cfg = BLOCKCHAIN_CONFIG[blockchain];
  const mixerCount = trace.connectedWallets.filter(w => w.isMixer).length;
  const exchangeCount = trace.connectedWallets.filter(w => w.isExchange).length;
  const highRisk = trace.connectedWallets.filter(w => w.riskScore >= 0.65).length;
  const mixerTxCount = trace.transactions.filter(t => t.isMixerTx).length;

  const metrics = [
    { label: 'Wallets Traced', value: (trace.connectedWallets.length + 1).toString(), color: '#8B5CF6' },
    { label: 'Transactions', value: trace.transactions.length.toString(), color: '#3B82F6' },
    { label: 'Total Value', value: formatCrypto(trace.totalValueTraced, cfg.symbol), color: '#F59E0B' },
    { label: 'Depth Reached', value: `${trace.traceDepthReached} hops`, color: '#14B8A6' },
    { label: 'Mixers Found', value: mixerCount.toString(), color: mixerCount > 0 ? '#EF4444' : '#22C55E' },
    { label: 'Exchanges', value: exchangeCount.toString(), color: '#3B82F6' },
    { label: 'High Risk', value: highRisk.toString(), color: highRisk > 0 ? '#F97316' : '#22C55E' },
    { label: 'Mixer Txns', value: mixerTxCount.toString(), color: mixerTxCount > 0 ? '#EF4444' : '#22C55E' },
  ];

  return (
    <div className="grid grid-cols-4 lg:grid-cols-8 gap-2">
      {metrics.map(m => (
        <div key={m.label} className="bg-slate-800/50 border border-slate-700/40 rounded-lg px-3 py-2.5 text-center">
          <div className="text-lg font-bold" style={{ color: m.color }}>{m.value}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">{m.label}</div>
        </div>
      ))}
    </div>
  );
};

// ── Tab Selector ────────────────────────────────────────────────────

type TabId = CryptoTracerState['activeTab'];

const TAB_CONFIG: { id: TabId; label: string; description: string }[] = [
  { id: 'flow', label: 'Transaction Flow', description: 'Interactive graph' },
  { id: 'sankey', label: 'Sankey Diagram', description: 'Value flow visualization' },
  { id: 'timeline', label: 'Timeline', description: 'Transaction history' },
  { id: 'cluster', label: 'Cluster Analysis', description: 'Wallet clustering' },
  { id: 'mixer', label: 'Mixer Detection', description: 'Tumbler analysis' },
];

const TabBar: FC<{ active: TabId; onChange: (tab: TabId) => void }> = ({ active, onChange }) => (
  <div className="flex gap-1 bg-slate-800/40 rounded-lg p-1 border border-slate-700/30">
    {TAB_CONFIG.map(tab => (
      <button
        key={tab.id}
        onClick={() => onChange(tab.id)}
        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
          active === tab.id
            ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/20'
            : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
        }`}
      >
        {tab.label}
      </button>
    ))}
  </div>
);

// ── Flow Graph Toolbar ──────────────────────────────────────────────

const FlowToolbar: FC<{
  layout: string;
  onLayoutChange: (l: string) => void;
  highlightMixers: boolean;
  onToggleMixers: () => void;
  onFit: () => void;
  onExport: () => void;
}> = ({ layout, onLayoutChange, highlightMixers, onToggleMixers, onFit, onExport }) => (
  <div className="flex items-center gap-2 bg-slate-800/60 rounded-lg px-3 py-2 border border-slate-700/40">
    <span className="text-xs text-slate-500 mr-1">Layout:</span>
    {['dagre', 'cose', 'breadthfirst', 'concentric'].map(l => (
      <button
        key={l}
        onClick={() => onLayoutChange(l)}
        className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
          layout === l ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
        }`}
      >
        {l === 'dagre' ? 'Hierarchical' : l === 'cose' ? 'Force' : l === 'breadthfirst' ? 'Tree' : 'Concentric'}
      </button>
    ))}
    <div className="w-px h-5 bg-slate-700 mx-1" />
    <button
      onClick={onToggleMixers}
      className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
        highlightMixers ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'text-slate-400 hover:text-white'
      }`}
    >
      Highlight Mixers
    </button>
    <div className="flex-1" />
    <button onClick={onFit} className="px-2.5 py-1 rounded text-xs text-slate-400 hover:text-white hover:bg-slate-700/50">
      Fit View
    </button>
    <button onClick={onExport} className="px-2.5 py-1 rounded text-xs text-slate-400 hover:text-white hover:bg-slate-700/50">
      Export PNG
    </button>
  </div>
);

// ── Transaction Detail Panel ────────────────────────────────────────

const TransactionDetailPanel: FC<{
  tx: Transaction | null;
  blockchain: Blockchain;
  onClose: () => void;
}> = ({ tx, blockchain, onClose }) => {
  if (!tx) return null;
  const cfg = BLOCKCHAIN_CONFIG[blockchain];

  return (
    <div className="bg-slate-800/80 border border-slate-700/50 rounded-xl p-4 w-80">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-white font-semibold text-sm">Transaction Details</h4>
        <button onClick={onClose} className="text-slate-400 hover:text-white text-lg">&times;</button>
      </div>

      <div className="space-y-2.5">
        <DetailRow label="TX Hash" value={shortenAddr(tx.txHash, 10)} mono />
        <DetailRow label="Block" value={`#${tx.blockNumber.toLocaleString()}`} />
        <DetailRow label="Time" value={new Date(tx.blockTimestamp).toLocaleString()} />
        <div className="w-full h-px bg-slate-700/50" />
        <DetailRow label="From" value={shortenAddr(tx.fromAddress, 8)} mono />
        {tx.fromService && <DetailRow label="From Service" value={tx.fromService} />}
        <DetailRow label="To" value={shortenAddr(tx.toAddress, 8)} mono />
        {tx.toService && <DetailRow label="To Service" value={tx.toService} />}
        <div className="w-full h-px bg-slate-700/50" />
        <DetailRow label="Amount" value={formatCrypto(tx.amount, cfg.symbol)} highlight />
        <DetailRow label="USD Value" value={formatUsd(tx.amountUsd)} />
        <DetailRow label="Fee" value={formatCrypto(tx.fee, cfg.symbol)} />
        {tx.isMixerTx && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-lg">
            <span className="text-red-400 text-xs font-medium">Mixer Transaction Detected</span>
          </div>
        )}
      </div>

      <div className="flex gap-2 mt-4">
        <button className="flex-1 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-medium transition-colors">
          Add to Case
        </button>
        <button className="flex-1 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-xs font-medium transition-colors">
          Trace From Here
        </button>
      </div>
    </div>
  );
};

const DetailRow: FC<{ label: string; value: string; mono?: boolean; highlight?: boolean }> = ({ label, value, mono, highlight }) => (
  <div className="flex justify-between items-center">
    <span className="text-xs text-slate-500">{label}</span>
    <span className={`text-xs ${highlight ? 'text-yellow-400 font-bold' : 'text-slate-300'} ${mono ? 'font-mono' : ''}`}>
      {value}
    </span>
  </div>
);

// ── Node Info Sidebar ───────────────────────────────────────────────

const NodeInfoPanel: FC<{
  nodeId: string | null;
  trace: TraceResult | null;
  blockchain: Blockchain;
  onClose: () => void;
  onTraceFrom: (addr: string) => void;
}> = ({ nodeId, trace, blockchain, onClose, onTraceFrom }) => {
  if (!nodeId || !trace) return null;

  const wallet = [trace.wallet, ...trace.connectedWallets].find(w => w.address === nodeId);
  if (!wallet) return null;

  const cfg = BLOCKCHAIN_CONFIG[blockchain];
  const labelStyle = LABEL_STYLES[wallet.label];
  const inTxs = trace.transactions.filter(t => t.toAddress === nodeId);
  const outTxs = trace.transactions.filter(t => t.fromAddress === nodeId);

  return (
    <div className="bg-slate-800/80 border-l border-slate-700/50 w-80 flex-shrink-0 overflow-y-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-white font-semibold text-sm">Wallet Info</h4>
        <button onClick={onClose} className="text-slate-400 hover:text-white">&times;</button>
      </div>

      {/* Address */}
      <div className="bg-slate-900/60 rounded-lg p-2 font-mono text-xs text-teal-400 break-all select-all">
        {wallet.address}
      </div>

      {/* Label & Risk */}
      <div className="flex items-center justify-between">
        <span className={`text-xs px-2 py-0.5 rounded-full ${labelStyle.bg}`} style={{ color: labelStyle.color }}>
          {wallet.knownService || wallet.label.replace('_', ' ')}
        </span>
        <RiskGauge score={wallet.riskScore} />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2">
        <StatBox label="Balance" value={formatCrypto(wallet.balance, cfg.symbol)} />
        <StatBox label="Txns" value={wallet.txCount.toLocaleString()} />
        <StatBox label="Incoming" value={inTxs.length.toString()} />
        <StatBox label="Outgoing" value={outTxs.length.toString()} />
      </div>

      {/* Top transactions */}
      <div>
        <h5 className="text-xs text-slate-500 font-medium mb-2">Recent Transactions</h5>
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {[...inTxs, ...outTxs].sort((a, b) => new Date(b.blockTimestamp).getTime() - new Date(a.blockTimestamp).getTime()).slice(0, 10).map(tx => (
            <div key={tx.id} className="flex items-center justify-between bg-slate-900/40 rounded px-2 py-1.5">
              <div className="flex items-center gap-1.5">
                <span className={`text-[10px] ${tx.toAddress === nodeId ? 'text-green-400' : 'text-red-400'}`}>
                  {tx.toAddress === nodeId ? 'IN' : 'OUT'}
                </span>
                <span className="text-xs text-slate-400 font-mono">{shortenAddr(tx.txHash, 6)}</span>
              </div>
              <span className="text-xs text-yellow-400 font-mono">{formatCrypto(tx.amount, cfg.symbol)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2">
        <button
          onClick={() => onTraceFrom(wallet.address)}
          className="w-full px-3 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-medium transition-colors"
        >
          Trace From This Wallet
        </button>
        <button className="w-full px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-xs font-medium transition-colors">
          Run Mixer Detection
        </button>
        <button className="w-full px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-xs font-medium transition-colors">
          Find Cluster
        </button>
        <button className="w-full px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-xs font-medium transition-colors">
          Add to Case
        </button>
      </div>
    </div>
  );
};

/* ================================================================== */
/*  6. VISUALIZATION TABS                                              */
/* ================================================================== */

// ── Tab: Transaction Flow Graph (Cytoscape) ─────────────────────────

const FlowGraphTab: FC<{
  trace: TraceResult;
  blockchain: Blockchain;
  state: CryptoTracerState;
  onUpdate: (partial: Partial<CryptoTracerState>) => void;
  onTraceFrom: (addr: string) => void;
}> = ({ trace, blockchain, state, onUpdate, onTraceFrom }) => {
  const cyRef = useRef<Core | null>(null);

  const flowGraph = useMemo(() => traceToFlowGraph(trace), [trace]);
  const elements = useMemo(
    () => flowGraphToElements(flowGraph, state.highlightMixers),
    [flowGraph, state.highlightMixers],
  );
  const stylesheet = useMemo(() => buildFlowStylesheet(), []);

  const handleCyInit = useCallback((cy: Core) => {
    cyRef.current = cy;

    cy.on('tap', 'node', (evt: EventObject) => {
      const node = evt.target as NodeSingular;
      onUpdate({ selectedNodeId: node.data('fullAddress') || node.id() });
    });

    cy.on('tap', 'edge', (evt: EventObject) => {
      const edge = evt.target;
      const txHash = edge.data('txHash');
      const tx = trace.transactions.find(t => t.txHash === txHash);
      if (tx) onUpdate({ selectedTx: tx });
    });

    cy.on('tap', (evt: EventObject) => {
      if (evt.target === cy) {
        onUpdate({ selectedNodeId: null, selectedTx: null });
      }
    });

    // Hover highlight
    cy.on('mouseover', 'node', (evt: EventObject) => {
      const node = evt.target;
      const neighborhood = node.neighborhood().add(node);
      cy.elements().not(neighborhood).addClass('faded');
      neighborhood.removeClass('faded');
    });
    cy.on('mouseout', 'node', () => {
      cy.elements().removeClass('faded');
    });

    // Run initial layout
    const layout = cy.layout(buildFlowLayout(state.flowLayoutName));
    layout.run();
  }, [trace, state.flowLayoutName, onUpdate]);

  const handleLayoutChange = useCallback((layoutName: string) => {
    onUpdate({ flowLayoutName: layoutName as any });
    if (cyRef.current) {
      cyRef.current.layout(buildFlowLayout(layoutName)).run();
    }
  }, [onUpdate]);

  const handleFit = useCallback(() => {
    cyRef.current?.fit(undefined, 60);
  }, []);

  const handleExport = useCallback(() => {
    if (!cyRef.current) return;
    const png = cyRef.current.png({ full: true, scale: 2, bg: '#0F172A' });
    const link = document.createElement('a');
    link.href = png;
    link.download = `crypto-trace-${trace.wallet.address.slice(0, 10)}.png`;
    link.click();
  }, [trace]);

  return (
    <div className="flex flex-col h-[600px]">
      <FlowToolbar
        layout={state.flowLayoutName}
        onLayoutChange={handleLayoutChange}
        highlightMixers={state.highlightMixers}
        onToggleMixers={() => onUpdate({ highlightMixers: !state.highlightMixers })}
        onFit={handleFit}
        onExport={handleExport}
      />

      <div className="flex flex-1 mt-2 gap-2 min-h-0">
        {/* Graph canvas */}
        <div className="flex-1 bg-slate-900/60 rounded-xl border border-slate-700/40 relative overflow-hidden">
          <CytoscapeComponent
            elements={elements}
            stylesheet={stylesheet}
            layout={buildFlowLayout(state.flowLayoutName)}
            cy={handleCyInit}
            style={{ width: '100%', height: '100%' }}
            className="bg-transparent"
          />
          {/* Legend overlay */}
          <div className="absolute bottom-3 left-3 bg-slate-900/90 border border-slate-700/50 rounded-lg p-3 text-xs">
            <div className="text-slate-400 font-medium mb-2">Legend</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {(['exchange', 'mixer', 'darknet_market', 'personal', 'suspect', 'unknown'] as WalletLabelType[]).map(label => (
                <div key={label} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: LABEL_STYLES[label].color }} />
                  <span className="text-slate-400 capitalize">{label.replace('_', ' ')}</span>
                </div>
              ))}
              <div className="flex items-center gap-1.5 col-span-2 mt-1 pt-1 border-t border-slate-700/50">
                <div className="w-6 h-0.5 bg-red-500" style={{ borderTop: '2px dashed #EF4444' }} />
                <span className="text-slate-400">Mixer transaction</span>
              </div>
            </div>
          </div>
          {/* Node count */}
          <div className="absolute top-3 right-3 bg-slate-900/80 px-2 py-1 rounded text-[10px] text-slate-500">
            {flowGraph.nodes.length} nodes &middot; {flowGraph.edges.length} edges
          </div>
        </div>

        {/* Side panel */}
        {state.selectedNodeId ? (
          <NodeInfoPanel
            nodeId={state.selectedNodeId}
            trace={trace}
            blockchain={blockchain}
            onClose={() => onUpdate({ selectedNodeId: null })}
            onTraceFrom={onTraceFrom}
          />
        ) : state.selectedTx ? (
          <TransactionDetailPanel
            tx={state.selectedTx}
            blockchain={blockchain}
            onClose={() => onUpdate({ selectedTx: null })}
          />
        ) : null}
      </div>
    </div>
  );
};

// ── Tab: Sankey Diagram (ECharts) ───────────────────────────────────

const SankeyTab: FC<{ trace: TraceResult; blockchain: Blockchain }> = ({ trace, blockchain }) => {
  const cfg = BLOCKCHAIN_CONFIG[blockchain];

  const option = useMemo(() => {
    // Build Sankey nodes and links from trace
    const nodeSet = new Set<string>();
    const links: { source: string; target: string; value: number }[] = [];

    for (const tx of trace.transactions) {
      const fromLabel = tx.fromService
        ? `${tx.fromService}\n${shortenAddr(tx.fromAddress, 4)}`
        : shortenAddr(tx.fromAddress, 6);
      const toLabel = tx.toService
        ? `${tx.toService}\n${shortenAddr(tx.toAddress, 4)}`
        : shortenAddr(tx.toAddress, 6);

      nodeSet.add(fromLabel);
      nodeSet.add(toLabel);

      // Aggregate links between same node pairs
      const existing = links.find(l => l.source === fromLabel && l.target === toLabel);
      if (existing) {
        existing.value += tx.amount;
      } else {
        links.push({ source: fromLabel, target: toLabel, value: tx.amount });
      }
    }

    // Color nodes by label
    const allWallets = [trace.wallet, ...trace.connectedWallets];
    const nodeData = Array.from(nodeSet).map(name => {
      const wallet = allWallets.find(w =>
        name.includes(shortenAddr(w.address, 4)) || name.includes(shortenAddr(w.address, 6))
      );
      const color = wallet ? (LABEL_STYLES[wallet.label]?.color || '#475569') : '#475569';
      return { name, itemStyle: { color, borderColor: color } };
    });

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        triggerOn: 'mousemove',
        backgroundColor: '#1E293B',
        borderColor: '#334155',
        textStyle: { color: '#E2E8F0', fontSize: 11 },
        formatter: (params: any) => {
          if (params.dataType === 'edge') {
            return `${params.data.source} &rarr; ${params.data.target}<br/>` +
              `<b>${formatCrypto(params.data.value, cfg.symbol)}</b>`;
          }
          return params.name;
        },
      },
      series: [{
        type: 'sankey',
        layoutIterations: 64,
        emphasis: { focus: 'adjacency' },
        nodeAlign: 'left',
        orient: 'horizontal',
        nodeGap: 12,
        nodeWidth: 16,
        lineStyle: {
          color: 'gradient',
          curveness: 0.5,
          opacity: 0.4,
        },
        label: {
          color: '#CBD5E1',
          fontSize: 10,
          fontFamily: 'JetBrains Mono, monospace',
        },
        data: nodeData,
        links: links.filter(l => l.source !== l.target),  // Remove self-loops
      }],
    };
  }, [trace, blockchain, cfg.symbol]);

  return (
    <div className="bg-slate-900/60 rounded-xl border border-slate-700/40 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white font-semibold text-sm">Value Flow Diagram</h3>
        <span className="text-xs text-slate-500">
          {trace.transactions.length} transactions &middot; {formatCrypto(trace.totalValueTraced, cfg.symbol)} total
        </span>
      </div>
      <ReactECharts option={option} style={{ height: '520px' }} opts={{ renderer: 'canvas' }} />
    </div>
  );
};

// ── Tab: Transaction Timeline (ECharts) ─────────────────────────────

const TimelineTab: FC<{ trace: TraceResult; blockchain: Blockchain }> = ({ trace, blockchain }) => {
  const cfg = BLOCKCHAIN_CONFIG[blockchain];

  const { timelineOption, volumeOption, topWallets } = useMemo(() => {
    // Sort transactions by time
    const sorted = [...trace.transactions].sort(
      (a, b) => new Date(a.blockTimestamp).getTime() - new Date(b.blockTimestamp).getTime()
    );

    // Build scatter timeline
    const scatterData = sorted.map(tx => [
      tx.blockTimestamp,
      tx.amount,
      tx.isMixerTx ? 1 : 0,
      tx.txHash,
      formatUsd(tx.amountUsd),
    ]);

    const scatterMixer = scatterData.filter(d => d[2] === 1);
    const scatterNormal = scatterData.filter(d => d[2] === 0);

    const tOpt = {
      backgroundColor: 'transparent',
      tooltip: {
        backgroundColor: '#1E293B',
        borderColor: '#334155',
        textStyle: { color: '#E2E8F0', fontSize: 11 },
        formatter: (p: any) => {
          const d = p.data;
          return `<b>${new Date(d[0]).toLocaleString()}</b><br/>` +
            `Amount: ${formatCrypto(d[1], cfg.symbol)}<br/>` +
            `USD: ${d[4]}<br/>` +
            `TX: ${shortenAddr(d[3], 8)}` +
            (d[2] ? '<br/><span style="color:#EF4444">MIXER TX</span>' : '');
        },
      },
      xAxis: {
        type: 'time',
        axisLabel: { color: '#64748B', fontSize: 10 },
        axisLine: { lineStyle: { color: '#334155' } },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'log',
        name: `Amount (${cfg.symbol})`,
        nameTextStyle: { color: '#64748B', fontSize: 10 },
        axisLabel: { color: '#64748B', fontSize: 10 },
        axisLine: { lineStyle: { color: '#334155' } },
        splitLine: { lineStyle: { color: '#1E293B' } },
      },
      dataZoom: [
        { type: 'inside', start: 0, end: 100 },
        { type: 'slider', bottom: 10, height: 20, borderColor: '#334155', fillerColor: '#6D28D920' },
      ],
      series: [
        {
          name: 'Normal',
          type: 'scatter',
          symbolSize: (val: number[]) => Math.max(6, Math.min(30, val[1] * 3)),
          data: scatterNormal,
          itemStyle: { color: cfg.color, opacity: 0.7 },
        },
        {
          name: 'Mixer',
          type: 'scatter',
          symbolSize: (val: number[]) => Math.max(8, Math.min(35, val[1] * 3)),
          symbol: 'diamond',
          data: scatterMixer,
          itemStyle: { color: '#EF4444', opacity: 0.9 },
        },
      ],
      legend: {
        data: ['Normal', 'Mixer'],
        textStyle: { color: '#94A3B8', fontSize: 11 },
        top: 5,
        right: 10,
      },
    };

    // Daily volume bars
    const dailyMap = new Map<string, { incoming: number; outgoing: number; suspicious: number }>();
    for (const tx of sorted) {
      const day = tx.blockTimestamp.split('T')[0];
      const entry = dailyMap.get(day) || { incoming: 0, outgoing: 0, suspicious: 0 };
      if (tx.toAddress === trace.wallet.address) {
        entry.incoming += tx.amount;
      } else {
        entry.outgoing += tx.amount;
      }
      if (tx.isMixerTx) entry.suspicious += tx.amount;
      dailyMap.set(day, entry);
    }

    const days = Array.from(dailyMap.keys()).sort();
    const incoming = days.map(d => dailyMap.get(d)!.incoming);
    const outgoing = days.map(d => dailyMap.get(d)!.outgoing);
    const suspicious = days.map(d => dailyMap.get(d)!.suspicious);

    const vOpt = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#1E293B',
        borderColor: '#334155',
        textStyle: { color: '#E2E8F0', fontSize: 11 },
      },
      legend: {
        data: ['Incoming', 'Outgoing', 'Suspicious'],
        textStyle: { color: '#94A3B8', fontSize: 11 },
        top: 5,
      },
      xAxis: {
        type: 'category',
        data: days,
        axisLabel: { color: '#64748B', fontSize: 9, rotate: 45 },
        axisLine: { lineStyle: { color: '#334155' } },
      },
      yAxis: {
        type: 'value',
        name: cfg.symbol,
        nameTextStyle: { color: '#64748B', fontSize: 10 },
        axisLabel: { color: '#64748B', fontSize: 10 },
        splitLine: { lineStyle: { color: '#1E293B' } },
      },
      series: [
        { name: 'Incoming', type: 'bar', stack: 'volume', data: incoming, itemStyle: { color: '#14B8A6' } },
        { name: 'Outgoing', type: 'bar', stack: 'volume', data: outgoing, itemStyle: { color: '#6D28D9' } },
        { name: 'Suspicious', type: 'line', data: suspicious, itemStyle: { color: '#EF4444' }, lineStyle: { width: 2 }, areaStyle: { color: '#EF444420' } },
      ],
    };

    // Top wallets by volume
    const walletVolume = new Map<string, number>();
    for (const tx of sorted) {
      walletVolume.set(tx.fromAddress, (walletVolume.get(tx.fromAddress) || 0) + tx.amount);
      walletVolume.set(tx.toAddress, (walletVolume.get(tx.toAddress) || 0) + tx.amount);
    }
    const topW = Array.from(walletVolume.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([addr, vol]) => {
        const w = [trace.wallet, ...trace.connectedWallets].find(w => w.address === addr);
        return { address: addr, volume: vol, wallet: w || null };
      });

    return { timelineOption: tOpt, volumeOption: vOpt, topWallets: topW };
  }, [trace, blockchain, cfg]);

  return (
    <div className="space-y-4">
      <div className="bg-slate-900/60 rounded-xl border border-slate-700/40 p-4">
        <h3 className="text-white font-semibold text-sm mb-3">Transaction Timeline</h3>
        <ReactECharts option={timelineOption} style={{ height: '350px' }} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-slate-900/60 rounded-xl border border-slate-700/40 p-4">
          <h3 className="text-white font-semibold text-sm mb-3">Daily Volume</h3>
          <ReactECharts option={volumeOption} style={{ height: '280px' }} />
        </div>

        <div className="bg-slate-900/60 rounded-xl border border-slate-700/40 p-4">
          <h3 className="text-white font-semibold text-sm mb-3">Top Counterparties</h3>
          <div className="space-y-2">
            {topWallets.map((tw, idx) => (
              <div key={tw.address} className="flex items-center gap-2 bg-slate-800/50 rounded-lg px-3 py-2">
                <span className="text-xs text-slate-600 w-4">{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-mono text-slate-300 truncate">{shortenAddr(tw.address, 8)}</div>
                  <div className="text-[10px] text-slate-500">
                    {tw.wallet?.knownService || tw.wallet?.label.replace('_', ' ') || 'unknown'}
                  </div>
                </div>
                <span className="text-xs text-yellow-400 font-mono whitespace-nowrap">
                  {formatCrypto(tw.volume, BLOCKCHAIN_CONFIG[blockchain].symbol)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Tab: Cluster Analysis ───────────────────────────────────────────

const ClusterTab: FC<{ address: string; blockchain: Blockchain }> = ({ address, blockchain }) => {
  const { data: cluster, isLoading, error } = useQuery({
    queryKey: ['cluster', address, blockchain],
    queryFn: () => api.cluster(address, blockchain),
  });

  if (isLoading) return <LoadingPlaceholder message="Analyzing wallet cluster..." />;
  if (error || !cluster) return <ErrorPlaceholder message="Cluster analysis failed" />;

  const cfg = BLOCKCHAIN_CONFIG[blockchain];
  const sortedWallets = [...cluster.wallets].sort((a, b) => b.balance - a.balance);
  const labelCounts = cluster.wallets.reduce<Record<string, number>>((acc, w) => {
    acc[w.label] = (acc[w.label] || 0) + 1;
    return acc;
  }, {});

  const pieOption = {
    backgroundColor: 'transparent',
    tooltip: { backgroundColor: '#1E293B', borderColor: '#334155', textStyle: { color: '#E2E8F0' } },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      center: ['50%', '50%'],
      data: Object.entries(labelCounts).map(([label, count]) => ({
        name: label.replace('_', ' '),
        value: count,
        itemStyle: { color: LABEL_STYLES[label as WalletLabelType]?.color || '#475569' },
      })),
      label: { color: '#94A3B8', fontSize: 10 },
      emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0, 0, 0, 0.5)' } },
    }],
  };

  return (
    <div className="space-y-4">
      {/* Cluster Summary */}
      <div className="bg-slate-900/60 rounded-xl border border-slate-700/40 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-white font-semibold">Cluster: {shortenAddr(cluster.clusterId, 10)}</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Addresses likely controlled by the same entity (common-input-ownership heuristic)
            </p>
          </div>
          <RiskGauge score={cluster.riskScore} />
        </div>

        <div className="grid grid-cols-4 gap-3">
          <StatBox label="Addresses" value={cluster.totalAddresses.toString()} />
          <StatBox label="Total Value" value={formatCrypto(cluster.totalValue, cfg.symbol)} />
          <StatBox label="Known Services" value={cluster.knownServices.length.toString()} />
          <StatBox label="Risk Score" value={`${(cluster.riskScore * 100).toFixed(0)}%`} />
        </div>

        {cluster.knownServices.length > 0 && (
          <div className="flex gap-2 mt-3">
            {cluster.knownServices.map(svc => (
              <span key={svc} className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded-full border border-blue-500/30">
                {svc}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Pie chart */}
        <div className="bg-slate-900/60 rounded-xl border border-slate-700/40 p-4">
          <h4 className="text-white font-semibold text-sm mb-2">Label Distribution</h4>
          <ReactECharts option={pieOption} style={{ height: '250px' }} />
        </div>

        {/* Wallet list */}
        <div className="lg:col-span-2 bg-slate-900/60 rounded-xl border border-slate-700/40 p-4">
          <h4 className="text-white font-semibold text-sm mb-3">
            Cluster Addresses ({sortedWallets.length})
          </h4>
          <div className="space-y-1.5 max-h-[340px] overflow-y-auto pr-1">
            {sortedWallets.map(w => (
              <div key={w.id} className="flex items-center gap-3 bg-slate-800/50 rounded-lg px-3 py-2 hover:bg-slate-700/50 transition-colors">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: LABEL_STYLES[w.label].color }} />
                <span className="font-mono text-xs text-slate-300 flex-1 truncate">{w.address}</span>
                <span className="text-xs text-slate-500 min-w-[80px] text-right">
                  {formatCrypto(w.balance, cfg.symbol)}
                </span>
                <RiskBadge score={w.riskScore} />
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${LABEL_STYLES[w.label].bg}`}
                  style={{ color: LABEL_STYLES[w.label].color }}
                >
                  {w.knownService || w.label.replace('_', ' ')}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Tab: Mixer Detection ────────────────────────────────────────────

const MixerTab: FC<{ address: string; blockchain: Blockchain }> = ({ address, blockchain }) => {
  const { data: results, isLoading, error } = useQuery({
    queryKey: ['mixer', address, blockchain],
    queryFn: () => api.detectMixer(address, blockchain),
  });

  if (isLoading) return <LoadingPlaceholder message="Analyzing mixer patterns..." />;
  if (error || !results) return <ErrorPlaceholder message="Mixer detection failed" />;

  return (
    <div className="space-y-4">
      {results.map(result => (
        <div
          key={result.address}
          className={`bg-slate-900/60 rounded-xl border p-5 ${
            result.isMixer ? 'border-red-500/40' : 'border-slate-700/40'
          }`}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${
                result.isMixer ? 'bg-red-500/20' : 'bg-green-500/20'
              }`}>
                {result.isMixer ? '\u21BB' : '\u2713'}
              </div>
              <div>
                <h3 className={`font-semibold ${result.isMixer ? 'text-red-400' : 'text-green-400'}`}>
                  {result.isMixer ? 'Mixer Activity Detected' : 'No Mixer Activity Detected'}
                </h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">{shortenAddr(result.address, 12)}</p>
              </div>
            </div>

            <div className="text-right">
              <div className="text-2xl font-bold" style={{ color: result.isMixer ? '#EF4444' : '#22C55E' }}>
                {(result.confidence * 100).toFixed(1)}%
              </div>
              <div className="text-[10px] text-slate-500">Confidence</div>
            </div>
          </div>

          {/* Confidence gauge */}
          <div className="mb-4">
            <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-1000"
                style={{
                  width: `${result.confidence * 100}%`,
                  backgroundColor: result.isMixer ? '#EF4444' : '#22C55E',
                }}
              />
            </div>
          </div>

          {result.mixerType && (
            <div className="mb-4">
              <span className="text-xs text-slate-500">Detected Mixer Type: </span>
              <span className="text-sm text-red-400 font-semibold capitalize">
                {result.mixerType.replace('_', ' ')}
              </span>
            </div>
          )}

          {/* Evidence */}
          {result.evidence.length > 0 && (
            <div>
              <h4 className="text-xs text-slate-500 font-medium mb-2">Detection Evidence</h4>
              <div className="space-y-1.5">
                {result.evidence.map((ev, i) => (
                  <div key={i} className="flex items-start gap-2 bg-slate-800/50 rounded-lg px-3 py-2">
                    <span className="text-red-400 text-xs mt-0.5">{'\u2022'}</span>
                    <span className="text-xs text-slate-300">{ev}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

// ── Utility sub-components ──────────────────────────────────────────

const LoadingPlaceholder: FC<{ message: string }> = ({ message }) => (
  <div className="flex flex-col items-center justify-center py-20">
    <div className="w-10 h-10 border-3 border-violet-500/30 border-t-violet-500 rounded-full animate-spin mb-4" />
    <span className="text-sm text-slate-400">{message}</span>
  </div>
);

const ErrorPlaceholder: FC<{ message: string }> = ({ message }) => (
  <div className="flex flex-col items-center justify-center py-20">
    <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center text-red-400 text-lg mb-3">!</div>
    <span className="text-sm text-slate-400">{message}</span>
  </div>
);

const EmptyState: FC = () => (
  <div className="flex flex-col items-center justify-center py-24 text-center">
    <div className="w-16 h-16 rounded-2xl bg-yellow-500/10 flex items-center justify-center text-3xl mb-4">
      {BLOCKCHAIN_CONFIG.bitcoin.icon}
    </div>
    <h3 className="text-white font-semibold text-lg mb-2">Cryptocurrency Tracer</h3>
    <p className="text-slate-500 text-sm max-w-md mb-6">
      Enter a Bitcoin, Ethereum, or other cryptocurrency wallet address above to trace
      transaction flows, analyze wallet clusters, and detect mixer usage.
    </p>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-2xl">
      {[
        { title: 'Transaction Tracing', desc: 'Follow the money across multiple hops with interactive flow visualization' },
        { title: 'Wallet Clustering', desc: 'Identify addresses controlled by the same entity using co-spending heuristics' },
        { title: 'Mixer Detection', desc: 'Detect CoinJoin, Wasabi, Tornado Cash, and other tumbler patterns' },
      ].map(item => (
        <div key={item.title} className="bg-slate-800/50 border border-slate-700/40 rounded-lg p-4 text-left">
          <h4 className="text-white text-sm font-medium mb-1">{item.title}</h4>
          <p className="text-xs text-slate-500">{item.desc}</p>
        </div>
      ))}
    </div>
  </div>
);

/* ================================================================== */
/*  7. MAIN PAGE COMPONENT                                             */
/* ================================================================== */

const CryptoTracerPage: FC = () => {
  const isDemoTenant = useIsDemoTenant();
  const queryClient = useQueryClient();

  const [state, setState] = useState<CryptoTracerState>({
    searchAddress: '',
    blockchain: 'bitcoin',
    traceDepth: 3,
    traceDirection: 'both',
    activeTab: 'flow',
    selectedNodeId: null,
    selectedTx: null,
    flowLayoutName: 'dagre',
    showRiskOverlay: true,
    highlightMixers: true,
    caseId: null,
  });

  const update = useCallback((partial: Partial<CryptoTracerState>) => {
    setState(prev => ({ ...prev, ...partial }));
  }, []);

  // ── Trace mutation ────────────────────────────────────────────────
  const traceMutation = useMutation({
    mutationFn: () => api.trace(state.searchAddress.trim(), state.blockchain, state.traceDepth, state.traceDirection),
    onSuccess: () => {
      update({ activeTab: 'flow', selectedNodeId: null, selectedTx: null });
    },
  });

  const handleSubmit = useCallback(() => {
    if (!isDemoTenant) return;
    if (state.searchAddress.trim()) {
      traceMutation.mutate();
    }
  }, [isDemoTenant, state.searchAddress, traceMutation]);

  const handleTraceFrom = useCallback((addr: string) => {
    if (!isDemoTenant) return;
    update({ searchAddress: addr });
    traceMutation.mutate();
  }, [isDemoTenant, update, traceMutation]);

  const trace = isDemoTenant ? (traceMutation.data || null) : null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <div className="max-w-[1600px] mx-auto px-6 py-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Crypto Tracer</h1>
            <p className="text-slate-500 text-sm mt-0.5">
              Cryptocurrency transaction tracing, wallet clustering &amp; mixer detection
            </p>
          </div>
          {trace && (
            <div className="flex gap-2">
              <button className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm font-medium transition-colors">
                Export Report
              </button>
              <button className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-medium transition-colors">
                Add to Case
              </button>
            </div>
          )}
        </div>

        {/* Search */}
        <SearchPanel
          state={state}
          onUpdate={update}
          onSubmit={handleSubmit}
          isLoading={traceMutation.isPending}
        />

        {/* Results */}
        {traceMutation.isError && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-sm">
            Trace failed. Please verify the wallet address and try again.
          </div>
        )}

        {trace ? (
          <>
            {/* Wallet card + summary metrics */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <WalletCard wallet={trace.wallet} blockchain={state.blockchain} />
              <div className="xl:col-span-2">
                <TraceSummary trace={trace} blockchain={state.blockchain} />
                {/* Connected wallets preview */}
                <div className="mt-3">
                  <h4 className="text-xs text-slate-500 font-medium mb-2">High Risk Connections</h4>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                    {trace.connectedWallets
                      .filter(w => w.riskScore >= 0.5)
                      .sort((a, b) => b.riskScore - a.riskScore)
                      .slice(0, 4)
                      .map(w => (
                        <WalletCard key={w.id} wallet={w} blockchain={state.blockchain} compact />
                      ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Visualization tabs */}
            <TabBar active={state.activeTab} onChange={tab => update({ activeTab: tab })} />

            {state.activeTab === 'flow' && (
              <FlowGraphTab
                trace={trace}
                blockchain={state.blockchain}
                state={state}
                onUpdate={update}
                onTraceFrom={handleTraceFrom}
              />
            )}
            {state.activeTab === 'sankey' && (
              <SankeyTab trace={trace} blockchain={state.blockchain} />
            )}
            {state.activeTab === 'timeline' && (
              <TimelineTab trace={trace} blockchain={state.blockchain} />
            )}
            {state.activeTab === 'cluster' && (
              <ClusterTab address={trace.wallet.address} blockchain={state.blockchain} />
            )}
            {state.activeTab === 'mixer' && (
              <MixerTab address={trace.wallet.address} blockchain={state.blockchain} />
            )}

            {/* Transaction table */}
            <div className="bg-slate-900/60 rounded-xl border border-slate-700/40 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-semibold text-sm">
                  Transaction Log ({trace.transactions.length})
                </h3>
                <button className="text-xs text-slate-400 hover:text-white transition-colors">
                  Export CSV
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-700/50">
                      <th className="text-left text-slate-500 font-medium py-2 px-2">TX Hash</th>
                      <th className="text-left text-slate-500 font-medium py-2 px-2">Time</th>
                      <th className="text-left text-slate-500 font-medium py-2 px-2">From</th>
                      <th className="text-left text-slate-500 font-medium py-2 px-2">To</th>
                      <th className="text-right text-slate-500 font-medium py-2 px-2">Amount</th>
                      <th className="text-right text-slate-500 font-medium py-2 px-2">USD</th>
                      <th className="text-center text-slate-500 font-medium py-2 px-2">Mixer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trace.transactions
                      .sort((a, b) => new Date(b.blockTimestamp).getTime() - new Date(a.blockTimestamp).getTime())
                      .slice(0, 50)
                      .map(tx => (
                        <tr
                          key={tx.id}
                          className={`border-b border-slate-800/50 hover:bg-slate-800/30 cursor-pointer transition-colors ${
                            tx.isMixerTx ? 'bg-red-500/5' : ''
                          }`}
                          onClick={() => update({ selectedTx: tx, activeTab: 'flow' })}
                        >
                          <td className="py-2 px-2 font-mono text-teal-400">{shortenAddr(tx.txHash, 8)}</td>
                          <td className="py-2 px-2 text-slate-400">{timeAgo(tx.blockTimestamp)}</td>
                          <td className="py-2 px-2">
                            <div className="flex items-center gap-1">
                              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: LABEL_STYLES[tx.fromLabel]?.color || '#475569' }} />
                              <span className="font-mono text-slate-300">{shortenAddr(tx.fromAddress, 6)}</span>
                              {tx.fromService && <span className="text-[10px] text-slate-500">({tx.fromService})</span>}
                            </div>
                          </td>
                          <td className="py-2 px-2">
                            <div className="flex items-center gap-1">
                              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: LABEL_STYLES[tx.toLabel]?.color || '#475569' }} />
                              <span className="font-mono text-slate-300">{shortenAddr(tx.toAddress, 6)}</span>
                              {tx.toService && <span className="text-[10px] text-slate-500">({tx.toService})</span>}
                            </div>
                          </td>
                          <td className="py-2 px-2 text-right font-mono text-yellow-400">
                            {formatCrypto(tx.amount, BLOCKCHAIN_CONFIG[state.blockchain].symbol)}
                          </td>
                          <td className="py-2 px-2 text-right text-slate-400">{formatUsd(tx.amountUsd)}</td>
                          <td className="py-2 px-2 text-center">
                            {tx.isMixerTx && (
                              <span className="px-1.5 py-0.5 bg-red-500/20 text-red-400 text-[10px] rounded-full font-medium">
                                MIXER
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {trace.transactions.length > 50 && (
                <div className="text-center mt-3">
                  <span className="text-xs text-slate-500">
                    Showing 50 of {trace.transactions.length} transactions
                  </span>
                </div>
              )}
            </div>
          </>
        ) : !traceMutation.isPending ? (
          <EmptyState />
        ) : null}
      </div>
    </div>
  );
};

export default CryptoTracerPage;

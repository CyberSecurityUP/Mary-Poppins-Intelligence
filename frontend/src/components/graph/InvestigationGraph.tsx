/**
 * InvestigationGraph.tsx
 *
 * Core investigation workspace for the Mary Poppins digital intelligence platform.
 * Maltego-style interactive graph visualization built on Cytoscape.js.
 *
 * Features:
 *  - 10 distinct node types with unique shapes, colors, and icon labels
 *  - 7+ edge relationship types with visual differentiation
 *  - Right-click context menu, double-click expansion, multi-select
 *  - Layout engines: cola (force-directed), dagre (hierarchical), concentric, grid
 *  - Toolbar: layout selector, filters, search, zoom, export, undo/redo
 *  - Detail panel (right sidebar) for selected node/edge inspection
 *  - Time-range filter with playback animation
 *  - Minimap overlay
 *  - PNG / SVG export
 *  - WebGL renderer fallback for 1 000+ node graphs
 *  - Zustand state management
 *  - Full TypeScript types
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import CytoscapeComponent from "react-cytoscapejs";
import cytoscape, {
  type Core,
  type EventObject,
  type NodeSingular,
  type EdgeSingular,
  type ElementDefinition,
  type Stylesheet,
  type LayoutOptions,
  type Position,
} from "cytoscape";

// ---------------------------------------------------------------------------
// Cytoscape extensions – imported for side-effects only.
// In production these would be real npm packages; here we guard against
// missing modules so the component still renders in development.
// ---------------------------------------------------------------------------
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const cola = require("cytoscape-cola");
  cytoscape.use(cola);
} catch {
  /* cola layout unavailable – fall back to cose */
}
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const dagre = require("cytoscape-dagre");
  cytoscape.use(dagre);
} catch {
  /* dagre layout unavailable */
}

// ---------------------------------------------------------------------------
// 1. TYPE DEFINITIONS
// ---------------------------------------------------------------------------

/** Canonical node (entity) types in the investigation domain. */
export type EntityType =
  | "Person"
  | "Email"
  | "Phone"
  | "Username"
  | "IP"
  | "Domain"
  | "CryptoWallet"
  | "ContentHash"
  | "OnionService"
  | "ForumPost";

/** Canonical edge (relationship) types. */
export type RelationshipType =
  | "USES_EMAIL"
  | "HAS_PHONE"
  | "KNOWN_AS"
  | "TRANSACTED_WITH"
  | "COMMUNICATES_WITH"
  | "HOSTED_ON"
  | "SHARES_CONTENT"
  | "LINKED_TO";

/** Shape keywords understood by Cytoscape. */
type CyShape =
  | "ellipse"
  | "diamond"
  | "hexagon"
  | "rectangle"
  | "octagon"
  | "triangle"
  | "pentagon"
  | "round-rectangle"
  | "star";

/** Risk classification for entities. */
export type RiskLevel = "critical" | "high" | "medium" | "low" | "unknown";

/** Metadata attached to every graph node. */
export interface EntityData {
  id: string;
  label: string;
  entityType: EntityType;
  properties: Record<string, string | number | boolean | null>;
  riskScore: number; // 0-100
  riskLevel: RiskLevel;
  firstSeen: string; // ISO-8601
  lastSeen: string; // ISO-8601
  source: string;
  tags: string[];
  pinned: boolean;
  hidden: boolean;
}

/** Metadata attached to every graph edge. */
export interface RelationshipData {
  id: string;
  source: string;
  target: string;
  relationshipType: RelationshipType;
  label: string;
  weight: number;
  properties: Record<string, string | number | boolean | null>;
  firstSeen: string;
  lastSeen: string;
  confidence: number; // 0-1
}

/** Full graph payload returned by the API. */
export interface GraphPayload {
  nodes: EntityData[];
  edges: RelationshipData[];
}

/** A snapshot stored in the undo/redo stack. */
interface GraphSnapshot {
  elements: ElementDefinition[];
  timestamp: number;
}

/** Layout engine identifiers exposed to the user. */
export type LayoutName = "cola" | "dagre" | "concentric" | "grid" | "cose";

/** Context-menu action descriptor. */
interface ContextMenuAction {
  key: string;
  label: string;
  icon: string; // emoji / text glyph for simplicity
  shortcut?: string;
  dangerous?: boolean;
  handler: (nodeId: string) => void;
}

/** Props accepted by <InvestigationGraph />. */
export interface InvestigationGraphProps {
  /** Initial graph data to render. */
  initialData?: GraphPayload;
  /** Case / investigation identifier – used when fetching expansions. */
  caseId?: string;
  /** Callback fired when the analyst selects a node. */
  onNodeSelect?: (entity: EntityData | null) => void;
  /** Callback fired when the analyst selects an edge. */
  onEdgeSelect?: (relationship: RelationshipData | null) => void;
  /** External class name for the wrapper. */
  className?: string;
}

// ---------------------------------------------------------------------------
// 2. VISUAL STYLE CONFIGURATION
// ---------------------------------------------------------------------------

/** Per-entity-type visual configuration. */
interface EntityStyle {
  shape: CyShape;
  color: string;
  icon: string; // single character / emoji used as the node label
  label: string; // human-readable name for the legend
}

const ENTITY_STYLES: Record<EntityType, EntityStyle> = {
  Person: { shape: "ellipse", color: "#8B5CF6", icon: "\u{1F464}", label: "Person" },
  Email: { shape: "diamond", color: "#3B82F6", icon: "\u2709", label: "Email" },
  Phone: { shape: "diamond", color: "#10B981", icon: "\u260E", label: "Phone" },
  Username: { shape: "hexagon", color: "#F59E0B", icon: "@", label: "Username" },
  IP: { shape: "rectangle", color: "#EF4444", icon: "\u{1F310}", label: "IP Address" },
  Domain: { shape: "rectangle", color: "#06B6D4", icon: "\u{1F30D}", label: "Domain" },
  CryptoWallet: { shape: "octagon", color: "#EAB308", icon: "\u20BF", label: "Crypto Wallet" },
  ContentHash: { shape: "triangle", color: "#EC4899", icon: "#", label: "Content Hash" },
  OnionService: { shape: "pentagon", color: "#7C3AED", icon: "\u{1F9C5}", label: "Onion Service" },
  ForumPost: { shape: "round-rectangle", color: "#6B7280", icon: "\u{1F4AC}", label: "Forum Post" },
};

/** Per-relationship-type visual configuration. */
interface EdgeStyle {
  color: string;
  lineStyle: "solid" | "dashed" | "dotted";
  width: number;
  label: string;
}

const EDGE_STYLES: Record<RelationshipType, EdgeStyle> = {
  USES_EMAIL: { color: "#9CA3AF", lineStyle: "solid", width: 2, label: "Uses Email" },
  HAS_PHONE: { color: "#9CA3AF", lineStyle: "solid", width: 2, label: "Has Phone" },
  KNOWN_AS: { color: "#8B5CF6", lineStyle: "dashed", width: 2, label: "Known As (alias)" },
  TRANSACTED_WITH: { color: "#EAB308", lineStyle: "solid", width: 3, label: "Transacted With" },
  COMMUNICATES_WITH: { color: "#3B82F6", lineStyle: "dotted", width: 2, label: "Communicates With" },
  HOSTED_ON: { color: "#06B6D4", lineStyle: "solid", width: 2, label: "Hosted On" },
  SHARES_CONTENT: { color: "#EC4899", lineStyle: "solid", width: 2, label: "Shares Content" },
  LINKED_TO: { color: "#6B7280", lineStyle: "dashed", width: 1, label: "Linked To" },
};

// ---------------------------------------------------------------------------
// 3. CYTOSCAPE STYLESHEET
// ---------------------------------------------------------------------------

function buildStylesheet(): Stylesheet[] {
  const base: Stylesheet[] = [
    // Default node style
    {
      selector: "node",
      style: {
        label: "data(label)",
        "text-valign": "bottom" as const,
        "text-halign": "center" as const,
        "font-size": 11,
        "font-family": "Inter, system-ui, sans-serif",
        color: "#CBD5E1",
        "text-outline-color": "#0F172A",
        "text-outline-width": 2,
        "text-margin-y": 6,
        "border-width": 2,
        "border-opacity": 0.8,
        width: 44,
        height: 44,
        "overlay-padding": 4,
        "text-max-width": "100px",
        "text-wrap": "ellipsis" as const,
      } as any,
    },
    // Default edge style
    {
      selector: "edge",
      style: {
        width: 2,
        "curve-style": "bezier" as const,
        "target-arrow-shape": "triangle" as const,
        "target-arrow-color": "#475569",
        "line-color": "#475569",
        "font-size": 9,
        color: "#94A3B8",
        "text-outline-color": "#0F172A",
        "text-outline-width": 1.5,
        "text-rotation": "autorotate" as const,
        "overlay-padding": 3,
        opacity: 0.75,
      } as any,
    },
    // Selected node
    {
      selector: "node:selected",
      style: {
        "border-width": 4,
        "border-color": "#F8FAFC",
        "overlay-color": "#F8FAFC",
        "overlay-opacity": 0.12,
        "z-index": 999,
      } as any,
    },
    // Selected edge
    {
      selector: "edge:selected",
      style: {
        width: 4,
        opacity: 1,
        "z-index": 999,
      } as any,
    },
    // Highlighted (search match, hover neighbor)
    {
      selector: ".highlighted",
      style: {
        "border-width": 4,
        "border-color": "#FBBF24",
        "overlay-color": "#FBBF24",
        "overlay-opacity": 0.15,
      } as any,
    },
    // Faded (dimmed during filtering)
    {
      selector: ".faded",
      style: {
        opacity: 0.15,
      } as any,
    },
    // Hidden
    {
      selector: ".hidden",
      style: {
        display: "none",
      } as any,
    },
    // Pinned indicator
    {
      selector: ".pinned",
      style: {
        "border-style": "double" as const,
        "border-width": 4,
      } as any,
    },
  ];

  // Per-entity-type selectors
  for (const [type, style] of Object.entries(ENTITY_STYLES) as [EntityType, EntityStyle][]) {
    base.push({
      selector: `node[entityType = "${type}"]`,
      style: {
        shape: style.shape,
        "background-color": style.color,
        "border-color": style.color,
        content: style.icon + " " + "data(label)",
      } as any,
    });
  }

  // Per-relationship-type selectors
  for (const [type, style] of Object.entries(EDGE_STYLES) as [RelationshipType, EdgeStyle][]) {
    base.push({
      selector: `edge[relationshipType = "${type}"]`,
      style: {
        "line-color": style.color,
        "line-style": style.lineStyle,
        width: style.width,
        "target-arrow-color": style.color,
        label: type === "TRANSACTED_WITH" ? "data(label)" : "",
      } as any,
    });
  }

  return base;
}

// ---------------------------------------------------------------------------
// 4. API SERVICE (mock implementation with real interfaces)
// ---------------------------------------------------------------------------

/** Parameters for expanding a node (fetching its neighbours). */
export interface ExpandNodeParams {
  nodeId: string;
  caseId?: string;
  depth?: number;
  relationshipTypes?: RelationshipType[];
  limit?: number;
}

/** Parameters for running an OSINT enrichment on an entity. */
export interface RunOSINTParams {
  entityId: string;
  entityType: EntityType;
  modules?: string[];
}

/** Parameters for tracing a crypto-wallet. */
export interface TraceWalletParams {
  walletAddress: string;
  depth?: number;
  currency?: string;
}

/** Parameters for adding an entity to a case. */
export interface AddToCaseParams {
  entityIds: string[];
  caseId: string;
  notes?: string;
}

/** Simulated network latency. */
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Mock API service. In production, replace with real fetch / axios calls.
 * Every method returns the correct typed payload.
 */
const graphApi = {
  /** Fetch the initial graph for a case. */
  async fetchGraph(caseId: string): Promise<GraphPayload> {
    await delay(600);
    return generateMockGraph(12, 18);
  },

  /** Expand connections from a single node. */
  async expandNode(params: ExpandNodeParams): Promise<GraphPayload> {
    await delay(400);
    return generateMockGraph(4, 5, params.nodeId);
  },

  /** Run OSINT enrichment – returns enriched properties. */
  async runOSINT(params: RunOSINTParams): Promise<Record<string, unknown>> {
    await delay(1200);
    return {
      breaches: ["Collection #1", "LinkedIn 2021"],
      socialProfiles: ["twitter.com/jdoe", "github.com/jdoe"],
      reputation: "suspicious",
    };
  },

  /** Trace a wallet through the blockchain. */
  async traceWallet(params: TraceWalletParams): Promise<GraphPayload> {
    await delay(900);
    return generateMockGraph(6, 8, params.walletAddress);
  },

  /** Add entities to a case. */
  async addToCase(params: AddToCaseParams): Promise<{ success: boolean }> {
    await delay(300);
    return { success: true };
  },

  /** Search entities across all cases. */
  async searchEntities(query: string): Promise<EntityData[]> {
    await delay(350);
    const types: EntityType[] = Object.keys(ENTITY_STYLES) as EntityType[];
    return Array.from({ length: 5 }, (_, i) => createMockEntity(`search-${i}`, types[i % types.length], query));
  },

  /** Export the current graph as PNG blob. */
  async exportPNG(cy: Core): Promise<Blob> {
    const dataUrl: string = cy.png({ full: true, scale: 2, bg: "#0F172A" });
    const res = await fetch(dataUrl);
    return res.blob();
  },

  /** Export the current graph as SVG string. */
  async exportSVG(cy: Core): Promise<string> {
    // Cytoscape does not natively export SVG – we produce a minimal representation.
    const svgContent = cy.svg({ full: true, scale: 1, bg: "#0F172A" });
    return typeof svgContent === "string" ? svgContent : "<svg></svg>";
  },
};

// ---------------------------------------------------------------------------
// 5. MOCK DATA GENERATORS
// ---------------------------------------------------------------------------

let _autoId = 0;
function uid(prefix = "n"): string {
  return `${prefix}-${++_autoId}-${Math.random().toString(36).slice(2, 7)}`;
}

function randomPick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function riskLevelFromScore(score: number): RiskLevel {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 40) return "medium";
  if (score >= 20) return "low";
  return "unknown";
}

function createMockEntity(id?: string, type?: EntityType, labelHint?: string): EntityData {
  const entityType = type ?? randomPick(Object.keys(ENTITY_STYLES) as EntityType[]);
  const eid = id ?? uid("ent");
  const riskScore = Math.round(Math.random() * 100);
  const now = new Date();
  const firstSeen = new Date(now.getTime() - Math.random() * 180 * 86400000).toISOString();
  const lastSeen = new Date(now.getTime() - Math.random() * 7 * 86400000).toISOString();

  const labelMap: Record<EntityType, () => string> = {
    Person: () => labelHint ?? randomPick(["John Doe", "Jane Smith", "Carlos R.", "Li Wei", "Amara O."]),
    Email: () => labelHint ?? randomPick(["jdoe@proton.me", "ghost@tutanota.com", "alice@pm.me"]),
    Phone: () => labelHint ?? randomPick(["+1-555-0142", "+44-7700-900123", "+49-151-12345678"]),
    Username: () => labelHint ?? randomPick(["darkphoenix", "xShadowx", "nullbyte", "cryptoKing"]),
    IP: () => labelHint ?? `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
    Domain: () => labelHint ?? randomPick(["shady-market.xyz", "anon-hosting.net", "free-vpn.io"]),
    CryptoWallet: () => labelHint ?? `bc1q${Math.random().toString(36).slice(2, 14)}`,
    ContentHash: () => labelHint ?? `SHA256:${Math.random().toString(36).slice(2, 10)}...`,
    OnionService: () => labelHint ?? `${Math.random().toString(36).slice(2, 10)}.onion`,
    ForumPost: () => labelHint ?? `Post #${Math.floor(Math.random() * 99999)}`,
  };

  return {
    id: eid,
    label: labelMap[entityType](),
    entityType,
    properties: {
      description: `Mock ${entityType} entity`,
      country: randomPick(["US", "DE", "RU", "CN", "BR", "NG"]),
      verified: Math.random() > 0.5,
    },
    riskScore,
    riskLevel: riskLevelFromScore(riskScore),
    firstSeen,
    lastSeen,
    source: randomPick(["OSINT", "HUMINT", "SIGINT", "FININT", "manual"]),
    tags: [randomPick(["flagged", "verified", "suspect", "witness", "unknown"])],
    pinned: false,
    hidden: false,
  };
}

function generateMockGraph(nodeCount: number, edgeCount: number, anchorId?: string): GraphPayload {
  const nodes: EntityData[] = [];
  const types = Object.keys(ENTITY_STYLES) as EntityType[];

  if (anchorId) {
    // Ensure the anchor node exists as a Person if not already present.
    nodes.push(createMockEntity(anchorId, "Person"));
  }

  for (let i = 0; i < nodeCount; i++) {
    nodes.push(createMockEntity(undefined, types[i % types.length]));
  }

  const relTypes = Object.keys(EDGE_STYLES) as RelationshipType[];
  const edges: RelationshipData[] = [];
  for (let i = 0; i < edgeCount; i++) {
    const src = nodes[Math.floor(Math.random() * nodes.length)];
    let tgt = nodes[Math.floor(Math.random() * nodes.length)];
    // Avoid self-loops
    if (tgt.id === src.id) {
      tgt = nodes[(nodes.indexOf(tgt) + 1) % nodes.length];
    }
    const relType = randomPick(relTypes);
    edges.push({
      id: uid("edge"),
      source: src.id,
      target: tgt.id,
      relationshipType: relType,
      label: relType === "TRANSACTED_WITH" ? `${(Math.random() * 10).toFixed(3)} BTC` : "",
      weight: Math.round(Math.random() * 10),
      properties: {},
      firstSeen: src.firstSeen,
      lastSeen: src.lastSeen,
      confidence: parseFloat((0.3 + Math.random() * 0.7).toFixed(2)),
    });
  }

  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// 6. ZUSTAND-STYLE STORE (inline, zero-dep implementation)
// ---------------------------------------------------------------------------

/**
 * Minimal Zustand-compatible store without the Zustand dependency.
 * In production, swap this for `import create from 'zustand'`.
 */
type Listener<T> = (state: T) => void;

function createStore<T extends object>(initialState: T) {
  let state = { ...initialState };
  const listeners = new Set<Listener<T>>();

  const getState = () => state;

  const setState = (partial: Partial<T> | ((prev: T) => Partial<T>)) => {
    const next = typeof partial === "function" ? partial(state) : partial;
    state = { ...state, ...next };
    listeners.forEach((l) => l(state));
  };

  const subscribe = (listener: Listener<T>) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  return { getState, setState, subscribe };
}

/** Shape of the investigation graph store. */
interface GraphStoreState {
  /** All entity data keyed by ID. */
  entities: Record<string, EntityData>;
  /** All relationship data keyed by ID. */
  relationships: Record<string, RelationshipData>;
  /** Currently selected node ID (or null). */
  selectedNodeId: string | null;
  /** Currently selected edge ID (or null). */
  selectedEdgeId: string | null;
  /** IDs of multi-selected nodes. */
  multiSelectedNodeIds: string[];
  /** Active layout name. */
  layout: LayoutName;
  /** Which entity types are visible (true = visible). */
  entityTypeFilters: Record<EntityType, boolean>;
  /** Which relationship types are visible (true = visible). */
  edgeTypeFilters: Record<RelationshipType, boolean>;
  /** Search query string. */
  searchQuery: string;
  /** Time-range filter boundaries (unix ms). */
  timeRange: { start: number; end: number } | null;
  /** Whether the minimap is visible. */
  minimapVisible: boolean;
  /** Whether the legend is visible. */
  legendVisible: boolean;
  /** Whether the detail panel is open. */
  detailPanelOpen: boolean;
  /** Undo stack. */
  undoStack: GraphSnapshot[];
  /** Redo stack. */
  redoStack: GraphSnapshot[];
  /** Loading state. */
  loading: boolean;
  /** Error message (if any). */
  error: string | null;
}

function defaultEntityFilters(): Record<EntityType, boolean> {
  const filters = {} as Record<EntityType, boolean>;
  for (const t of Object.keys(ENTITY_STYLES) as EntityType[]) {
    filters[t] = true;
  }
  return filters;
}

function defaultEdgeFilters(): Record<RelationshipType, boolean> {
  const filters = {} as Record<RelationshipType, boolean>;
  for (const t of Object.keys(EDGE_STYLES) as RelationshipType[]) {
    filters[t] = true;
  }
  return filters;
}

const useGraphStore = (() => {
  const store = createStore<GraphStoreState>({
    entities: {},
    relationships: {},
    selectedNodeId: null,
    selectedEdgeId: null,
    multiSelectedNodeIds: [],
    layout: "cose",
    entityTypeFilters: defaultEntityFilters(),
    edgeTypeFilters: defaultEdgeFilters(),
    searchQuery: "",
    timeRange: null,
    minimapVisible: true,
    legendVisible: true,
    detailPanelOpen: true,
    undoStack: [],
    redoStack: [],
    loading: false,
    error: null,
  });

  /**
   * React hook that subscribes to the store and re-renders on changes.
   * Mirrors the Zustand `useStore(selector)` API.
   */
  function useStore(): GraphStoreState;
  function useStore<U>(selector: (s: GraphStoreState) => U): U;
  function useStore<U>(selector?: (s: GraphStoreState) => U) {
    const selectorRef = useRef(selector);
    selectorRef.current = selector;

    const [, forceRender] = useState(0);
    const stateRef = useRef(store.getState());

    useEffect(() => {
      const unsub = store.subscribe((next) => {
        stateRef.current = next;
        forceRender((c) => c + 1);
      });
      return unsub;
    }, []);

    const state = stateRef.current;
    return selectorRef.current ? selectorRef.current(state) : state;
  }

  // Expose setState for imperative updates from callbacks.
  (useStore as any).setState = store.setState;
  (useStore as any).getState = store.getState;

  return useStore as typeof useStore & {
    setState: typeof store.setState;
    getState: typeof store.getState;
  };
})();

// ---------------------------------------------------------------------------
// 7. HELPER: convert domain data to Cytoscape elements
// ---------------------------------------------------------------------------

function toCytoscapeElements(data: GraphPayload): ElementDefinition[] {
  const elements: ElementDefinition[] = [];

  for (const node of data.nodes) {
    elements.push({
      data: {
        id: node.id,
        label: node.label,
        entityType: node.entityType,
        riskScore: node.riskScore,
        riskLevel: node.riskLevel,
        firstSeen: node.firstSeen,
        lastSeen: node.lastSeen,
        source: node.source,
      },
      classes: node.pinned ? "pinned" : undefined,
    });
  }

  for (const edge of data.edges) {
    elements.push({
      data: {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        relationshipType: edge.relationshipType,
        label: edge.label,
        weight: edge.weight,
        confidence: edge.confidence,
      },
    });
  }

  return elements;
}

// ---------------------------------------------------------------------------
// 8. LAYOUT HELPERS
// ---------------------------------------------------------------------------

function buildLayoutOptions(name: LayoutName): LayoutOptions {
  const common = { animate: true, animationDuration: 500, fit: true, padding: 40 };

  switch (name) {
    case "cola":
      return {
        name: "cola",
        ...common,
        nodeSpacing: 60,
        edgeLengthVal: 120,
        maxSimulationTime: 4000,
        randomize: false,
      } as any;

    case "dagre":
      return {
        name: "dagre",
        ...common,
        rankDir: "TB",
        nodeSep: 60,
        rankSep: 100,
      } as any;

    case "concentric":
      return {
        name: "concentric",
        ...common,
        minNodeSpacing: 60,
        concentric: (node: NodeSingular) => node.degree(),
        levelWidth: () => 2,
      } as any;

    case "grid":
      return {
        name: "grid",
        ...common,
        condense: true,
        rows: undefined,
      } as any;

    case "cose":
    default:
      return {
        name: "cose",
        ...common,
        nodeRepulsion: () => 8000,
        idealEdgeLength: () => 120,
        nodeOverlap: 20,
        gravity: 0.25,
        numIter: 1000,
      } as any;
  }
}

// ---------------------------------------------------------------------------
// 9. SUB-COMPONENTS
// ---------------------------------------------------------------------------

// ---- 9a. Toolbar ----------------------------------------------------------

interface ToolbarProps {
  cy: Core | null;
  layout: LayoutName;
  onLayoutChange: (l: LayoutName) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onExportPNG: () => void;
  onExportSVG: () => void;
  onFitToScreen: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onToggleMinimap: () => void;
  onToggleLegend: () => void;
  minimapVisible: boolean;
  legendVisible: boolean;
}

const Toolbar: React.FC<ToolbarProps> = ({
  layout,
  onLayoutChange,
  searchQuery,
  onSearchChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onExportPNG,
  onExportSVG,
  onFitToScreen,
  onZoomIn,
  onZoomOut,
  onToggleMinimap,
  onToggleLegend,
  minimapVisible,
  legendVisible,
}) => {
  const layouts: { value: LayoutName; label: string }[] = [
    { value: "cose", label: "Force-directed" },
    { value: "cola", label: "Cola" },
    { value: "dagre", label: "Hierarchical" },
    { value: "concentric", label: "Concentric" },
    { value: "grid", label: "Grid" },
  ];

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-slate-800/90 border-b border-slate-700 backdrop-blur-sm flex-wrap">
      {/* Layout selector */}
      <div className="flex items-center gap-1.5">
        <label htmlFor="layout-select" className="text-xs text-slate-400 font-medium uppercase tracking-wide">
          Layout
        </label>
        <select
          id="layout-select"
          value={layout}
          onChange={(e) => onLayoutChange(e.target.value as LayoutName)}
          className="bg-slate-700 text-slate-200 text-xs rounded px-2 py-1 border border-slate-600 focus:outline-none focus:ring-1 focus:ring-violet-500"
        >
          {layouts.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
      </div>

      <div className="w-px h-6 bg-slate-600 mx-1" />

      {/* Search */}
      <div className="relative flex-1 max-w-xs">
        <input
          type="text"
          placeholder="Search entities..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full bg-slate-700 text-slate-200 text-xs rounded pl-7 pr-2 py-1.5 border border-slate-600 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
        />
        <svg
          className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <circle cx={11} cy={11} r={8} />
          <path d="M21 21l-4.35-4.35" />
        </svg>
      </div>

      <div className="w-px h-6 bg-slate-600 mx-1" />

      {/* Zoom controls */}
      <ToolbarButton label="Zoom In" onClick={onZoomIn} title="Zoom In">
        +
      </ToolbarButton>
      <ToolbarButton label="Zoom Out" onClick={onZoomOut} title="Zoom Out">
        &minus;
      </ToolbarButton>
      <ToolbarButton label="Fit" onClick={onFitToScreen} title="Fit to Screen">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
        </svg>
      </ToolbarButton>

      <div className="w-px h-6 bg-slate-600 mx-1" />

      {/* Undo / Redo */}
      <ToolbarButton label="Undo" onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path d="M3 10h13a4 4 0 010 8H7" />
          <path d="M7 6L3 10l4 4" />
        </svg>
      </ToolbarButton>
      <ToolbarButton label="Redo" onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path d="M21 10H8a4 4 0 000 8h10" />
          <path d="M17 6l4 4-4 4" />
        </svg>
      </ToolbarButton>

      <div className="w-px h-6 bg-slate-600 mx-1" />

      {/* Toggle buttons */}
      <ToolbarButton
        label="Minimap"
        onClick={onToggleMinimap}
        active={minimapVisible}
        title="Toggle Minimap"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <rect x={3} y={3} width={18} height={18} rx={2} />
          <rect x={14} y={14} width={6} height={6} rx={1} />
        </svg>
      </ToolbarButton>
      <ToolbarButton
        label="Legend"
        onClick={onToggleLegend}
        active={legendVisible}
        title="Toggle Legend"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
        </svg>
      </ToolbarButton>

      <div className="w-px h-6 bg-slate-600 mx-1" />

      {/* Export */}
      <ToolbarButton label="PNG" onClick={onExportPNG} title="Export as PNG">
        PNG
      </ToolbarButton>
      <ToolbarButton label="SVG" onClick={onExportSVG} title="Export as SVG">
        SVG
      </ToolbarButton>
    </div>
  );
};

interface ToolbarButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  title?: string;
  children: React.ReactNode;
}

const ToolbarButton: React.FC<ToolbarButtonProps> = ({ onClick, disabled, active, title, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`
      flex items-center justify-center min-w-[28px] h-7 px-1.5 rounded text-xs font-medium
      transition-colors duration-150 focus:outline-none focus:ring-1 focus:ring-violet-500
      ${active ? "bg-violet-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}
      ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}
    `}
  >
    {children}
  </button>
);

// ---- 9b. Filter Panel (entity-type + edge-type toggles) -------------------

interface FilterPanelProps {
  entityTypeFilters: Record<EntityType, boolean>;
  edgeTypeFilters: Record<RelationshipType, boolean>;
  onToggleEntityType: (t: EntityType) => void;
  onToggleEdgeType: (t: RelationshipType) => void;
}

const FilterPanel: React.FC<FilterPanelProps> = ({
  entityTypeFilters,
  edgeTypeFilters,
  onToggleEntityType,
  onToggleEdgeType,
}) => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="absolute top-14 left-3 z-30 w-52 bg-slate-800/95 border border-slate-700 rounded-lg shadow-xl backdrop-blur-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-slate-300 uppercase tracking-wide hover:bg-slate-700/60"
      >
        <span>Filters</span>
        <span className="text-slate-500">{collapsed ? "\u25B6" : "\u25BC"}</span>
      </button>

      {!collapsed && (
        <div className="px-3 pb-3 space-y-3 max-h-80 overflow-y-auto scrollbar-thin scrollbar-track-slate-800 scrollbar-thumb-slate-600">
          {/* Entity types */}
          <div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Node types</p>
            {(Object.keys(ENTITY_STYLES) as EntityType[]).map((t) => {
              const style = ENTITY_STYLES[t];
              return (
                <label key={t} className="flex items-center gap-2 py-0.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={entityTypeFilters[t]}
                    onChange={() => onToggleEntityType(t)}
                    className="rounded border-slate-600 bg-slate-700 text-violet-500 focus:ring-violet-500 focus:ring-offset-0 w-3.5 h-3.5"
                  />
                  <span
                    className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: style.color }}
                  />
                  <span className="text-xs text-slate-400 group-hover:text-slate-200 transition-colors">
                    {style.label}
                  </span>
                </label>
              );
            })}
          </div>

          {/* Edge types */}
          <div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Edge types</p>
            {(Object.keys(EDGE_STYLES) as RelationshipType[]).map((t) => {
              const style = EDGE_STYLES[t];
              return (
                <label key={t} className="flex items-center gap-2 py-0.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={edgeTypeFilters[t]}
                    onChange={() => onToggleEdgeType(t)}
                    className="rounded border-slate-600 bg-slate-700 text-violet-500 focus:ring-violet-500 focus:ring-offset-0 w-3.5 h-3.5"
                  />
                  <span className="flex items-center gap-1">
                    <span
                      className="inline-block w-4 border-t-2 flex-shrink-0"
                      style={{
                        borderColor: style.color,
                        borderStyle: style.lineStyle === "dotted" ? "dotted" : style.lineStyle,
                      }}
                    />
                  </span>
                  <span className="text-xs text-slate-400 group-hover:text-slate-200 transition-colors truncate">
                    {style.label}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// ---- 9c. Time Range Filter ------------------------------------------------

interface TimeRangeFilterProps {
  timeRange: { start: number; end: number } | null;
  onTimeRangeChange: (range: { start: number; end: number } | null) => void;
  globalStart: number;
  globalEnd: number;
}

const TimeRangeFilter: React.FC<TimeRangeFilterProps> = ({
  timeRange,
  onTimeRangeChange,
  globalStart,
  globalEnd,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentEnd = timeRange?.end ?? globalEnd;
  const span = globalEnd - globalStart || 1;

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const pct = parseInt(e.target.value, 10) / 100;
    const newEnd = globalStart + pct * span;
    onTimeRangeChange({ start: globalStart, end: newEnd });
  };

  const togglePlay = () => {
    if (isPlaying) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setIsPlaying(false);
    } else {
      // Reset if already at end
      if (currentEnd >= globalEnd) {
        onTimeRangeChange({ start: globalStart, end: globalStart });
      }
      setIsPlaying(true);
      intervalRef.current = setInterval(() => {
        onTimeRangeChange((prev: any) => {
          const current = prev?.end ?? globalStart;
          const step = span * 0.02;
          const next = current + step;
          if (next >= globalEnd) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            setIsPlaying(false);
            return { start: globalStart, end: globalEnd };
          }
          return { start: globalStart, end: next };
        });
      }, 100);
    }
  };

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const pct = ((currentEnd - globalStart) / span) * 100;

  return (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 bg-slate-800/95 border border-slate-700 rounded-lg px-4 py-2 shadow-xl backdrop-blur-sm">
      <button
        type="button"
        onClick={togglePlay}
        className="text-slate-400 hover:text-violet-400 transition-colors text-sm"
        title={isPlaying ? "Pause" : "Play timeline"}
      >
        {isPlaying ? "\u23F8" : "\u25B6"}
      </button>
      <span className="text-[10px] text-slate-500 w-24 truncate">
        {new Date(globalStart).toLocaleDateString()}
      </span>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(pct)}
        onChange={handleSliderChange}
        className="w-48 h-1 bg-slate-600 rounded-full appearance-none cursor-pointer accent-violet-500"
      />
      <span className="text-[10px] text-slate-500 w-24 truncate text-right">
        {new Date(currentEnd).toLocaleDateString()}
      </span>
      <button
        type="button"
        onClick={() => onTimeRangeChange(null)}
        className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
        title="Reset time filter"
      >
        Reset
      </button>
    </div>
  );
};

// ---- 9d. Detail Panel (right sidebar) -------------------------------------

interface DetailPanelProps {
  selectedNode: EntityData | null;
  selectedEdge: RelationshipData | null;
  connectedCount: number;
  onClose: () => void;
  onExpandNode: (id: string) => void;
  onRunOSINT: (id: string) => void;
  onAddToCase: (id: string) => void;
  onPinToggle: (id: string) => void;
  onHideNode: (id: string) => void;
}

const RISK_COLORS: Record<RiskLevel, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-yellow-500",
  low: "bg-green-500",
  unknown: "bg-slate-500",
};

const DetailPanel: React.FC<DetailPanelProps> = ({
  selectedNode,
  selectedEdge,
  connectedCount,
  onClose,
  onExpandNode,
  onRunOSINT,
  onAddToCase,
  onPinToggle,
  onHideNode,
}) => {
  if (!selectedNode && !selectedEdge) {
    return (
      <div className="w-80 flex-shrink-0 bg-slate-800/95 border-l border-slate-700 flex flex-col items-center justify-center text-center p-6">
        <div className="w-16 h-16 rounded-full bg-slate-700/50 flex items-center justify-center mb-4">
          <svg className="w-7 h-7 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
          </svg>
        </div>
        <p className="text-sm text-slate-400">Click a node or edge to inspect its details</p>
        <p className="text-xs text-slate-600 mt-1">Right-click for context actions</p>
      </div>
    );
  }

  // ---- Node detail ----
  if (selectedNode) {
    const style = ENTITY_STYLES[selectedNode.entityType];
    return (
      <div className="w-80 flex-shrink-0 bg-slate-800/95 border-l border-slate-700 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <h3 className="text-sm font-semibold text-slate-200 truncate">Entity Details</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-track-slate-800 scrollbar-thumb-slate-600">
          {/* Identity block */}
          <div className="flex items-start gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center text-lg flex-shrink-0"
              style={{ backgroundColor: style.color + "22", border: `2px solid ${style.color}` }}
            >
              {style.icon}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-200 truncate">{selectedNode.label}</p>
              <p className="text-xs text-slate-500">{style.label}</p>
            </div>
          </div>

          {/* Risk score */}
          <div className="bg-slate-700/40 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400">Risk Score</span>
              <span
                className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full text-white ${RISK_COLORS[selectedNode.riskLevel]}`}
              >
                {selectedNode.riskLevel}
              </span>
            </div>
            <div className="w-full h-2 bg-slate-600 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${selectedNode.riskScore}%`,
                  backgroundColor:
                    selectedNode.riskScore >= 80
                      ? "#EF4444"
                      : selectedNode.riskScore >= 60
                      ? "#F97316"
                      : selectedNode.riskScore >= 40
                      ? "#EAB308"
                      : "#22C55E",
                }}
              />
            </div>
            <p className="text-right text-[10px] text-slate-500 mt-1">{selectedNode.riskScore}/100</p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-2">
            <StatCard label="Connections" value={connectedCount.toString()} />
            <StatCard label="Source" value={selectedNode.source} />
            <StatCard label="First Seen" value={new Date(selectedNode.firstSeen).toLocaleDateString()} />
            <StatCard label="Last Seen" value={new Date(selectedNode.lastSeen).toLocaleDateString()} />
          </div>

          {/* Tags */}
          {selectedNode.tags.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Tags</p>
              <div className="flex flex-wrap gap-1">
                {selectedNode.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-slate-700 text-slate-400 border border-slate-600"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Properties */}
          <div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Properties</p>
            <div className="bg-slate-900/60 rounded-lg overflow-hidden">
              {Object.entries(selectedNode.properties).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between px-3 py-1.5 border-b border-slate-700/60 last:border-0">
                  <span className="text-[11px] text-slate-500">{key}</span>
                  <span className="text-[11px] text-slate-300 truncate ml-2 max-w-[140px]">
                    {String(value ?? "N/A")}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* ID */}
          <div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">ID</p>
            <p className="text-[10px] text-slate-600 font-mono break-all">{selectedNode.id}</p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="border-t border-slate-700 p-3 space-y-1.5">
          <ActionButton
            onClick={() => onExpandNode(selectedNode.id)}
            icon={
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M12 4v16m8-8H4" />
              </svg>
            }
            label="Expand connections"
          />
          <ActionButton
            onClick={() => onRunOSINT(selectedNode.id)}
            icon={
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx={11} cy={11} r={8} />
                <path d="M21 21l-4.35-4.35" />
              </svg>
            }
            label="Run OSINT enrichment"
          />
          <ActionButton
            onClick={() => onAddToCase(selectedNode.id)}
            icon={
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            }
            label="Add to case"
          />
          <div className="flex gap-1.5">
            <ActionButton
              onClick={() => onPinToggle(selectedNode.id)}
              icon={
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
              }
              label={selectedNode.pinned ? "Unpin node" : "Pin node"}
              className="flex-1"
            />
            <ActionButton
              onClick={() => onHideNode(selectedNode.id)}
              icon={
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              }
              label="Hide node"
              className="flex-1"
              variant="danger"
            />
          </div>
        </div>
      </div>
    );
  }

  // ---- Edge detail ----
  if (selectedEdge) {
    const edgeStyle = EDGE_STYLES[selectedEdge.relationshipType];
    return (
      <div className="w-80 flex-shrink-0 bg-slate-800/95 border-l border-slate-700 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <h3 className="text-sm font-semibold text-slate-200">Relationship Details</h3>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="flex items-center gap-3">
            <span
              className="inline-block w-8 border-t-2"
              style={{
                borderColor: edgeStyle.color,
                borderStyle: edgeStyle.lineStyle === "dotted" ? "dotted" : edgeStyle.lineStyle,
              }}
            />
            <div>
              <p className="text-sm font-semibold text-slate-200">{edgeStyle.label}</p>
              <p className="text-xs text-slate-500">{selectedEdge.relationshipType}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <StatCard label="Confidence" value={`${Math.round(selectedEdge.confidence * 100)}%`} />
            <StatCard label="Weight" value={selectedEdge.weight.toString()} />
            <StatCard label="First Seen" value={new Date(selectedEdge.firstSeen).toLocaleDateString()} />
            <StatCard label="Last Seen" value={new Date(selectedEdge.lastSeen).toLocaleDateString()} />
          </div>
          {selectedEdge.label && (
            <div>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Label</p>
              <p className="text-xs text-slate-300 font-mono">{selectedEdge.label}</p>
            </div>
          )}
          <div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Source Node</p>
            <p className="text-xs text-slate-400 font-mono break-all">{selectedEdge.source}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Target Node</p>
            <p className="text-xs text-slate-400 font-mono break-all">{selectedEdge.target}</p>
          </div>
          {Object.keys(selectedEdge.properties).length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Properties</p>
              <div className="bg-slate-900/60 rounded-lg overflow-hidden">
                {Object.entries(selectedEdge.properties).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between px-3 py-1.5 border-b border-slate-700/60 last:border-0">
                    <span className="text-[11px] text-slate-500">{key}</span>
                    <span className="text-[11px] text-slate-300 truncate ml-2 max-w-[140px]">{String(value ?? "N/A")}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">ID</p>
            <p className="text-[10px] text-slate-600 font-mono break-all">{selectedEdge.id}</p>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

const StatCard: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="bg-slate-700/30 rounded-lg px-3 py-2">
    <p className="text-[10px] text-slate-500 mb-0.5">{label}</p>
    <p className="text-xs font-semibold text-slate-300 truncate">{value}</p>
  </div>
);

interface ActionButtonProps {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  className?: string;
  variant?: "default" | "danger";
}

const ActionButton: React.FC<ActionButtonProps> = ({ onClick, icon, label, className = "", variant = "default" }) => (
  <button
    type="button"
    onClick={onClick}
    className={`
      flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium w-full transition-colors
      ${
        variant === "danger"
          ? "bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20"
          : "bg-slate-700/60 text-slate-300 hover:bg-slate-600/80 border border-slate-600"
      }
      ${className}
    `}
  >
    {icon}
    {label}
  </button>
);

// ---- 9e. Context Menu (right-click) ---------------------------------------

interface ContextMenuProps {
  x: number;
  y: number;
  nodeId: string;
  actions: ContextMenuAction[];
  onClose: () => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, actions, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 w-56 bg-slate-800 border border-slate-600 rounded-lg shadow-2xl py-1 overflow-hidden"
      style={{ left: x, top: y }}
    >
      {actions.map((action) => (
        <button
          key={action.key}
          type="button"
          onClick={() => {
            action.handler(action.key);
            onClose();
          }}
          className={`
            w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors text-left
            ${action.dangerous ? "text-red-400 hover:bg-red-500/10" : "text-slate-300 hover:bg-slate-700"}
          `}
        >
          <span className="w-5 text-center text-sm">{action.icon}</span>
          <span className="flex-1">{action.label}</span>
          {action.shortcut && <span className="text-[10px] text-slate-600">{action.shortcut}</span>}
        </button>
      ))}
    </div>
  );
};

// ---- 9f. Legend ------------------------------------------------------------

const Legend: React.FC<{ visible: boolean }> = ({ visible }) => {
  if (!visible) return null;

  return (
    <div className="absolute bottom-14 left-3 z-30 w-52 bg-slate-800/95 border border-slate-700 rounded-lg shadow-xl backdrop-blur-sm overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-700">
        <h4 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Legend</h4>
      </div>
      <div className="px-3 py-2 space-y-2 max-h-60 overflow-y-auto scrollbar-thin scrollbar-track-slate-800 scrollbar-thumb-slate-600">
        {/* Node types */}
        <div>
          <p className="text-[9px] font-semibold text-slate-600 uppercase tracking-wider mb-1">Nodes</p>
          <div className="space-y-0.5">
            {(Object.entries(ENTITY_STYLES) as [EntityType, EntityStyle][]).map(([type, style]) => (
              <div key={type} className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: style.color }}
                />
                <span className="text-[10px] text-slate-400">{style.icon} {style.label}</span>
              </div>
            ))}
          </div>
        </div>
        {/* Edge types */}
        <div>
          <p className="text-[9px] font-semibold text-slate-600 uppercase tracking-wider mb-1">Edges</p>
          <div className="space-y-0.5">
            {(Object.entries(EDGE_STYLES) as [RelationshipType, EdgeStyle][]).map(([type, style]) => (
              <div key={type} className="flex items-center gap-2">
                <span
                  className="inline-block w-5 border-t-2 flex-shrink-0"
                  style={{
                    borderColor: style.color,
                    borderStyle: style.lineStyle === "dotted" ? "dotted" : style.lineStyle,
                  }}
                />
                <span className="text-[10px] text-slate-400">{style.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ---- 9g. Minimap -----------------------------------------------------------

interface MinimapProps {
  cy: Core | null;
  visible: boolean;
}

const Minimap: React.FC<MinimapProps> = ({ cy, visible }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!cy || !visible || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const render = () => {
      const { w, h } = { w: canvas.width, h: canvas.height };
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#0F172A";
      ctx.fillRect(0, 0, w, h);

      const bb = cy.extent();
      const scale = Math.min(w / (bb.w || 1), h / (bb.h || 1)) * 0.85;
      const offX = (w - (bb.w || 1) * scale) / 2 - bb.x1 * scale;
      const offY = (h - (bb.h || 1) * scale) / 2 - bb.y1 * scale;

      // Draw edges
      ctx.strokeStyle = "#334155";
      ctx.lineWidth = 0.5;
      cy.edges().forEach((edge) => {
        const sp = edge.source().position();
        const tp = edge.target().position();
        ctx.beginPath();
        ctx.moveTo(sp.x * scale + offX, sp.y * scale + offY);
        ctx.lineTo(tp.x * scale + offX, tp.y * scale + offY);
        ctx.stroke();
      });

      // Draw nodes
      cy.nodes().forEach((node) => {
        const pos = node.position();
        const entityType = node.data("entityType") as EntityType;
        const style = ENTITY_STYLES[entityType];
        ctx.fillStyle = style?.color ?? "#64748B";
        ctx.beginPath();
        ctx.arc(pos.x * scale + offX, pos.y * scale + offY, 2.5, 0, Math.PI * 2);
        ctx.fill();
      });

      // Draw viewport rectangle
      const vp = cy.extent();
      const zoom = cy.zoom();
      const pan = cy.pan();
      const vpW = cy.width() / zoom;
      const vpH = cy.height() / zoom;
      const vpX = (-pan.x / zoom) * scale + offX;
      const vpY = (-pan.y / zoom) * scale + offY;

      ctx.strokeStyle = "#8B5CF6";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(vpX, vpY, vpW * scale, vpH * scale);

      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [cy, visible]);

  if (!visible) return null;

  return (
    <div className="absolute bottom-14 right-3 z-30 border border-slate-700 rounded-lg overflow-hidden shadow-xl bg-slate-900">
      <canvas ref={canvasRef} width={180} height={120} className="block" />
    </div>
  );
};

// ---- 9h. Loading Overlay ---------------------------------------------------

const LoadingOverlay: React.FC<{ message?: string }> = ({ message = "Loading graph data..." }) => (
  <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm">
    <div className="flex flex-col items-center gap-3">
      <div className="w-10 h-10 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-slate-400">{message}</p>
    </div>
  </div>
);

// ---- 9i. Error Banner ------------------------------------------------------

const ErrorBanner: React.FC<{ message: string; onDismiss: () => void }> = ({ message, onDismiss }) => (
  <div className="absolute top-14 left-1/2 -translate-x-1/2 z-40 max-w-lg w-full">
    <div className="mx-4 flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2.5 text-red-400">
      <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <p className="text-xs flex-1">{message}</p>
      <button type="button" onClick={onDismiss} className="text-red-500 hover:text-red-300">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  </div>
);

// ---- 9j. Notification Toast -------------------------------------------------

interface ToastProps {
  message: string;
  type: "success" | "info" | "warning";
  onDismiss: () => void;
}

const Toast: React.FC<ToastProps> = ({ message, type, onDismiss }) => {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3500);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const colors = {
    success: "bg-green-500/10 border-green-500/30 text-green-400",
    info: "bg-blue-500/10 border-blue-500/30 text-blue-400",
    warning: "bg-yellow-500/10 border-yellow-500/30 text-yellow-400",
  };

  return (
    <div className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-xs ${colors[type]}`}>
      <p className="flex-1">{message}</p>
      <button type="button" onClick={onDismiss} className="opacity-60 hover:opacity-100">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 10. MAIN COMPONENT
// ---------------------------------------------------------------------------

const InvestigationGraph: React.FC<InvestigationGraphProps> = ({
  initialData,
  caseId = "default-case",
  onNodeSelect,
  onEdgeSelect,
  className = "",
}) => {
  // ---- Refs ----
  const cyRef = useRef<Core | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ---- Store state ----
  const storeState = useGraphStore();

  // ---- Local UI state ----
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);
  const [toasts, setToasts] = useState<{ id: string; message: string; type: "success" | "info" | "warning" }[]>([]);
  const [selectedNode, setSelectedNode] = useState<EntityData | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<RelationshipData | null>(null);
  const [connectedCount, setConnectedCount] = useState(0);

  // Computed: global time boundaries across all entities (used by the timeline slider).
  const timeBounds = useMemo(() => {
    const entities = Object.values(storeState.entities);
    if (entities.length === 0) {
      const now = Date.now();
      return { start: now - 180 * 86400000, end: now };
    }
    let min = Infinity;
    let max = -Infinity;
    for (const e of entities) {
      const fs = new Date(e.firstSeen).getTime();
      const ls = new Date(e.lastSeen).getTime();
      if (fs < min) min = fs;
      if (ls > max) max = ls;
    }
    return { start: min, end: max };
  }, [storeState.entities]);

  // ---- Toast helpers ----
  const addToast = useCallback((message: string, type: "success" | "info" | "warning" = "info") => {
    const id = uid("toast");
    setToasts((prev) => [...prev.slice(-4), { id, message, type }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ---- Snapshot helpers (undo/redo) ----
  const pushSnapshot = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const snapshot: GraphSnapshot = {
      elements: cy.elements().jsons() as unknown as ElementDefinition[],
      timestamp: Date.now(),
    };
    useGraphStore.setState((prev) => ({
      undoStack: [...prev.undoStack.slice(-49), snapshot],
      redoStack: [],
    }));
  }, []);

  const handleUndo = useCallback(() => {
    const { undoStack, redoStack } = useGraphStore.getState();
    const cy = cyRef.current;
    if (!cy || undoStack.length === 0) return;

    const currentSnapshot: GraphSnapshot = {
      elements: cy.elements().jsons() as unknown as ElementDefinition[],
      timestamp: Date.now(),
    };

    const prev = undoStack[undoStack.length - 1];
    cy.elements().remove();
    cy.add(prev.elements as any);
    cy.fit(undefined, 40);

    useGraphStore.setState({
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, currentSnapshot],
    });
    addToast("Undo applied", "info");
  }, [addToast]);

  const handleRedo = useCallback(() => {
    const { undoStack, redoStack } = useGraphStore.getState();
    const cy = cyRef.current;
    if (!cy || redoStack.length === 0) return;

    const currentSnapshot: GraphSnapshot = {
      elements: cy.elements().jsons() as unknown as ElementDefinition[],
      timestamp: Date.now(),
    };

    const next = redoStack[redoStack.length - 1];
    cy.elements().remove();
    cy.add(next.elements as any);
    cy.fit(undefined, 40);

    useGraphStore.setState({
      undoStack: [...undoStack, currentSnapshot],
      redoStack: redoStack.slice(0, -1),
    });
    addToast("Redo applied", "info");
  }, [addToast]);

  // ---- Graph data ingestion ----
  const ingestData = useCallback(
    (data: GraphPayload, merge = true) => {
      const cy = cyRef.current;
      if (!cy) return;

      pushSnapshot();

      const entitiesMap = { ...useGraphStore.getState().entities };
      const relsMap = { ...useGraphStore.getState().relationships };

      for (const node of data.nodes) {
        entitiesMap[node.id] = node;
      }
      for (const edge of data.edges) {
        relsMap[edge.id] = edge;
      }

      useGraphStore.setState({ entities: entitiesMap, relationships: relsMap });

      const newElements = toCytoscapeElements(data);

      if (merge) {
        // Only add elements not already present
        for (const el of newElements) {
          const id = (el.data as any).id;
          if (id && cy.getElementById(id).length === 0) {
            cy.add(el);
          }
        }
      } else {
        cy.elements().remove();
        cy.add(newElements);
      }

      // Run layout
      const layoutOpts = buildLayoutOptions(useGraphStore.getState().layout);
      cy.layout(layoutOpts).run();
    },
    [pushSnapshot],
  );

  // ---- Initial data load ----
  useEffect(() => {
    const load = async () => {
      useGraphStore.setState({ loading: true, error: null });
      try {
        const data = initialData ?? (await graphApi.fetchGraph(caseId));
        // Wait for cy to be ready
        const waitForCy = () =>
          new Promise<void>((resolve) => {
            const check = () => {
              if (cyRef.current) {
                resolve();
              } else {
                setTimeout(check, 50);
              }
            };
            check();
          });
        await waitForCy();
        ingestData(data, false);
        useGraphStore.setState({ loading: false });
      } catch (err: any) {
        useGraphStore.setState({ loading: false, error: err?.message ?? "Failed to load graph data" });
      }
    };
    load();
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Node expansion (double-click or context menu) ----
  const expandNode = useCallback(
    async (nodeId: string) => {
      useGraphStore.setState({ loading: true });
      try {
        const data = await graphApi.expandNode({ nodeId, caseId });
        ingestData(data, true);
        addToast(`Expanded ${data.nodes.length} nodes and ${data.edges.length} edges`, "success");
      } catch (err: any) {
        useGraphStore.setState({ error: err?.message ?? "Expansion failed" });
      } finally {
        useGraphStore.setState({ loading: false });
      }
    },
    [caseId, ingestData, addToast],
  );

  // ---- OSINT enrichment ----
  const runOSINT = useCallback(
    async (nodeId: string) => {
      const entity = useGraphStore.getState().entities[nodeId];
      if (!entity) return;
      useGraphStore.setState({ loading: true });
      try {
        const results = await graphApi.runOSINT({ entityId: nodeId, entityType: entity.entityType });
        // Merge results into entity properties
        const updatedEntity = {
          ...entity,
          properties: { ...entity.properties, ...results } as Record<string, string | number | boolean | null>,
        };
        useGraphStore.setState((prev) => ({
          entities: { ...prev.entities, [nodeId]: updatedEntity },
          loading: false,
        }));
        setSelectedNode(updatedEntity);
        addToast("OSINT enrichment complete", "success");
      } catch (err: any) {
        useGraphStore.setState({ loading: false, error: err?.message ?? "OSINT enrichment failed" });
      }
    },
    [addToast],
  );

  // ---- Wallet tracing ----
  const traceWallet = useCallback(
    async (nodeId: string) => {
      const entity = useGraphStore.getState().entities[nodeId];
      if (!entity || entity.entityType !== "CryptoWallet") {
        addToast("Wallet tracing is only available for CryptoWallet entities", "warning");
        return;
      }
      useGraphStore.setState({ loading: true });
      try {
        const data = await graphApi.traceWallet({ walletAddress: entity.label });
        ingestData(data, true);
        addToast(`Traced wallet: ${data.nodes.length} entities found`, "success");
      } catch (err: any) {
        useGraphStore.setState({ loading: false, error: err?.message ?? "Wallet tracing failed" });
      }
    },
    [ingestData, addToast],
  );

  // ---- Add to case ----
  const addToCase = useCallback(
    async (nodeId: string) => {
      try {
        await graphApi.addToCase({ entityIds: [nodeId], caseId });
        addToast("Entity added to case", "success");
      } catch {
        addToast("Failed to add entity to case", "warning");
      }
    },
    [caseId, addToast],
  );

  // ---- Pin / Unpin ----
  const togglePin = useCallback(
    (nodeId: string) => {
      const cy = cyRef.current;
      if (!cy) return;
      const node = cy.getElementById(nodeId);
      if (node.length === 0) return;

      pushSnapshot();

      const isPinned = node.hasClass("pinned");
      if (isPinned) {
        node.removeClass("pinned");
        node.unlock();
      } else {
        node.addClass("pinned");
        node.lock();
      }

      useGraphStore.setState((prev) => {
        const entity = prev.entities[nodeId];
        if (!entity) return {};
        return {
          entities: { ...prev.entities, [nodeId]: { ...entity, pinned: !isPinned } },
        };
      });

      addToast(isPinned ? "Node unpinned" : "Node pinned", "info");
    },
    [pushSnapshot, addToast],
  );

  // ---- Hide node ----
  const hideNode = useCallback(
    (nodeId: string) => {
      const cy = cyRef.current;
      if (!cy) return;
      pushSnapshot();
      const node = cy.getElementById(nodeId);
      node.addClass("hidden");
      node.connectedEdges().addClass("hidden");

      // Deselect if this was the selected node
      if (useGraphStore.getState().selectedNodeId === nodeId) {
        useGraphStore.setState({ selectedNodeId: null });
        setSelectedNode(null);
        onNodeSelect?.(null);
      }

      addToast("Node hidden (undo to restore)", "info");
    },
    [pushSnapshot, addToast, onNodeSelect],
  );

  // ---- Context-menu actions builder ----
  const buildContextActions = useCallback(
    (nodeId: string): ContextMenuAction[] => {
      const entity = useGraphStore.getState().entities[nodeId];
      const actions: ContextMenuAction[] = [
        {
          key: "expand",
          label: "Expand connections",
          icon: "\u{1F50D}",
          shortcut: "Dbl-click",
          handler: () => expandNode(nodeId),
        },
        {
          key: "osint",
          label: "Run OSINT enrichment",
          icon: "\u{1F50E}",
          handler: () => runOSINT(nodeId),
        },
      ];

      if (entity?.entityType === "CryptoWallet") {
        actions.push({
          key: "trace",
          label: "Trace wallet",
          icon: "\u26D3",
          handler: () => traceWallet(nodeId),
        });
      }

      actions.push(
        {
          key: "addCase",
          label: "Add to case",
          icon: "\u{1F4C1}",
          handler: () => addToCase(nodeId),
        },
        {
          key: "pin",
          label: entity?.pinned ? "Unpin node" : "Pin node",
          icon: "\u{1F4CC}",
          handler: () => togglePin(nodeId),
        },
        {
          key: "hide",
          label: "Hide node",
          icon: "\u{1F6AB}",
          dangerous: true,
          handler: () => hideNode(nodeId),
        },
      );

      return actions;
    },
    [expandNode, runOSINT, traceWallet, addToCase, togglePin, hideNode],
  );

  // ---- Cytoscape event binding ----
  const handleCyReady = useCallback(
    (cy: Core) => {
      cyRef.current = cy;

      // ---- Click: select node ----
      cy.on("tap", "node", (evt: EventObject) => {
        const node = evt.target as NodeSingular;
        const nodeId = node.id();

        // Multi-select with shift
        if (evt.originalEvent && (evt.originalEvent as any).shiftKey) {
          useGraphStore.setState((prev) => {
            const ids = prev.multiSelectedNodeIds.includes(nodeId)
              ? prev.multiSelectedNodeIds.filter((id) => id !== nodeId)
              : [...prev.multiSelectedNodeIds, nodeId];
            return { multiSelectedNodeIds: ids };
          });
          return;
        }

        const entity = useGraphStore.getState().entities[nodeId];
        useGraphStore.setState({ selectedNodeId: nodeId, selectedEdgeId: null, detailPanelOpen: true });
        setSelectedNode(entity ?? null);
        setSelectedEdge(null);
        setConnectedCount(node.neighborhood("node").length);
        onNodeSelect?.(entity ?? null);
      });

      // ---- Click: select edge ----
      cy.on("tap", "edge", (evt: EventObject) => {
        const edge = evt.target as EdgeSingular;
        const edgeId = edge.id();
        const rel = useGraphStore.getState().relationships[edgeId];
        useGraphStore.setState({ selectedEdgeId: edgeId, selectedNodeId: null, detailPanelOpen: true });
        setSelectedEdge(rel ?? null);
        setSelectedNode(null);
        onEdgeSelect?.(rel ?? null);
      });

      // ---- Click: background deselect ----
      cy.on("tap", (evt: EventObject) => {
        if (evt.target === cy) {
          useGraphStore.setState({ selectedNodeId: null, selectedEdgeId: null, multiSelectedNodeIds: [] });
          setSelectedNode(null);
          setSelectedEdge(null);
          onNodeSelect?.(null);
          onEdgeSelect?.(null);
        }
      });

      // ---- Double-click: expand ----
      cy.on("dbltap", "node", (evt: EventObject) => {
        const nodeId = (evt.target as NodeSingular).id();
        expandNode(nodeId);
      });

      // ---- Right-click: context menu ----
      cy.on("cxttap", "node", (evt: EventObject) => {
        const node = evt.target as NodeSingular;
        const renderedPos = node.renderedPosition();
        const containerRect = containerRef.current?.getBoundingClientRect();
        if (!containerRect) return;

        setContextMenu({
          x: containerRect.left + renderedPos.x,
          y: containerRect.top + renderedPos.y,
          nodeId: node.id(),
        });
      });

      // Close context menu on background click
      cy.on("tap", () => {
        setContextMenu(null);
      });

      // ---- Hover highlighting ----
      cy.on("mouseover", "node", (evt: EventObject) => {
        const node = evt.target as NodeSingular;
        node.neighborhood().addClass("highlighted");
        node.addClass("highlighted");
      });

      cy.on("mouseout", "node", (evt: EventObject) => {
        const node = evt.target as NodeSingular;
        node.neighborhood().removeClass("highlighted");
        node.removeClass("highlighted");
      });

      // ---- Box selection (lasso) ----
      cy.on("boxselect", (evt: EventObject) => {
        const selectedNodes = cy.nodes(":selected");
        useGraphStore.setState({
          multiSelectedNodeIds: selectedNodes.map((n) => n.id()),
        });
      });
    },
    [expandNode, onNodeSelect, onEdgeSelect],
  );

  // ---- Apply entity-type filtering ----
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const { entityTypeFilters } = storeState;
    cy.nodes().forEach((node) => {
      const type = node.data("entityType") as EntityType;
      if (entityTypeFilters[type] === false) {
        node.addClass("faded");
      } else {
        node.removeClass("faded");
      }
    });
  }, [storeState.entityTypeFilters]);

  // ---- Apply edge-type filtering ----
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const { edgeTypeFilters } = storeState;
    cy.edges().forEach((edge) => {
      const type = edge.data("relationshipType") as RelationshipType;
      if (edgeTypeFilters[type] === false) {
        edge.addClass("faded");
      } else {
        edge.removeClass("faded");
      }
    });
  }, [storeState.edgeTypeFilters]);

  // ---- Search highlighting ----
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const query = storeState.searchQuery.toLowerCase().trim();
    cy.nodes().forEach((node) => {
      node.removeClass("highlighted");
    });

    if (query.length > 0) {
      cy.nodes().forEach((node) => {
        const label = (node.data("label") ?? "").toLowerCase();
        if (label.includes(query)) {
          node.addClass("highlighted");
        }
      });
    }
  }, [storeState.searchQuery]);

  // ---- Time-range filtering ----
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const { timeRange } = storeState;
    if (!timeRange) {
      // Show all
      cy.nodes().removeClass("faded");
      return;
    }

    cy.nodes().forEach((node) => {
      const firstSeen = new Date(node.data("firstSeen")).getTime();
      if (firstSeen > timeRange.end) {
        node.addClass("faded");
      } else {
        node.removeClass("faded");
      }
    });
  }, [storeState.timeRange]);

  // ---- Layout change ----
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || cy.nodes().length === 0) return;
    const layoutOpts = buildLayoutOptions(storeState.layout);
    cy.layout(layoutOpts).run();
  }, [storeState.layout]);

  // ---- Keyboard shortcuts ----
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+Z: undo
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      // Ctrl+Shift+Z: redo
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        handleRedo();
      }
      // Delete: hide selected node
      if (e.key === "Delete" || e.key === "Backspace") {
        const { selectedNodeId } = useGraphStore.getState();
        if (selectedNodeId) {
          hideNode(selectedNodeId);
        }
      }
      // Escape: deselect all
      if (e.key === "Escape") {
        const cy = cyRef.current;
        if (cy) {
          cy.elements().unselect();
          useGraphStore.setState({ selectedNodeId: null, selectedEdgeId: null, multiSelectedNodeIds: [] });
          setSelectedNode(null);
          setSelectedEdge(null);
          setContextMenu(null);
        }
      }
      // F: fit to screen
      if (e.key === "f" && !e.ctrlKey && !e.metaKey) {
        const target = e.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") return;
        cyRef.current?.fit(undefined, 40);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [handleUndo, handleRedo, hideNode]);

  // ---- Toolbar handlers ----
  const handleLayoutChange = useCallback((l: LayoutName) => {
    useGraphStore.setState({ layout: l });
  }, []);

  const handleSearchChange = useCallback((q: string) => {
    useGraphStore.setState({ searchQuery: q });
  }, []);

  const handleToggleEntityType = useCallback((t: EntityType) => {
    useGraphStore.setState((prev) => ({
      entityTypeFilters: { ...prev.entityTypeFilters, [t]: !prev.entityTypeFilters[t] },
    }));
  }, []);

  const handleToggleEdgeType = useCallback((t: RelationshipType) => {
    useGraphStore.setState((prev) => ({
      edgeTypeFilters: { ...prev.edgeTypeFilters, [t]: !prev.edgeTypeFilters[t] },
    }));
  }, []);

  const handleZoomIn = useCallback(() => {
    const cy = cyRef.current;
    if (cy) cy.zoom({ level: cy.zoom() * 1.3, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
  }, []);

  const handleZoomOut = useCallback(() => {
    const cy = cyRef.current;
    if (cy) cy.zoom({ level: cy.zoom() / 1.3, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
  }, []);

  const handleFitToScreen = useCallback(() => {
    cyRef.current?.fit(undefined, 40);
  }, []);

  const handleToggleMinimap = useCallback(() => {
    useGraphStore.setState((prev) => ({ minimapVisible: !prev.minimapVisible }));
  }, []);

  const handleToggleLegend = useCallback(() => {
    useGraphStore.setState((prev) => ({ legendVisible: !prev.legendVisible }));
  }, []);

  const handleExportPNG = useCallback(async () => {
    const cy = cyRef.current;
    if (!cy) return;
    try {
      const blob = await graphApi.exportPNG(cy);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `investigation-graph-${caseId}-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
      addToast("Graph exported as PNG", "success");
    } catch {
      addToast("Failed to export PNG", "warning");
    }
  }, [caseId, addToast]);

  const handleExportSVG = useCallback(async () => {
    const cy = cyRef.current;
    if (!cy) return;
    try {
      const svg = await graphApi.exportSVG(cy);
      const blob = new Blob([svg], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `investigation-graph-${caseId}-${Date.now()}.svg`;
      a.click();
      URL.revokeObjectURL(url);
      addToast("Graph exported as SVG", "success");
    } catch {
      addToast("Failed to export SVG", "warning");
    }
  }, [caseId, addToast]);

  const handleCloseDetailPanel = useCallback(() => {
    useGraphStore.setState({ selectedNodeId: null, selectedEdgeId: null, detailPanelOpen: false });
    setSelectedNode(null);
    setSelectedEdge(null);
    onNodeSelect?.(null);
    onEdgeSelect?.(null);
  }, [onNodeSelect, onEdgeSelect]);

  const handleTimeRangeChange = useCallback((range: { start: number; end: number } | null) => {
    useGraphStore.setState({ timeRange: range });
  }, []);

  // ---- Stylesheet (memoized) ----
  const stylesheet = useMemo(() => buildStylesheet(), []);

  // ---- Determine WebGL renderer hint ----
  const entityCount = Object.keys(storeState.entities).length;
  const useWebGL = entityCount > 1000;

  // ---- Cytoscape config ----
  const cyConfig = useMemo(
    () =>
      ({
        userZoomingEnabled: true,
        userPanningEnabled: true,
        boxSelectionEnabled: true,
        selectionType: "additive" as const,
        minZoom: 0.1,
        maxZoom: 5,
        wheelSensitivity: 0.3,
        renderer: useWebGL
          ? { name: "canvas" as const, webgl: true }
          : { name: "canvas" as const },
      } as const),
    [useWebGL],
  );

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-col h-full w-full bg-[#0F172A] text-slate-200 overflow-hidden ${className}`}
    >
      {/* Toolbar */}
      <Toolbar
        cy={cyRef.current}
        layout={storeState.layout}
        onLayoutChange={handleLayoutChange}
        searchQuery={storeState.searchQuery}
        onSearchChange={handleSearchChange}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={storeState.undoStack.length > 0}
        canRedo={storeState.redoStack.length > 0}
        onExportPNG={handleExportPNG}
        onExportSVG={handleExportSVG}
        onFitToScreen={handleFitToScreen}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onToggleMinimap={handleToggleMinimap}
        onToggleLegend={handleToggleLegend}
        minimapVisible={storeState.minimapVisible}
        legendVisible={storeState.legendVisible}
      />

      {/* Main body: graph + detail panel */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Graph canvas area */}
        <div className="flex-1 relative">
          <CytoscapeComponent
            elements={[]}
            stylesheet={stylesheet as any}
            cy={(cy: Core) => handleCyReady(cy)}
            style={{ width: "100%", height: "100%", background: "#0F172A" }}
            {...cyConfig}
          />

          {/* Filter panel (absolute, top-left) */}
          <FilterPanel
            entityTypeFilters={storeState.entityTypeFilters}
            edgeTypeFilters={storeState.edgeTypeFilters}
            onToggleEntityType={handleToggleEntityType}
            onToggleEdgeType={handleToggleEdgeType}
          />

          {/* Legend (absolute, bottom-left) */}
          <Legend visible={storeState.legendVisible} />

          {/* Minimap (absolute, bottom-right) */}
          <Minimap cy={cyRef.current} visible={storeState.minimapVisible} />

          {/* Timeline slider (absolute, bottom-center) */}
          <TimeRangeFilter
            timeRange={storeState.timeRange}
            onTimeRangeChange={handleTimeRangeChange}
            globalStart={timeBounds.start}
            globalEnd={timeBounds.end}
          />

          {/* Loading overlay */}
          {storeState.loading && <LoadingOverlay />}

          {/* Error banner */}
          {storeState.error && (
            <ErrorBanner
              message={storeState.error}
              onDismiss={() => useGraphStore.setState({ error: null })}
            />
          )}

          {/* Notification toasts */}
          <div className="absolute top-14 right-3 z-40 space-y-2 w-64">
            {toasts.map((t) => (
              <Toast key={t.id} message={t.message} type={t.type} onDismiss={() => removeToast(t.id)} />
            ))}
          </div>

          {/* Performance indicator for large graphs */}
          {useWebGL && (
            <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 text-[10px] text-amber-500/70 bg-slate-800/80 border border-amber-500/20 rounded px-3 py-1">
              Large graph mode ({entityCount} nodes) -- WebGL renderer active
            </div>
          )}

          {/* Node count badge */}
          <div className="absolute bottom-3 right-3 z-20 flex items-center gap-2 text-[10px] text-slate-600">
            <span>{Object.keys(storeState.entities).length} nodes</span>
            <span>&middot;</span>
            <span>{Object.keys(storeState.relationships).length} edges</span>
          </div>
        </div>

        {/* Detail panel (right sidebar) */}
        {storeState.detailPanelOpen && (
          <DetailPanel
            selectedNode={selectedNode}
            selectedEdge={selectedEdge}
            connectedCount={connectedCount}
            onClose={handleCloseDetailPanel}
            onExpandNode={expandNode}
            onRunOSINT={runOSINT}
            onAddToCase={addToCase}
            onPinToggle={togglePin}
            onHideNode={hideNode}
          />
        )}
      </div>

      {/* Context menu (portal-style, fixed position) */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          nodeId={contextMenu.nodeId}
          actions={buildContextActions(contextMenu.nodeId)}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
};

export default InvestigationGraph;

// ---------------------------------------------------------------------------
// 11. RE-EXPORTS for external consumers
// ---------------------------------------------------------------------------
export { ENTITY_STYLES, EDGE_STYLES, graphApi, useGraphStore, generateMockGraph };

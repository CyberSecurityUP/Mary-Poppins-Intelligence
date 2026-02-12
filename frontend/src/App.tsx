/**
 * Mary Poppins Digital Intelligence Platform
 * Main Application Shell
 *
 * React 18 + TypeScript application providing:
 * - React Router v6 with protected, role-based routes
 * - Collapsible sidebar navigation with top bar (alerts / user menu)
 * - Dark-theme provider (default for investigation tooling)
 * - Socket.IO real-time alert provider
 * - Keycloak-backed authentication context
 * - Breadcrumb navigation, global search, toast notifications
 *
 * Brand palette:
 *   Deep Navy   #0F172A
 *   Royal Purple #6D28D9
 *   Teal Accent  #14B8A6
 *   Alert Red    #EF4444
 *   Warm Gold    #F59E0B
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type FC,
  type PropsWithChildren,
  type ReactNode,
} from 'react';
import {
  BrowserRouter,
  Link,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  matchPath,
} from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import Keycloak from 'keycloak-js';

/* ------------------------------------------------------------------ */
/*  Lazy-loaded page components                                       */
/* ------------------------------------------------------------------ */

const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const Cases = React.lazy(() => import('./pages/Cases'));
const Investigations = React.lazy(() => import('./pages/Investigations'));
const OSINT = React.lazy(() => import('./pages/OSINT'));
const CryptoTracer = React.lazy(() => import('./pages/CryptoTracer'));
const DarkWebMonitor = React.lazy(() => import('./pages/DarkWebMonitor'));
const ContentAnalysis = React.lazy(() => import('./pages/ContentAnalysis'));
const Alerts = React.lazy(() => import('./pages/Alerts'));
const Settings = React.lazy(() => import('./pages/Settings'));
const AuditLog = React.lazy(() => import('./pages/AuditLog'));

/* ------------------------------------------------------------------ */
/*  TypeScript interfaces                                             */
/* ------------------------------------------------------------------ */

/** Role hierarchy used in RBAC enforcement. */
export type UserRole = 'admin' | 'analyst' | 'investigator' | 'viewer';

/** Authenticated user payload stored in AuthContext. */
export interface AuthUser {
  id: string;
  username: string;
  email: string;
  fullName: string;
  roles: UserRole[];
  avatarUrl?: string;
  organizationId: string;
  organizationName: string;
}

/** State managed by the auth reducer. */
interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AuthUser | null;
  token: string | null;
  error: string | null;
}

type AuthAction =
  | { type: 'AUTH_INIT' }
  | { type: 'AUTH_SUCCESS'; payload: { user: AuthUser; token: string } }
  | { type: 'AUTH_FAILURE'; payload: string }
  | { type: 'AUTH_LOGOUT' }
  | { type: 'TOKEN_REFRESHED'; payload: string };

/** Stored credential for locally-created users (persisted in localStorage). */
interface StoredCredential {
  email: string;
  password: string;
  name: string;
  role: string;
  tenantId: string;
  tenantName: string;
  mustChangePassword: boolean;
}

/** Context value exposed by AuthProvider. */
interface AuthContextValue extends AuthState {
  login: (email?: string, password?: string, tenantSlug?: string) => Promise<void>;
  loginWithTenant: (credential: StoredCredential) => void;
  logout: () => Promise<void>;
  switchTenant: (tenantId: string, tenantName: string) => void;
  pendingTenantSelection: StoredCredential[];
  clearPendingTenantSelection: () => void;
  hasRole: (role: UserRole) => boolean;
  hasAnyRole: (roles: UserRole[]) => boolean;
}

/** Theme modes supported. */
export type ThemeMode = 'dark' | 'light';

interface ThemeContextValue {
  mode: ThemeMode;
  toggle: () => void;
  setMode: (m: ThemeMode) => void;
  colors: typeof DARK_PALETTE;
}

/** Notification severity levels. */
export type ToastSeverity = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
  id: string;
  severity: ToastSeverity;
  title: string;
  message?: string;
  duration?: number;
  timestamp: number;
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (t: Omit<Toast, 'id' | 'timestamp'>) => void;
  removeToast: (id: string) => void;
  clearAll: () => void;
}

/** Real-time alert pushed via Socket.IO. */
export interface RealtimeAlert {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  source: string;
  timestamp: string;
  caseId?: string;
  read: boolean;
}

interface SocketContextValue {
  socket: Socket | null;
  isConnected: boolean;
  alerts: RealtimeAlert[];
  unreadCount: number;
  markRead: (id: string) => void;
  markAllRead: () => void;
}

/** Route metadata used to build sidebar and breadcrumbs. */
interface RouteConfig {
  path: string;
  label: string;
  icon: ReactNode;
  roles: UserRole[];
  children?: RouteConfig[];
}

/** Global search result shape. */
export interface SearchResult {
  id: string;
  type: 'case' | 'alert' | 'entity' | 'content' | 'wallet';
  title: string;
  subtitle?: string;
  url: string;
  score: number;
}

/* ------------------------------------------------------------------ */
/*  Color palettes                                                    */
/* ------------------------------------------------------------------ */

const DARK_PALETTE = {
  bgPrimary: '#0F172A',
  bgSecondary: '#1E293B',
  bgTertiary: '#334155',
  bgHover: '#475569',
  textPrimary: '#F8FAFC',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  accentPurple: '#6D28D9',
  accentPurpleHover: '#7C3AED',
  accentTeal: '#14B8A6',
  accentTealHover: '#2DD4BF',
  alertRed: '#EF4444',
  alertRedHover: '#F87171',
  warmGold: '#F59E0B',
  warmGoldHover: '#FBBF24',
  border: '#334155',
  borderLight: '#475569',
} as const;

const LIGHT_PALETTE = {
  bgPrimary: '#F8FAFC',
  bgSecondary: '#FFFFFF',
  bgTertiary: '#E2E8F0',
  bgHover: '#CBD5E1',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  accentPurple: '#6D28D9',
  accentPurpleHover: '#7C3AED',
  accentTeal: '#14B8A6',
  accentTealHover: '#2DD4BF',
  alertRed: '#EF4444',
  alertRedHover: '#F87171',
  warmGold: '#F59E0B',
  warmGoldHover: '#FBBF24',
  border: '#E2E8F0',
  borderLight: '#CBD5E1',
} as const;

/* ------------------------------------------------------------------ */
/*  SVG icon helpers (inline to avoid external deps for core icons)    */
/* ------------------------------------------------------------------ */

const UmbrellaIcon: FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 2v20" />
    <path d="M2 12a10 10 0 0 1 20 0" />
    <path d="M12 22a2 2 0 0 1-2-2" />
  </svg>
);

/** Minimal icon components used in sidebar navigation. */
const icons = {
  dashboard: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
    </svg>
  ),
  cases: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 0 0 .75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 0 0-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0 1 12 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 0 1-.673-.38m0 0A2.18 2.18 0 0 1 3 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 0 1 3.413-.387m7.5 0V5.25A2.25 2.25 0 0 0 13.5 3h-3a2.25 2.25 0 0 0-2.25 2.25v.894m7.5 0a48.667 48.667 0 0 0-7.5 0" />
    </svg>
  ),
  investigations: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0 0 20.25 18V6A2.25 2.25 0 0 0 18 3.75H6A2.25 2.25 0 0 0 3.75 6v12A2.25 2.25 0 0 0 6 20.25Z" />
    </svg>
  ),
  osint: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5a17.92 17.92 0 0 1-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
    </svg>
  ),
  crypto: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  ),
  darkweb: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  ),
  content: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
    </svg>
  ),
  alerts: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
    </svg>
  ),
  settings: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  ),
  audit: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z" />
    </svg>
  ),
  search: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
    </svg>
  ),
  chevronDown: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
    </svg>
  ),
  chevronRight: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
    </svg>
  ),
  menu: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
  ),
  close: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  ),
  bell: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
    </svg>
  ),
  user: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
    </svg>
  ),
  moon: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
    </svg>
  ),
  sun: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
    </svg>
  ),
};

/* ------------------------------------------------------------------ */
/*  Route definitions                                                 */
/* ------------------------------------------------------------------ */

const ROUTE_CONFIG: RouteConfig[] = [
  { path: '/', label: 'Dashboard', icon: icons.dashboard, roles: ['admin', 'analyst', 'investigator', 'viewer'] },
  { path: '/cases', label: 'Cases', icon: icons.cases, roles: ['admin', 'analyst', 'investigator'] },
  { path: '/investigations', label: 'Investigations', icon: icons.investigations, roles: ['admin', 'analyst', 'investigator'] },
  { path: '/osint', label: 'OSINT', icon: icons.osint, roles: ['admin', 'analyst', 'investigator'] },
  { path: '/crypto-tracer', label: 'Crypto Tracer', icon: icons.crypto, roles: ['admin', 'analyst', 'investigator'] },
  { path: '/dark-web', label: 'Dark Web Monitor', icon: icons.darkweb, roles: ['admin', 'analyst'] },
  { path: '/content-analysis', label: 'Content Analysis', icon: icons.content, roles: ['admin', 'analyst'] },
  { path: '/alerts', label: 'Alerts', icon: icons.alerts, roles: ['admin', 'analyst', 'investigator', 'viewer'] },
  { path: '/settings', label: 'Settings', icon: icons.settings, roles: ['admin'] },
  { path: '/audit-log', label: 'Audit Log', icon: icons.audit, roles: ['admin'] },
];

/* ------------------------------------------------------------------ */
/*  Keycloak singleton                                                */
/* ------------------------------------------------------------------ */

const keycloakInstance = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL ?? 'http://localhost:8180',
  realm: import.meta.env.VITE_KEYCLOAK_REALM ?? 'marypoppins',
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID ?? 'mp-frontend',
});

/* ------------------------------------------------------------------ */
/*  React Query client                                                */
/* ------------------------------------------------------------------ */

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

/* ------------------------------------------------------------------ */
/*  Theme Context & Provider                                          */
/* ------------------------------------------------------------------ */

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'dark',
  toggle: () => {},
  setMode: () => {},
  colors: DARK_PALETTE,
});

export const useTheme = (): ThemeContextValue => useContext(ThemeContext);

const ThemeProvider: FC<PropsWithChildren> = ({ children }) => {
  const [mode, setMode] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem('mp-theme');
    return (stored === 'light' ? 'light' : 'dark') as ThemeMode;
  });

  useEffect(() => {
    localStorage.setItem('mp-theme', mode);
    document.documentElement.classList.toggle('dark', mode === 'dark');
    document.documentElement.style.setProperty('--bg-primary', mode === 'dark' ? DARK_PALETTE.bgPrimary : LIGHT_PALETTE.bgPrimary);
  }, [mode]);

  const toggle = useCallback(() => setMode((m) => (m === 'dark' ? 'light' : 'dark')), []);
  const colors = mode === 'dark' ? DARK_PALETTE : LIGHT_PALETTE;

  const value = useMemo(() => ({ mode, toggle, setMode, colors }), [mode, toggle, colors]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

/* ------------------------------------------------------------------ */
/*  Auth Context & Provider                                           */
/* ------------------------------------------------------------------ */

const authInitialState: AuthState = {
  isAuthenticated: false,
  isLoading: true,
  user: null,
  token: null,
  error: null,
};

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'AUTH_INIT':
      return { ...state, isLoading: true, error: null };
    case 'AUTH_SUCCESS':
      return {
        isAuthenticated: true,
        isLoading: false,
        user: action.payload.user,
        token: action.payload.token,
        error: null,
      };
    case 'AUTH_FAILURE':
      return { ...authInitialState, isLoading: false, error: action.payload };
    case 'AUTH_LOGOUT':
      return { ...authInitialState, isLoading: false };
    case 'TOKEN_REFRESHED':
      return { ...state, token: action.payload };
    default:
      return state;
  }
}

const AuthContext = createContext<AuthContextValue>({
  ...authInitialState,
  login: async (_email?: string, _password?: string, _tenantSlug?: string) => {},
  loginWithTenant: () => {},
  logout: async () => {},
  switchTenant: () => {},
  pendingTenantSelection: [],
  clearPendingTenantSelection: () => {},
  hasRole: () => false,
  hasAnyRole: () => false,
});

export const useAuth = (): AuthContextValue => useContext(AuthContext);

/** Returns true when the active tenant is the demo environment. */
export const useIsDemoTenant = (): boolean => {
  const { user } = useAuth();
  return user?.organizationId === 'tenant-demo';
};

/** Dev-mode mock user (used when Keycloak is unreachable). */
const DEV_USER: AuthUser = {
  id: 'dev-admin-001',
  username: 'admin',
  email: 'admin@marypoppins.local',
  fullName: 'Platform Admin',
  roles: ['admin', 'analyst', 'investigator', 'viewer'],
  organizationId: 'tenant-demo',
  organizationName: 'Mary Poppins Demo',
};

/**
 * Built-in accounts that work without localStorage (e.g. incognito tabs).
 * Users created in Settings are stored in localStorage and also work.
 */
const BUILTIN_ACCOUNTS: Array<{
  email: string;
  password: string;
  user: AuthUser;
}> = [
  {
    email: 'admin',
    password: 'admin_dev',
    user: DEV_USER,
  },
  {
    email: 'admin@marypoppins.local',
    password: 'admin_dev',
    user: DEV_USER,
  },
  {
    email: 'investigator@mp.local',
    password: 'investigator',
    user: {
      id: 'builtin-investigator-001',
      username: 'investigator',
      email: 'investigator@mp.local',
      fullName: 'Jane Investigator',
      roles: ['investigator', 'viewer'],
      organizationId: 'tenant-demo',
      organizationName: 'Mary Poppins Demo',
    },
  },
  {
    email: 'analyst@mp.local',
    password: 'analyst',
    user: {
      id: 'builtin-analyst-001',
      username: 'analyst',
      email: 'analyst@mp.local',
      fullName: 'John Analyst',
      roles: ['analyst', 'viewer'],
      organizationId: 'tenant-demo',
      organizationName: 'Mary Poppins Demo',
    },
  },
  {
    email: 'viewer@mp.local',
    password: 'viewer',
    user: {
      id: 'builtin-viewer-001',
      username: 'viewer',
      email: 'viewer@mp.local',
      fullName: 'Sam Viewer',
      roles: ['viewer'],
      organizationId: 'tenant-demo',
      organizationName: 'Mary Poppins Demo',
    },
  },
];

const AuthProvider: FC<PropsWithChildren> = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, authInitialState);
  const [pendingTenantSelection, setPendingTenantSelection] = useState<StoredCredential[]>([]);
  const tokenRefreshInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const keycloakReady = useRef(false);

  /** Map Keycloak role names to our UserRole type. */
  const ROLE_MAP: Record<string, UserRole> = {
    'mp_admin': 'admin',
    'mp_analyst': 'analyst',
    'mp_investigator': 'investigator',
    'mp_reviewer': 'analyst',
    'mp_auditor': 'viewer',
    'mp_viewer': 'viewer',
    // Also accept direct role names
    'admin': 'admin',
    'analyst': 'analyst',
    'investigator': 'investigator',
    'viewer': 'viewer',
  };

  /** Map Keycloak token claims into our AuthUser shape. */
  const extractUser = useCallback((kc: Keycloak): AuthUser => {
    const parsed = kc.tokenParsed as Record<string, unknown> | undefined;
    const kcRoles = (parsed?.realm_access as { roles?: string[] })?.roles ?? [];

    const mappedRoles = kcRoles
      .map((r) => ROLE_MAP[r])
      .filter((r): r is UserRole => r !== undefined);

    // Ensure at least viewer role; grant admin if mp_admin present
    const finalRoles: UserRole[] = mappedRoles.length > 0 ? [...new Set(mappedRoles)] : ['viewer'];

    return {
      id: (parsed?.sub as string) ?? '',
      username: (parsed?.preferred_username as string) ?? '',
      email: (parsed?.email as string) ?? '',
      fullName: (parsed?.name as string) ?? (parsed?.preferred_username as string) ?? 'User',
      roles: finalRoles,
      avatarUrl: parsed?.picture as string | undefined,
      organizationId: (parsed?.org_id as string) ?? '',
      organizationName: (parsed?.org_name as string) ?? 'Mary Poppins',
    };
  }, []);

  /** Activate dev bypass (mock auth without Keycloak). */
  const activateDevBypass = useCallback(() => {
    console.warn('[Auth] Keycloak unavailable — using dev bypass auth');
    dispatch({
      type: 'AUTH_SUCCESS',
      payload: { user: DEV_USER, token: 'dev-token-bypass' },
    });
  }, []);

  /**
   * Initialize auth on mount.
   * We NEVER auto-login. Always show our LoginPage first.
   * Keycloak is initialized without onLoad so it only processes redirect callbacks
   * (from an explicit SSO login) but never silently checks for existing sessions.
   */
  useEffect(() => {
    const init = async () => {
      dispatch({ type: 'AUTH_INIT' });

      // Quick Keycloak connectivity check
      let kcReachable = false;
      try {
        const kcUrl = import.meta.env.VITE_KEYCLOAK_URL ?? 'http://localhost:8180';
        const resp = await fetch(`${kcUrl}/realms/marypoppins`, { signal: AbortSignal.timeout(3000) });
        kcReachable = resp.ok;
      } catch {
        kcReachable = false;
      }

      if (!kcReachable) {
        console.warn('[Auth] Keycloak not reachable — local login only');
        keycloakReady.current = false;
        dispatch({ type: 'AUTH_FAILURE', payload: '' });
        return;
      }

      try {
        // No onLoad → processes redirect callbacks only, no auto-login
        const authenticated = await keycloakInstance.init({
          checkLoginIframe: false,
          pkceMethod: 'S256',
        });
        keycloakReady.current = true;

        if (authenticated && keycloakInstance.token) {
          // User returned from a Keycloak SSO redirect
          const user = extractUser(keycloakInstance);
          dispatch({ type: 'AUTH_SUCCESS', payload: { user, token: keycloakInstance.token } });

          tokenRefreshInterval.current = setInterval(async () => {
            try {
              const refreshed = await keycloakInstance.updateToken(60);
              if (refreshed && keycloakInstance.token) {
                dispatch({ type: 'TOKEN_REFRESHED', payload: keycloakInstance.token });
              }
            } catch {
              dispatch({ type: 'AUTH_LOGOUT' });
            }
          }, 55_000);
        } else {
          // Keycloak available, no redirect callback → show our login page
          dispatch({ type: 'AUTH_FAILURE', payload: '' });
        }
      } catch (err) {
        console.warn('[Auth] Keycloak init error:', err);
        keycloakReady.current = false;
        dispatch({ type: 'AUTH_FAILURE', payload: '' });
      }
    };

    init();

    return () => {
      if (tokenRefreshInterval.current) clearInterval(tokenRefreshInterval.current);
    };
  }, [extractUser, activateDevBypass]);

  /** Look up users in localStorage credential store (returns all matching tenants). */
  const findStoredUsers = useCallback((email: string, password: string): StoredCredential[] => {
    try {
      const raw = localStorage.getItem('mp-platform-users');
      if (!raw) return [];
      const users: StoredCredential[] = JSON.parse(raw);
      return users.filter((u) => u.email === email && u.password === password);
    } catch {
      return [];
    }
  }, []);

  /** Map role string from settings to UserRole type. */
  const mapSettingsRole = useCallback((role: string): UserRole[] => {
    const roleMap: Record<string, UserRole[]> = {
      'Administrator': ['admin', 'analyst', 'investigator', 'viewer'],
      'Lead Investigator': ['analyst', 'investigator', 'viewer'],
      'Investigator': ['investigator', 'viewer'],
      'Analyst': ['analyst', 'viewer'],
      'Auditor': ['viewer'],
      'Ethics Board': ['viewer'],
    };
    return roleMap[role] ?? ['viewer'];
  }, []);

  /** Complete login for a specific stored credential (used by tenant picker). */
  const loginWithTenant = useCallback((stored: StoredCredential) => {
    const userRoles = mapSettingsRole(stored.role);
    const user: AuthUser = {
      id: `user-${Date.now()}`,
      username: stored.email.split('@')[0],
      email: stored.email,
      fullName: stored.name,
      roles: userRoles,
      organizationId: stored.tenantId,
      organizationName: stored.tenantName,
    };
    dispatch({
      type: 'AUTH_SUCCESS',
      payload: { user, token: `local-token-${Date.now()}` },
    });
    setPendingTenantSelection([]);

    if (stored.mustChangePassword) {
      localStorage.setItem('mp-must-change-password', stored.email);
    }
  }, [mapSettingsRole]);

  const login = useCallback(async (email?: string, password?: string, tenantSlug?: string) => {
    // Credential-based login (from login form)
    if (email && password) {
      // 1. Check built-in accounts (always available, even in incognito)
      const builtin = BUILTIN_ACCOUNTS.find(
        (a) => a.email === email && a.password === password,
      );
      if (builtin) {
        dispatch({
          type: 'AUTH_SUCCESS',
          payload: { user: builtin.user, token: 'dev-token-bypass' },
        });
        return;
      }

      // 2. Check localStorage credential store (users created in Settings)
      let storedMatches = findStoredUsers(email, password);

      // Filter by tenant if provided
      if (tenantSlug && storedMatches.length > 0) {
        const slug = tenantSlug.trim().toLowerCase();
        const filtered = storedMatches.filter(
          (s) => s.tenantId.toLowerCase() === slug
            || s.tenantId.toLowerCase() === `tenant-${slug}`
            || s.tenantName.toLowerCase().includes(slug),
        );
        if (filtered.length > 0) storedMatches = filtered;
      }

      if (storedMatches.length === 1) {
        // Single tenant — log in directly
        loginWithTenant(storedMatches[0]);
        return;
      }
      if (storedMatches.length > 1) {
        // Multiple tenants — show tenant picker
        setPendingTenantSelection(storedMatches);
        return;
      }

      // 3. No match
      dispatch({ type: 'AUTH_FAILURE', payload: 'Invalid email or password' });
      return;
    }

    // SSO login (no credentials provided)
    if (keycloakReady.current) {
      await keycloakInstance.login();
    } else {
      activateDevBypass();
    }
  }, [activateDevBypass, findStoredUsers, loginWithTenant, mapSettingsRole]);

  const logout = useCallback(async () => {
    if (tokenRefreshInterval.current) clearInterval(tokenRefreshInterval.current);
    localStorage.removeItem('mp-must-change-password');
    dispatch({ type: 'AUTH_LOGOUT' });
    if (keycloakReady.current) {
      await keycloakInstance.logout({ redirectUri: window.location.origin });
    }
  }, []);

  /** Switch tenant context without re-authenticating. */
  const switchTenant = useCallback((tenantId: string, tenantName: string) => {
    if (!state.user) return;
    dispatch({
      type: 'AUTH_SUCCESS',
      payload: {
        user: { ...state.user, organizationId: tenantId, organizationName: tenantName },
        token: state.token ?? `local-token-${Date.now()}`,
      },
    });
  }, [state.user, state.token]);

  const clearPendingTenantSelection = useCallback(() => {
    setPendingTenantSelection([]);
  }, []);

  const hasRole = useCallback(
    (role: UserRole) => state.user?.roles.includes(role) ?? false,
    [state.user],
  );

  const hasAnyRole = useCallback(
    (roles: UserRole[]) => roles.some((r) => state.user?.roles.includes(r)),
    [state.user],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, login, loginWithTenant, logout, switchTenant, pendingTenantSelection, clearPendingTenantSelection, hasRole, hasAnyRole }),
    [state, login, loginWithTenant, logout, switchTenant, pendingTenantSelection, clearPendingTenantSelection, hasRole, hasAnyRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

/* ------------------------------------------------------------------ */
/*  Toast Context & Provider                                          */
/* ------------------------------------------------------------------ */

const ToastContext = createContext<ToastContextValue>({
  toasts: [],
  addToast: () => {},
  removeToast: () => {},
  clearAll: () => {},
});

export const useToast = (): ToastContextValue => useContext(ToastContext);

const ToastProvider: FC<PropsWithChildren> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (t: Omit<Toast, 'id' | 'timestamp'>) => {
      const id = crypto.randomUUID();
      const toast: Toast = { ...t, id, timestamp: Date.now() };
      setToasts((prev) => [...prev, toast]);

      const duration = t.duration ?? 5000;
      if (duration > 0) {
        setTimeout(() => removeToast(id), duration);
      }
    },
    [removeToast],
  );

  const clearAll = useCallback(() => setToasts([]), []);

  const value = useMemo(() => ({ toasts, addToast, removeToast, clearAll }), [toasts, addToast, removeToast, clearAll]);

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
};

/* ------------------------------------------------------------------ */
/*  Toast renderer                                                    */
/* ------------------------------------------------------------------ */

const severityStyles: Record<ToastSeverity, string> = {
  info: 'border-l-4 border-l-blue-500 bg-blue-500/10',
  success: 'border-l-4 border-l-emerald-500 bg-emerald-500/10',
  warning: 'border-l-4 border-l-amber-500 bg-amber-500/10',
  error: 'border-l-4 border-l-red-500 bg-red-500/10',
};

const ToastContainer: FC = () => {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto rounded-lg p-4 shadow-xl backdrop-blur-sm ${severityStyles[t.severity]} text-slate-100 animate-slide-in`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{t.title}</p>
              {t.message && <p className="text-xs text-slate-300 mt-1">{t.message}</p>}
            </div>
            <button
              type="button"
              onClick={() => removeToast(t.id)}
              className="text-slate-400 hover:text-slate-200 transition-colors shrink-0"
              aria-label="Dismiss notification"
            >
              {icons.close}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Socket.IO Context & Provider                                      */
/* ------------------------------------------------------------------ */

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  isConnected: false,
  alerts: [],
  unreadCount: 0,
  markRead: () => {},
  markAllRead: () => {},
});

export const useSocket = (): SocketContextValue => useContext(SocketContext);

const SocketProvider: FC<PropsWithChildren> = ({ children }) => {
  const { token, isAuthenticated } = useAuth();
  const { addToast } = useToast();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [alerts, setAlerts] = useState<RealtimeAlert[]>([]);

  useEffect(() => {
    if (!isAuthenticated || !token) return;

    const socketUrl = import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:3001';
    const s = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });

    s.on('connect', () => setIsConnected(true));
    s.on('disconnect', () => setIsConnected(false));

    s.on('alert', (alert: RealtimeAlert) => {
      setAlerts((prev) => [alert, ...prev].slice(0, 200));
      const severityMap: Record<string, ToastSeverity> = {
        critical: 'error',
        high: 'error',
        medium: 'warning',
        low: 'info',
        info: 'info',
      };
      addToast({
        severity: severityMap[alert.severity] ?? 'info',
        title: `[${alert.severity.toUpperCase()}] ${alert.title}`,
        message: `Source: ${alert.source}`,
        duration: alert.severity === 'critical' ? 0 : 8000,
      });
    });

    s.on('connect_error', (err) => {
      console.error('[Socket.IO] Connection error:', err.message);
    });

    setSocket(s);

    return () => {
      s.disconnect();
      setSocket(null);
      setIsConnected(false);
    };
  }, [isAuthenticated, token, addToast]);

  const markRead = useCallback((id: string) => {
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, read: true } : a)));
  }, []);

  const markAllRead = useCallback(() => {
    setAlerts((prev) => prev.map((a) => ({ ...a, read: true })));
  }, []);

  const unreadCount = useMemo(() => alerts.filter((a) => !a.read).length, [alerts]);

  const value = useMemo(
    () => ({ socket, isConnected, alerts, unreadCount, markRead, markAllRead }),
    [socket, isConnected, alerts, unreadCount, markRead, markAllRead],
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};

/* ------------------------------------------------------------------ */
/*  Global Search Bar                                                 */
/* ------------------------------------------------------------------ */

const GlobalSearchBar: FC = () => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Keyboard shortcut: Cmd/Ctrl + K to focus search.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
        inputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
        setQuery('');
        setResults([]);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Debounced search.
  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }
    setIsSearching(true);
    const timeout = setTimeout(async () => {
      try {
        const response = await fetch(`/api/v1/search?q=${encodeURIComponent(query)}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('mp-token') ?? ''}` },
        });
        if (response.ok) {
          const data = (await response.json()) as { results: SearchResult[] };
          setResults(data.results);
        }
      } catch {
        // Silently fail -- search is non-critical.
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [query]);

  const handleSelect = (result: SearchResult) => {
    navigate(result.url);
    setIsOpen(false);
    setQuery('');
    setResults([]);
  };

  const typeColors: Record<SearchResult['type'], string> = {
    case: 'bg-purple-600',
    alert: 'bg-red-500',
    entity: 'bg-teal-500',
    content: 'bg-amber-500',
    wallet: 'bg-blue-500',
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setIsOpen(true);
          setTimeout(() => inputRef.current?.focus(), 50);
        }}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 hover:border-slate-600 text-slate-400 text-sm transition-colors min-w-[240px]"
      >
        {icons.search}
        <span>Search everything...</span>
        <kbd className="ml-auto text-[10px] bg-slate-700 px-1.5 py-0.5 rounded font-mono">
          {navigator.platform.includes('Mac') ? '\u2318' : 'Ctrl'}+K
        </kbd>
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => {
              setIsOpen(false);
              setQuery('');
              setResults([]);
            }}
          />
          {/* Search modal */}
          <div className="fixed top-[15%] left-1/2 -translate-x-1/2 w-full max-w-xl z-50">
            <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
              <div className="flex items-center gap-3 p-4 border-b border-slate-700">
                <span className="text-slate-400">{icons.search}</span>
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search cases, alerts, entities, wallets..."
                  className="flex-1 bg-transparent text-slate-100 placeholder-slate-500 outline-none text-sm"
                  autoComplete="off"
                />
                {isSearching && (
                  <div className="w-4 h-4 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
                )}
                <kbd
                  className="text-[10px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded font-mono cursor-pointer"
                  onClick={() => {
                    setIsOpen(false);
                    setQuery('');
                    setResults([]);
                  }}
                >
                  ESC
                </kbd>
              </div>

              {results.length > 0 && (
                <ul className="max-h-80 overflow-y-auto p-2">
                  {results.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => handleSelect(r)}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800 text-left transition-colors"
                      >
                        <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded text-white ${typeColors[r.type]}`}>
                          {r.type}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-200 truncate">{r.title}</p>
                          {r.subtitle && <p className="text-xs text-slate-500 truncate">{r.subtitle}</p>}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {query.length >= 2 && results.length === 0 && !isSearching && (
                <div className="p-8 text-center text-slate-500 text-sm">
                  No results found for &ldquo;{query}&rdquo;
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Breadcrumb Navigation                                             */
/* ------------------------------------------------------------------ */

const Breadcrumbs: FC = () => {
  const location = useLocation();

  const crumbs = useMemo(() => {
    const segments = location.pathname.split('/').filter(Boolean);
    const items: { label: string; path: string }[] = [{ label: 'Dashboard', path: '/' }];

    let accumulated = '';
    for (const seg of segments) {
      accumulated += `/${seg}`;
      const route = ROUTE_CONFIG.find((r) => matchPath(r.path, accumulated));
      items.push({
        label: route?.label ?? seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, ' '),
        path: accumulated,
      });
    }

    return items;
  }, [location.pathname]);

  if (crumbs.length <= 1) return null;

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-slate-500 mb-4">
      {crumbs.map((c, i) => (
        <React.Fragment key={c.path}>
          {i > 0 && <span className="mx-1">/</span>}
          {i === crumbs.length - 1 ? (
            <span className="text-slate-300 font-medium">{c.label}</span>
          ) : (
            <Link to={c.path} className="hover:text-teal-400 transition-colors">
              {c.label}
            </Link>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
};

/* ------------------------------------------------------------------ */
/*  Protected Route wrapper                                           */
/* ------------------------------------------------------------------ */

interface ProtectedRouteProps {
  roles: UserRole[];
  children: ReactNode;
}

const ProtectedRoute: FC<ProtectedRouteProps> = ({ roles, children }) => {
  const { isAuthenticated, isLoading, user, token } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-950">
        <div className="flex flex-col items-center gap-4">
          <UmbrellaIcon className="w-12 h-12 text-purple-500 animate-bounce" />
          <p className="text-slate-400 text-sm">Loading Mary Poppins...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Dev bypass — skip role check when using mock auth
  const isDevBypass = token === 'dev-token-bypass';
  const userRoles = user?.roles ?? [];
  const allowed = isDevBypass || roles.length === 0 || roles.some((r) => userRoles.includes(r));

  if (!allowed) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center p-8">
          <div className="text-6xl mb-4 text-red-500">403</div>
          <h2 className="text-xl font-semibold text-slate-200 mb-2">Access Denied</h2>
          <p className="text-slate-400 text-sm">You do not have permission to access this resource.</p>
          <Link to="/" className="mt-4 inline-block text-teal-400 hover:text-teal-300 text-sm">
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

/* ------------------------------------------------------------------ */
/*  Sidebar Navigation                                                */
/* ------------------------------------------------------------------ */

/** Get all tenants a user belongs to from localStorage. */
const getUserTenants = (userEmail: string): Array<{ tenantId: string; tenantName: string; role: string }> => {
  try {
    const raw = localStorage.getItem('mp-platform-users');
    if (!raw) return [];
    const users: Array<{ email: string; tenantId: string; tenantName: string; role: string }> = JSON.parse(raw);
    const seen = new Set<string>();
    return users
      .filter((u) => u.email === userEmail && !seen.has(u.tenantId) && seen.add(u.tenantId))
      .map((u) => ({ tenantId: u.tenantId, tenantName: u.tenantName, role: u.role }));
  } catch { return []; }
};

const Sidebar: FC<{ collapsed: boolean; onToggle: () => void }> = ({ collapsed, onToggle }) => {
  const location = useLocation();
  const { hasAnyRole, user, switchTenant } = useAuth();
  const { isConnected } = useSocket();
  const [showTenantSwitcher, setShowTenantSwitcher] = useState(false);

  const visibleRoutes = ROUTE_CONFIG.filter((r) => hasAnyRole(r.roles));

  return (
    <aside
      className={`fixed left-0 top-0 h-screen bg-slate-950 border-r border-slate-800 flex flex-col transition-all duration-300 z-30 ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Brand header */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-slate-800 shrink-0">
        <UmbrellaIcon className="w-7 h-7 text-purple-500 shrink-0" />
        {!collapsed && (
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-bold text-slate-100 truncate tracking-wide">Mary Poppins</span>
            <span className="text-[10px] text-slate-500 uppercase tracking-widest">Intelligence</span>
          </div>
        )}
        <button
          type="button"
          onClick={onToggle}
          className={`text-slate-400 hover:text-slate-200 transition-colors ${collapsed ? 'mx-auto' : 'ml-auto'}`}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? icons.chevronRight : icons.menu}
        </button>
      </div>

      {/* Navigation links */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1" aria-label="Main navigation">
        {visibleRoutes.map((route) => {
          const isActive =
            route.path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(route.path);

          return (
            <Link
              key={route.path}
              to={route.path}
              title={collapsed ? route.label : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors group ${
                isActive
                  ? 'bg-purple-600/20 text-purple-400 border-l-2 border-purple-500'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              } ${collapsed ? 'justify-center px-0' : ''}`}
            >
              <span className={`shrink-0 ${isActive ? 'text-purple-400' : 'text-slate-500 group-hover:text-slate-300'}`}>
                {route.icon}
              </span>
              {!collapsed && <span className="truncate">{route.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer: connection status & user */}
      <div className="border-t border-slate-800 px-4 py-3 space-y-3 shrink-0">
        {/* Connection indicator */}
        <div className={`flex items-center gap-2 ${collapsed ? 'justify-center' : ''}`}>
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-red-500'} animate-pulse`} />
          {!collapsed && (
            <span className="text-[11px] text-slate-500">{isConnected ? 'Connected' : 'Disconnected'}</span>
          )}
        </div>

        {/* User info + tenant */}
        {user && !collapsed && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-purple-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                {user.fullName
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-xs text-slate-300 truncate">{user.fullName}</p>
                <p className="text-[10px] text-slate-600 truncate">{user.roles[0]}</p>
              </div>
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  const tenants = getUserTenants(user.email);
                  if (tenants.length > 1) setShowTenantSwitcher((v) => !v);
                }}
                className="flex items-center gap-1.5 px-1 w-full group"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" />
                <p className="text-[10px] text-violet-400 truncate font-medium">{user.organizationName}</p>
                {getUserTenants(user.email).length > 1 && (
                  <svg className="w-3 h-3 text-slate-600 group-hover:text-slate-400 ml-auto shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15 12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9" />
                  </svg>
                )}
              </button>
              {showTenantSwitcher && (
                <div className="absolute bottom-full left-0 w-full bg-slate-900 border border-slate-700 rounded-lg shadow-xl mb-1 z-50 max-h-40 overflow-y-auto">
                  <p className="px-3 py-1.5 text-[9px] text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-800">Switch Tenant</p>
                  {getUserTenants(user.email).map((t) => (
                    <button
                      key={t.tenantId}
                      type="button"
                      onClick={() => {
                        switchTenant(t.tenantId, t.tenantName);
                        setShowTenantSwitcher(false);
                      }}
                      className={`w-full px-3 py-2 text-left text-xs transition-colors ${
                        t.tenantId === user.organizationId
                          ? 'text-violet-400 bg-violet-500/10'
                          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                      }`}
                    >
                      <p className="truncate font-medium">{t.tenantName}</p>
                      <p className="text-[9px] text-slate-600 truncate">{t.role}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};

/* ------------------------------------------------------------------ */
/*  Top Bar                                                           */
/* ------------------------------------------------------------------ */

const TopBar: FC<{ sidebarCollapsed: boolean }> = ({ sidebarCollapsed }) => {
  const { user, logout, switchTenant } = useAuth();
  const { unreadCount, alerts, markAllRead } = useSocket();
  const { mode, toggle } = useTheme();
  const [showAlerts, setShowAlerts] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  return (
    <header
      className={`fixed top-0 right-0 h-16 bg-slate-950/80 backdrop-blur-md border-b border-slate-800 flex items-center justify-between px-6 z-20 transition-all duration-300 ${
        sidebarCollapsed ? 'left-16' : 'left-64'
      }`}
    >
      {/* Left: search */}
      <GlobalSearchBar />

      {/* Right: actions */}
      <div className="flex items-center gap-3">
        {/* Theme toggle */}
        <button
          type="button"
          onClick={toggle}
          className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          aria-label={`Switch to ${mode === 'dark' ? 'light' : 'dark'} mode`}
        >
          {mode === 'dark' ? icons.sun : icons.moon}
        </button>

        {/* Alert bell */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowAlerts((v) => !v);
              setShowUserMenu(false);
            }}
            className="relative p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            aria-label="View alerts"
          >
            {icons.bell}
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {showAlerts && (
            <div className="absolute right-0 top-full mt-2 w-96 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden z-50">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
                <h3 className="text-sm font-semibold text-slate-200">Alerts</h3>
                <button
                  type="button"
                  onClick={markAllRead}
                  className="text-xs text-teal-400 hover:text-teal-300"
                >
                  Mark all read
                </button>
              </div>
              <ul className="max-h-80 overflow-y-auto divide-y divide-slate-800">
                {alerts.slice(0, 20).map((a) => {
                  const severityColor: Record<string, string> = {
                    critical: 'text-red-500',
                    high: 'text-orange-500',
                    medium: 'text-amber-500',
                    low: 'text-blue-400',
                    info: 'text-slate-400',
                  };
                  return (
                    <li
                      key={a.id}
                      className={`px-4 py-3 hover:bg-slate-800 cursor-pointer transition-colors ${
                        !a.read ? 'bg-slate-800/50' : ''
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <span className={`text-[10px] font-bold uppercase mt-0.5 ${severityColor[a.severity]}`}>
                          {a.severity}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-200 truncate">{a.title}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{a.source} &middot; {new Date(a.timestamp).toLocaleTimeString()}</p>
                        </div>
                        {!a.read && <span className="w-2 h-2 rounded-full bg-teal-400 mt-1.5 shrink-0" />}
                      </div>
                    </li>
                  );
                })}
                {alerts.length === 0 && (
                  <li className="px-4 py-8 text-center text-slate-500 text-sm">No alerts yet</li>
                )}
              </ul>
              <Link
                to="/alerts"
                onClick={() => setShowAlerts(false)}
                className="block text-center py-2.5 text-xs text-teal-400 hover:bg-slate-800 border-t border-slate-700"
              >
                View all alerts
              </Link>
            </div>
          )}
        </div>

        {/* User menu */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowUserMenu((v) => !v);
              setShowAlerts(false);
            }}
            className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
            aria-label="User menu"
          >
            <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-white text-xs font-bold">
              {user?.fullName
                ?.split(' ')
                .map((n) => n[0])
                .join('')
                .slice(0, 2)
                .toUpperCase() ?? 'U'}
            </div>
            {icons.chevronDown}
          </button>

          {showUserMenu && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden z-50">
              <div className="px-4 py-3 border-b border-slate-700">
                <p className="text-sm font-medium text-slate-200">{user?.fullName}</p>
                <p className="text-xs text-slate-500">{user?.email}</p>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" />
                  <p className="text-[10px] text-violet-400 font-medium">{user?.organizationName}</p>
                </div>
              </div>
              {/* Tenant switcher (only if multi-tenant) */}
              {user && getUserTenants(user.email).length > 1 && (
                <div className="border-b border-slate-700 py-1">
                  <p className="px-4 py-1 text-[9px] text-slate-500 uppercase tracking-wider font-semibold">Switch Tenant</p>
                  {getUserTenants(user.email)
                    .filter((t) => t.tenantId !== user.organizationId)
                    .map((t) => (
                      <button
                        key={t.tenantId}
                        type="button"
                        onClick={() => {
                          switchTenant(t.tenantId, t.tenantName);
                          setShowUserMenu(false);
                        }}
                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
                      >
                        <svg className="w-4 h-4 text-violet-500/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                        </svg>
                        {t.tenantName}
                      </button>
                    ))}
                </div>
              )}
              <div className="py-1">
                <Link
                  to="/settings"
                  onClick={() => setShowUserMenu(false)}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 transition-colors"
                >
                  {icons.settings}
                  Settings
                </Link>
                <Link
                  to="/audit-log"
                  onClick={() => setShowUserMenu(false)}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 transition-colors"
                >
                  {icons.audit}
                  Audit Log
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setShowUserMenu(false);
                    logout();
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-slate-800 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
                  </svg>
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

/* ------------------------------------------------------------------ */
/*  Main Layout                                                       */
/* ------------------------------------------------------------------ */

const MainLayout: FC = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem('mp-sidebar-collapsed') === 'true';
  });

  const handleToggle = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('mp-sidebar-collapsed', String(next));
      return next;
    });
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Sidebar collapsed={sidebarCollapsed} onToggle={handleToggle} />
      <TopBar sidebarCollapsed={sidebarCollapsed} />
      <main
        className={`pt-16 min-h-screen transition-all duration-300 ${
          sidebarCollapsed ? 'ml-16' : 'ml-64'
        }`}
      >
        <div className="p-6">
          <Breadcrumbs />
          <React.Suspense
            fallback={
              <div className="flex items-center justify-center h-64">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-slate-500">Loading...</p>
                </div>
              </div>
            }
          >
            <Outlet />
          </React.Suspense>
        </div>
      </main>
      <ToastContainer />
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Login Page (minimal, redirects to Keycloak)                       */
/* ------------------------------------------------------------------ */

const LoginPage: FC = () => {
  const { login, loginWithTenant, isLoading, error, isAuthenticated, pendingTenantSelection, clearPendingTenantSelection } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenant, setTenant] = useState('');
  const [localError, setLocalError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Password change flow
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) navigate('/', { replace: true });
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');
    if (!email.trim() || !password.trim()) {
      setLocalError('Please enter email and password');
      return;
    }
    setIsSubmitting(true);
    try {
      await login(email.trim(), password.trim(), tenant.trim() || undefined);
      // Check if password change is required
      const mustChange = localStorage.getItem('mp-must-change-password');
      if (mustChange === email.trim()) {
        setMustChangePassword(true);
        setIsSubmitting(false);
        return;
      }
    } catch {
      setLocalError('Login failed');
    }
    setIsSubmitting(false);
  };

  const handlePasswordChange = () => {
    if (newPassword.length < 8) {
      setLocalError('New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setLocalError('Passwords do not match');
      return;
    }
    // Update the stored password
    try {
      const raw = localStorage.getItem('mp-platform-users');
      if (raw) {
        const users = JSON.parse(raw);
        const updated = users.map((u: { email: string; password: string; mustChangePassword: boolean }) =>
          u.email === email ? { ...u, password: newPassword, mustChangePassword: false } : u,
        );
        localStorage.setItem('mp-platform-users', JSON.stringify(updated));
      }
      localStorage.removeItem('mp-must-change-password');
    } catch { /* ignore */ }
    setMustChangePassword(false);
    navigate('/', { replace: true });
  };

  const displayError = localError || error || '';

  // Password change screen
  if (mustChangePassword) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-full max-w-sm mx-4">
          <div className="text-center mb-8">
            <UmbrellaIcon className="w-16 h-16 text-purple-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-slate-100">Change Password</h1>
            <p className="text-slate-400 text-sm mt-2">
              Your administrator requires you to set a new password on first login.
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
            {displayError && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-lg px-3 py-2">
                {displayError}
              </div>
            )}

            <div>
              <label className="block text-xs text-slate-400 mb-1.5 font-medium">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setLocalError(''); }}
                className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none"
                placeholder="Minimum 8 characters"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5 font-medium">Confirm New Password</label>
              <input
                type="password"
                value={confirmNewPassword}
                onChange={(e) => { setConfirmNewPassword(e.target.value); setLocalError(''); }}
                className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none"
                placeholder="Repeat new password"
              />
            </div>

            <button
              type="button"
              onClick={handlePasswordChange}
              className="w-full py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-semibold text-sm transition-colors"
            >
              Set New Password
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Tenant selection screen (when user belongs to multiple tenants)
  if (pendingTenantSelection.length > 0) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-full max-w-sm mx-4">
          <div className="text-center mb-8">
            <UmbrellaIcon className="w-16 h-16 text-purple-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Mary Poppins</h1>
            <p className="text-slate-400 text-xs mt-1">Digital Intelligence Platform</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-slate-200 text-center mb-1">Select Tenant</h2>
            <p className="text-xs text-slate-500 text-center mb-5">Your account is registered in multiple tenants. Choose which one to access.</p>

            <div className="space-y-2">
              {pendingTenantSelection.map((cred) => (
                <button
                  key={cred.tenantId}
                  type="button"
                  onClick={() => loginWithTenant(cred)}
                  className="w-full p-3 bg-slate-800/70 border border-slate-700 rounded-lg text-left hover:border-violet-500/50 hover:bg-slate-800 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-violet-600/20 border border-violet-500/30 flex items-center justify-center shrink-0">
                      <svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-200 group-hover:text-white truncate">{cred.tenantName}</p>
                      <p className="text-[10px] text-slate-500 truncate">{cred.role} &middot; {cred.tenantId}</p>
                    </div>
                    <svg className="w-4 h-4 text-slate-600 group-hover:text-violet-400 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={clearPendingTenantSelection}
              className="w-full mt-4 py-2 text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              Back to login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="w-full max-w-sm mx-4">
        {/* Branding */}
        <div className="text-center mb-8">
          <UmbrellaIcon className="w-16 h-16 text-purple-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Mary Poppins</h1>
          <p className="text-slate-400 text-xs mt-1">Digital Intelligence Platform</p>
        </div>

        {/* Login form */}
        <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-200 text-center mb-2">Sign in to your account</h2>

          {displayError && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-lg px-3 py-2">
              {displayError}
            </div>
          )}

          <div>
            <label className="block text-xs text-slate-400 mb-1.5 font-medium">Email or Username</label>
            <input
              type="text"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setLocalError(''); }}
              className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 text-sm placeholder-slate-500 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition-colors"
              placeholder="admin"
              autoComplete="username"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5 font-medium">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setLocalError(''); }}
                className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 text-sm placeholder-slate-500 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition-colors pr-10"
                placeholder="admin_dev"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                tabIndex={-1}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  {showPassword ? (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                  ) : (
                    <>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                    </>
                  )}
                </svg>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5 font-medium">
              Tenant <span className="text-slate-600 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={tenant}
              onChange={(e) => { setTenant(e.target.value); setLocalError(''); }}
              className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 text-sm placeholder-slate-500 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition-colors"
              placeholder="e.g. fbi, demo, nca"
              autoComplete="organization"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || isSubmitting}
            className="w-full py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading || isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Authenticating...
              </span>
            ) : (
              'Sign In'
            )}
          </button>

          <div className="relative my-3">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-700/50" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-2 bg-slate-900 text-slate-500">or</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => login()}
            className="w-full py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-medium text-sm transition-colors"
          >
            Sign In with SSO (Keycloak)
          </button>
        </form>

        {/* Built-in test accounts */}
        <div className="mt-4 bg-slate-900/60 border border-slate-800 rounded-lg p-3">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-2">Test Accounts</p>
          <div className="space-y-1">
            {[
              { label: 'Admin', email: 'admin', pwd: 'admin_dev' },
              { label: 'Investigator', email: 'investigator@mp.local', pwd: 'investigator' },
              { label: 'Analyst', email: 'analyst@mp.local', pwd: 'analyst' },
              { label: 'Viewer', email: 'viewer@mp.local', pwd: 'viewer' },
            ].map((acc) => (
              <button
                key={acc.email}
                type="button"
                onClick={() => { setEmail(acc.email); setPassword(acc.pwd); }}
                className="w-full flex items-center justify-between px-2 py-1 rounded text-[11px] hover:bg-slate-800 transition-colors group"
              >
                <span className="text-slate-400 group-hover:text-slate-200">{acc.label}</span>
                <span className="font-mono text-slate-600 group-hover:text-slate-400">
                  {acc.email} / {acc.pwd}
                </span>
              </button>
            ))}
          </div>
          <p className="text-[10px] text-slate-600 mt-2 border-t border-slate-800 pt-2">
            Users created in Settings also work in the same browser session.
          </p>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  App Component                                                     */
/* ------------------------------------------------------------------ */

const App: FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <AuthProvider>
            <ToastProvider>
              <SocketProvider>
                <Routes>
                  {/* Public route */}
                  <Route path="/login" element={<LoginPage />} />

                  {/* Protected layout */}
                  <Route element={<MainLayout />}>
                    {/* Dashboard */}
                    <Route
                      index
                      element={
                        <ProtectedRoute roles={['admin', 'analyst', 'investigator', 'viewer']}>
                          <Dashboard />
                        </ProtectedRoute>
                      }
                    />

                    {/* Cases */}
                    <Route
                      path="cases/*"
                      element={
                        <ProtectedRoute roles={['admin', 'analyst', 'investigator']}>
                          <Cases />
                        </ProtectedRoute>
                      }
                    />

                    {/* Investigations (Graph Workspace) */}
                    <Route
                      path="investigations/*"
                      element={
                        <ProtectedRoute roles={['admin', 'analyst', 'investigator']}>
                          <Investigations />
                        </ProtectedRoute>
                      }
                    />

                    {/* OSINT */}
                    <Route
                      path="osint/*"
                      element={
                        <ProtectedRoute roles={['admin', 'analyst', 'investigator']}>
                          <OSINT />
                        </ProtectedRoute>
                      }
                    />

                    {/* Crypto Tracer */}
                    <Route
                      path="crypto-tracer/*"
                      element={
                        <ProtectedRoute roles={['admin', 'analyst', 'investigator']}>
                          <CryptoTracer />
                        </ProtectedRoute>
                      }
                    />

                    {/* Dark Web Monitor */}
                    <Route
                      path="dark-web/*"
                      element={
                        <ProtectedRoute roles={['admin', 'analyst']}>
                          <DarkWebMonitor />
                        </ProtectedRoute>
                      }
                    />

                    {/* Content Analysis */}
                    <Route
                      path="content-analysis/*"
                      element={
                        <ProtectedRoute roles={['admin', 'analyst']}>
                          <ContentAnalysis />
                        </ProtectedRoute>
                      }
                    />

                    {/* Alerts */}
                    <Route
                      path="alerts/*"
                      element={
                        <ProtectedRoute roles={['admin', 'analyst', 'investigator', 'viewer']}>
                          <Alerts />
                        </ProtectedRoute>
                      }
                    />

                    {/* Settings */}
                    <Route
                      path="settings/*"
                      element={
                        <ProtectedRoute roles={['admin']}>
                          <Settings />
                        </ProtectedRoute>
                      }
                    />

                    {/* Audit Log */}
                    <Route
                      path="audit-log/*"
                      element={
                        <ProtectedRoute roles={['admin']}>
                          <AuditLog />
                        </ProtectedRoute>
                      }
                    />

                    {/* Catch-all: 404 */}
                    <Route
                      path="*"
                      element={
                        <div className="flex items-center justify-center h-64">
                          <div className="text-center">
                            <div className="text-6xl font-bold text-slate-700 mb-2">404</div>
                            <p className="text-slate-400 text-sm">Page not found</p>
                            <Link to="/" className="mt-4 inline-block text-teal-400 hover:text-teal-300 text-sm">
                              Return to Dashboard
                            </Link>
                          </div>
                        </div>
                      }
                    />
                  </Route>
                </Routes>
              </SocketProvider>
            </ToastProvider>
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;

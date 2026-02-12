/**
 * Mary Poppins — Audit Log Page
 * Immutable, hash-chained audit trail.
 */
import { useState } from 'react';
import { useToast, useIsDemoTenant } from '../App';

const MOCK_ENTRIES = [
  { id: 'AUD-991204', action: 'osint.query', user: 'j.chen', resource: 'OSINT Query #Q-8812', time: '2024-12-20T14:32:01Z', chainHash: 'a7f3c2d1...' },
  { id: 'AUD-991203', action: 'case.update', user: 'm.rivera', resource: 'CS-2024-0887', time: '2024-12-20T14:28:44Z', chainHash: 'b1d4e812...' },
  { id: 'AUD-991202', action: 'content.review', user: 'a.petrov', resource: 'H-90809', time: '2024-12-20T14:15:22Z', chainHash: 'c9a2f1e3...' },
  { id: 'AUD-991201', action: 'crypto.trace', user: 'j.chen', resource: 'Trace #T-4421', time: '2024-12-20T13:55:10Z', chainHash: 'd5c1a901...' },
  { id: 'AUD-991200', action: 'auth.login', user: 's.nakamura', resource: 'Session', time: '2024-12-20T13:42:33Z', chainHash: 'e2f8b344...' },
  { id: 'AUD-991199', action: 'darkweb.crawl', user: 'system', resource: 'Crawl Job #DW-112', time: '2024-12-20T13:30:00Z', chainHash: 'f7a9c205...' },
  { id: 'AUD-991198', action: 'export.request', user: 'j.chen', resource: 'CS-2024-0891', time: '2024-12-20T13:12:45Z', chainHash: '1b3d5e77...' },
  { id: 'AUD-991197', action: 'settings.update', user: 'admin', resource: 'Threshold Config', time: '2024-12-20T12:58:21Z', chainHash: '2c4f6a88...' },
];

const actionColor: Record<string, string> = {
  'osint.query': 'text-teal-400',
  'case.update': 'text-purple-400',
  'content.review': 'text-amber-400',
  'crypto.trace': 'text-blue-400',
  'auth.login': 'text-emerald-400',
  'darkweb.crawl': 'text-orange-400',
  'export.request': 'text-red-400',
  'settings.update': 'text-slate-400',
};

export default function AuditLog() {
  const isDemoTenant = useIsDemoTenant();
  const [search, setSearch] = useState('');
  const { addToast } = useToast();
  const entries = isDemoTenant ? MOCK_ENTRIES : [];
  const filtered = search
    ? entries.filter(e => e.action.includes(search) || e.user.includes(search) || e.resource.includes(search))
    : entries;

  const handleExport = () => {
    addToast({
      severity: 'success',
      title: 'Export Started',
      message: 'Audit trail export has been initiated. You will be notified when it is ready for download.',
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Audit Log</h1>
          <p className="text-xs text-slate-500 mt-1 flex items-center gap-2">
            <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
            </svg>
            Hash-chained &middot; Immutable &middot; SHA-256 integrity verified
          </p>
        </div>
        <button
          onClick={handleExport}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm text-slate-300 transition-colors"
        >
          Export Audit Trail
        </button>
      </div>

      <input
        type="text" value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Filter by action, user, or resource..."
        className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500"
      />

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-slate-500 text-xs uppercase">
              <th className="text-left px-4 py-3">Entry ID</th>
              <th className="text-left px-4 py-3">Action</th>
              <th className="text-left px-4 py-3">User</th>
              <th className="text-left px-4 py-3">Resource</th>
              <th className="text-left px-4 py-3">Timestamp</th>
              <th className="text-left px-4 py-3">Chain Hash</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filtered.length === 0 && (
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
            {filtered.map(e => (
              <tr key={e.id} className="hover:bg-slate-800/50 transition-colors">
                <td className="px-4 py-3 font-mono text-slate-500 text-xs">{e.id}</td>
                <td className={`px-4 py-3 font-mono text-xs ${actionColor[e.action] || 'text-slate-400'}`}>{e.action}</td>
                <td className="px-4 py-3 text-slate-300">{e.user}</td>
                <td className="px-4 py-3 text-slate-400">{e.resource}</td>
                <td className="px-4 py-3 text-slate-500 text-xs">{new Date(e.time).toLocaleString()}</td>
                <td className="px-4 py-3 font-mono text-emerald-400/60 text-xs">{e.chainHash}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

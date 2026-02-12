/**
 * Mary Poppins — Alerts Page
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast, useIsDemoTenant } from '../App';
import Modal from '../components/common/Modal';

interface AlertItem {
  id: string;
  severity: string;
  title: string;
  source: string;
  time: string;
  read: boolean;
  caseId: string | null;
  status: 'open' | 'acknowledged' | 'dismissed';
}

const INITIAL_ALERTS: AlertItem[] = [
  { id: 'ALT-4521', severity: 'critical', title: 'CSAM hash match detected — NCMEC DB', source: 'Hash Scanner', time: '2 min ago', read: false, caseId: 'CS-2024-0891', status: 'open' },
  { id: 'ALT-4520', severity: 'critical', title: 'Classifier confidence 0.97 on submission H-90812', source: 'AI Classifier', time: '3 min ago', read: false, caseId: null, status: 'open' },
  { id: 'ALT-4519', severity: 'high', title: 'New dark web forum post matching keywords', source: 'Dark Web Crawler', time: '12 min ago', read: false, caseId: 'CS-2024-0891', status: 'open' },
  { id: 'ALT-4518', severity: 'high', title: 'Suspicious crypto transaction cluster detected', source: 'Crypto Tracer', time: '25 min ago', read: true, caseId: 'CS-2024-0887', status: 'acknowledged' },
  { id: 'ALT-4517', severity: 'medium', title: 'OSINT: 3 new breach records for target entity', source: 'OSINT Worker', time: '1 hour ago', read: true, caseId: null, status: 'acknowledged' },
  { id: 'ALT-4516', severity: 'medium', title: 'Grooming pattern score elevated (stage 3)', source: 'NLP Grooming', time: '1.5 hours ago', read: true, caseId: 'CS-2024-0865', status: 'open' },
  { id: 'ALT-4515', severity: 'low', title: 'Scheduled scan completed — 0 new matches', source: 'Hash Scanner', time: '2 hours ago', read: true, caseId: null, status: 'acknowledged' },
  { id: 'ALT-4514', severity: 'info', title: 'System maintenance window in 4 hours', source: 'System', time: '3 hours ago', read: true, caseId: null, status: 'acknowledged' },
];

const sevColor: Record<string, string> = {
  critical: 'border-l-red-500 bg-red-500/5',
  high: 'border-l-orange-500 bg-orange-500/5',
  medium: 'border-l-amber-500 bg-amber-500/5',
  low: 'border-l-blue-400 bg-blue-400/5',
  info: 'border-l-slate-500 bg-slate-500/5',
};
const sevText: Record<string, string> = { critical: 'text-red-400', high: 'text-orange-400', medium: 'text-amber-400', low: 'text-blue-400', info: 'text-slate-400' };

export default function Alerts() {
  const isDemoTenant = useIsDemoTenant();
  const [filter, setFilter] = useState('all');
  const [alerts, setAlerts] = useState<AlertItem[]>(isDemoTenant ? INITIAL_ALERTS : []);
  const [selectedAlert, setSelectedAlert] = useState<AlertItem | null>(null);
  const navigate = useNavigate();
  const { addToast } = useToast();

  const filtered = filter === 'all' ? alerts : alerts.filter(a => a.severity === filter);

  const handleAcknowledge = (id: string) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, read: true, status: 'acknowledged' as const } : a));
    addToast({ severity: 'success', title: 'Alert Acknowledged', message: `${id} has been acknowledged` });
  };

  const handleDismiss = (id: string) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, read: true, status: 'dismissed' as const } : a));
    addToast({ severity: 'info', title: 'Alert Dismissed', message: `${id} has been dismissed` });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-100">Alerts</h1>
        <span className="text-xs text-slate-500">{alerts.filter(a => !a.read).length} unread</span>
      </div>

      <div className="flex gap-2">
        {['all', 'critical', 'high', 'medium', 'low', 'info'].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${filter === s ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
            {s}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <svg className="w-16 h-16 text-slate-700 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <h3 className="text-lg font-semibold text-slate-400 mb-2">Empty Workspace</h3>
            <p className="text-sm text-slate-500 max-w-md">This tenant has no data yet. Start creating cases and investigations to populate this view.</p>
          </div>
        )}
        {filtered.map(a => (
          <div
            key={a.id}
            onClick={() => setSelectedAlert(a)}
            className={`border-l-4 rounded-r-xl p-4 cursor-pointer ${sevColor[a.severity]} ${!a.read ? 'ring-1 ring-slate-700' : ''} hover:brightness-110 transition-all`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-bold uppercase ${sevText[a.severity]}`}>{a.severity}</span>
                  <span className="text-xs text-slate-600">{a.id}</span>
                  {a.caseId && <span className="text-[10px] font-mono text-teal-400 bg-teal-500/10 px-1.5 py-0.5 rounded">{a.caseId}</span>}
                  {a.status === 'acknowledged' && <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">ACK</span>}
                  {a.status === 'dismissed' && <span className="text-[10px] text-slate-400 bg-slate-500/10 px-1.5 py-0.5 rounded">DISMISSED</span>}
                </div>
                <p className="text-sm text-slate-200">{a.title}</p>
                <p className="text-xs text-slate-500 mt-1">{a.source} &middot; {a.time}</p>
              </div>
              <div className="flex items-center gap-2 ml-4" onClick={e => e.stopPropagation()}>
                {a.status === 'open' && (
                  <button onClick={() => handleAcknowledge(a.id)} className="text-xs text-teal-400 hover:text-teal-300 px-2 py-1 rounded bg-teal-500/10 hover:bg-teal-500/20 transition-colors">
                    Acknowledge
                  </button>
                )}
                {a.caseId && (
                  <button onClick={() => navigate(`/cases/${a.caseId}`)} className="text-xs text-purple-400 hover:text-purple-300 px-2 py-1 rounded bg-purple-500/10 hover:bg-purple-500/20 transition-colors">
                    View Case
                  </button>
                )}
                {a.status !== 'dismissed' && (
                  <button onClick={() => handleDismiss(a.id)} className="text-xs text-slate-400 hover:text-slate-300 px-2 py-1 rounded bg-slate-500/10 hover:bg-slate-500/20 transition-colors">
                    Dismiss
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <Modal isOpen={!!selectedAlert} onClose={() => setSelectedAlert(null)} title={`Alert ${selectedAlert?.id ?? ''}`} size="lg">
        {selectedAlert && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className={`text-xs font-bold uppercase px-2 py-1 rounded ${sevText[selectedAlert.severity]} bg-slate-800`}>{selectedAlert.severity}</span>
              <span className="text-xs text-slate-500">Status: {selectedAlert.status}</span>
            </div>
            <h3 className="text-lg text-slate-100">{selectedAlert.title}</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-slate-500">Source:</span> <span className="text-slate-300 ml-2">{selectedAlert.source}</span></div>
              <div><span className="text-slate-500">Time:</span> <span className="text-slate-300 ml-2">{selectedAlert.time}</span></div>
              {selectedAlert.caseId && (
                <div><span className="text-slate-500">Linked Case:</span> <span className="text-teal-400 ml-2 font-mono">{selectedAlert.caseId}</span></div>
              )}
            </div>
            <div className="flex gap-2 pt-4 border-t border-slate-800">
              {selectedAlert.status === 'open' && (
                <button onClick={() => { handleAcknowledge(selectedAlert.id); setSelectedAlert(null); }} className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-sm transition-colors">
                  Acknowledge
                </button>
              )}
              {selectedAlert.caseId && (
                <button onClick={() => { setSelectedAlert(null); navigate(`/cases/${selectedAlert.caseId}`); }} className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm transition-colors">
                  Go to Case
                </button>
              )}
              {selectedAlert.status !== 'dismissed' && (
                <button onClick={() => { handleDismiss(selectedAlert.id); setSelectedAlert(null); }} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm transition-colors">
                  Dismiss
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

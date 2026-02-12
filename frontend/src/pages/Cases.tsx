/**
 * Mary Poppins — Cases Page
 * Case management with list view, detail view, and creation modal.
 */
import { useState } from 'react';
import { Routes, Route, useNavigate, useParams, Link } from 'react-router-dom';
import { useToast, useIsDemoTenant } from '../App';
import Modal from '../components/common/Modal';

interface CaseItem {
  id: string;
  title: string;
  status: 'active' | 'review' | 'closed';
  priority: 'critical' | 'high' | 'medium' | 'low';
  assignee: string;
  entities: number;
  created: string;
  description: string;
  tags: string[];
}

const MOCK_CASES: CaseItem[] = [
  { id: 'CS-2024-0900', title: 'Operation Lolita Express', status: 'active', priority: 'critical', assignee: 'J. Chen', entities: 156, created: '2024-01-15', description: 'Multi-jurisdictional investigation into trafficking network linked to Jeffrey Epstein. Graph analysis of financial flows through shell companies (Southern Trust, JEGE LLC), travel records via private aviation (N908JE), property connections (NYC, Palm Beach, USVI, Paris), and communication patterns. 156 entities mapped across 4 countries. Community detection identified 6 distinct sub-networks including financial intermediaries, recruitment networks, and property management.', tags: ['trafficking', 'financial', 'osint', 'crypto', 'international'] },
  { id: 'CS-2024-0891', title: 'Operation Darklight', status: 'active', priority: 'critical', assignee: 'J. Chen', entities: 47, created: '2024-12-15', description: 'Multi-national operation targeting CSAM distribution network across Tor hidden services. Links to cryptocurrency laundering through mixing services.', tags: ['csam', 'darkweb', 'crypto'] },
  { id: 'CS-2024-0887', title: 'Financial Network Alpha', status: 'active', priority: 'high', assignee: 'M. Rivera', entities: 23, created: '2024-12-10', description: 'Cryptocurrency transaction cluster analysis revealing coordinated wallet activity across multiple exchanges.', tags: ['crypto', 'financial'] },
  { id: 'CS-2024-0876', title: 'Cross-Border Ring', status: 'review', priority: 'high', assignee: 'A. Petrov', entities: 112, created: '2024-12-01', description: 'Large-scale cross-border investigation involving entities across 7 jurisdictions. Pending review by lead investigator.', tags: ['international', 'csam', 'osint'] },
  { id: 'CS-2024-0865', title: 'Forum Takedown Bravo', status: 'active', priority: 'medium', assignee: 'S. Nakamura', entities: 18, created: '2024-11-28', description: 'Monitoring and evidence collection for dark web forum takedown operation.', tags: ['darkweb', 'forum'] },
  { id: 'CS-2024-0854', title: 'Wallet Cluster Investigation', status: 'closed', priority: 'medium', assignee: 'J. Chen', entities: 34, created: '2024-11-20', description: 'Bitcoin wallet cluster analysis completed. 34 entities linked to suspected tumbler service.', tags: ['crypto', 'bitcoin'] },
  { id: 'CS-2024-0843', title: 'Platform Sweep Echo', status: 'closed', priority: 'low', assignee: 'L. Okafor', entities: 8, created: '2024-11-15', description: 'Routine platform sweep for policy-violating content. No actionable findings.', tags: ['routine', 'content'] },
];

const statusColor: Record<string, string> = { active: 'bg-emerald-500', review: 'bg-amber-500', closed: 'bg-slate-500' };
const priorityColor: Record<string, string> = { critical: 'text-red-400', high: 'text-orange-400', medium: 'text-amber-400', low: 'text-slate-400' };

/* ------------------------------------------------------------------ */
/*  Epstein Case — Key Investigation Milestones                        */
/* ------------------------------------------------------------------ */
const EPSTEIN_MILESTONES = [
  { time: '2024-01-20', action: 'Financial subpoena served to JP Morgan Chase — account records obtained for 2000-2019', user: 'J. Chen' },
  { time: '2024-02-03', action: 'Flight log analysis complete — 73 flights catalogued, 46 unique passengers identified', user: 'J. Chen' },
  { time: '2024-02-18', action: 'Shell company network mapped — 12 entities across 3 jurisdictions (USVI, NM, FL)', user: 'M. Rivera' },
  { time: '2024-03-05', action: 'Property ownership chain verified — 7 properties linked through trust structures', user: 'A. Petrov' },
  { time: '2024-03-22', action: 'Crypto wallet cluster identified — 4 BTC wallets linked to foundation accounts', user: 'J. Chen' },
  { time: '2024-04-10', action: 'Dark web forum monitoring initiated — 3 .onion services under surveillance', user: 'S. Nakamura' },
  { time: '2024-04-28', action: 'NCMEC hash database cross-reference — 847 matches against seized device inventory', user: 'L. Okafor' },
  { time: '2024-05-15', action: 'Witness cooperation agreements finalized — 3 cooperating witnesses', user: 'J. Chen' },
];

const EPSTEIN_NETWORK_SUMMARY = [
  { label: 'Persons of Interest', value: '23' },
  { label: 'Shell Companies', value: '12' },
  { label: 'Properties', value: '7' },
  { label: 'Financial Accounts', value: '15' },
  { label: 'Aircraft', value: '3' },
  { label: 'Countries', value: '4 (US, UK, France, USVI)' },
];

/* ------------------------------------------------------------------ */
/*  Case Detail View                                                   */
/* ------------------------------------------------------------------ */
function CaseDetail() {
  const { caseId } = useParams<{ caseId: string }>();
  const c = MOCK_CASES.find(c => c.id === caseId);
  const { addToast } = useToast();

  if (!c) {
    return (
      <div className="text-center py-16">
        <div className="text-4xl text-slate-700 mb-2">404</div>
        <p className="text-slate-400">Case not found</p>
        <Link to="/cases" className="text-teal-400 hover:text-teal-300 text-sm mt-4 inline-block">Back to Cases</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/cases" className="text-slate-400 hover:text-slate-200 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
            </svg>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-100">{c.title}</h1>
            <span className="text-sm font-mono text-teal-400">{c.id}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center gap-1.5 text-xs capitalize px-2 py-1 rounded bg-slate-800`}>
            <span className={`w-2 h-2 rounded-full ${statusColor[c.status]}`} />{c.status}
          </span>
          <span className={`text-xs font-semibold uppercase ${priorityColor[c.priority]}`}>{c.priority}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="col-span-2 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-slate-300 mb-3">Description</h2>
            <p className="text-sm text-slate-400 leading-relaxed">{c.description}</p>
            <div className="flex gap-2 mt-4">
              {c.tags.map(t => (
                <span key={t} className="text-[10px] font-mono text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded">{t}</span>
              ))}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-slate-300 mb-3">Timeline</h2>
            <div className="space-y-4">
              {[
                { time: '2 hours ago', action: 'New OSINT finding linked', user: c.assignee },
                { time: '5 hours ago', action: 'Crypto trace completed — 3 new wallets', user: c.assignee },
                { time: '1 day ago', action: 'Case status updated to ' + c.status, user: 'System' },
                { time: c.created, action: 'Case created', user: c.assignee },
              ].map((e, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-purple-500 mt-1.5 shrink-0" />
                  <div>
                    <p className="text-sm text-slate-300">{e.action}</p>
                    <p className="text-xs text-slate-600">{e.user} &middot; {e.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Epstein Case — Key Investigation Milestones */}
          {c.id === 'CS-2024-0900' && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <h2 className="text-sm font-semibold text-slate-300 mb-3">Key Investigation Milestones</h2>
              <div className="space-y-4">
                {EPSTEIN_MILESTONES.map((e, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full bg-teal-500 mt-1.5 shrink-0" />
                    <div>
                      <p className="text-sm text-slate-300">{e.action}</p>
                      <p className="text-xs text-slate-600">{e.user} &middot; {e.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <h3 className="text-xs text-slate-500 uppercase mb-3">Details</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Assignee</span><span className="text-slate-300">{c.assignee}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Entities</span><span className="text-slate-300">{c.entities}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Created</span><span className="text-slate-300">{c.created}</span></div>
            </div>
          </div>

          {/* Epstein Case — Network Summary */}
          {c.id === 'CS-2024-0900' && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <h3 className="text-xs text-slate-500 uppercase mb-3">Network Summary</h3>
              <div className="space-y-3 text-sm">
                {EPSTEIN_NETWORK_SUMMARY.map((item, i) => (
                  <div key={i} className="flex justify-between">
                    <span className="text-slate-500">{item.label}</span>
                    <span className="text-slate-300">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <h3 className="text-xs text-slate-500 uppercase mb-3">Actions</h3>
            <div className="space-y-2">
              <button onClick={() => addToast({ severity: 'info', title: 'Opening graph workspace...', message: `Investigation for ${c.id}` })} className="w-full px-3 py-2 text-xs text-left bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors">
                Open in Graph Workspace
              </button>
              <button onClick={() => addToast({ severity: 'info', title: 'Running OSINT search...', message: `Querying all modules for ${c.id}` })} className="w-full px-3 py-2 text-xs text-left bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors">
                Run OSINT Search
              </button>
              <button onClick={() => addToast({ severity: 'info', title: 'Starting crypto trace...', message: `Tracing wallets for ${c.id}` })} className="w-full px-3 py-2 text-xs text-left bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors">
                Trace Crypto Wallets
              </button>
              <button onClick={() => addToast({ severity: 'warning', title: 'Export Requested', message: 'Dual authorization required for data export' })} className="w-full px-3 py-2 text-xs text-left bg-slate-800 hover:bg-slate-700 text-red-400 rounded-lg transition-colors">
                Export Evidence
              </button>
              {/* Epstein Case — Additional Actions */}
              {c.id === 'CS-2024-0900' && (
                <>
                  <button onClick={() => addToast({ severity: 'info', title: 'Opening Epstein Network Analysis...', message: `Loading graph for ${c.id}` })} className="w-full px-3 py-2 text-xs text-left bg-purple-900/40 hover:bg-purple-800/50 text-purple-300 rounded-lg transition-colors">
                    View Epstein Graph
                  </button>
                  <button onClick={() => addToast({ severity: 'info', title: 'Generating NCMEC Report...', message: `Compiling report for ${c.id}` })} className="w-full px-3 py-2 text-xs text-left bg-purple-900/40 hover:bg-purple-800/50 text-purple-300 rounded-lg transition-colors">
                    Export NCMEC Report
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Case List View                                                     */
/* ------------------------------------------------------------------ */
function CaseList() {
  const isDemoTenant = useIsDemoTenant();
  const [cases, setCases] = useState<CaseItem[]>(() => isDemoTenant ? MOCK_CASES : []);
  const [filter, setFilter] = useState('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCaseTitle, setNewCaseTitle] = useState('');
  const [newCasePriority, setNewCasePriority] = useState<CaseItem['priority']>('medium');
  const [newCaseAssignee, setNewCaseAssignee] = useState('J. Chen');
  const [newCaseDescription, setNewCaseDescription] = useState('');
  const [newCaseTags, setNewCaseTags] = useState('');
  const navigate = useNavigate();
  const { addToast } = useToast();
  const filtered = filter === 'all' ? cases : cases.filter(c => c.status === filter);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-100">Cases</h1>
        <button onClick={() => setShowCreateModal(true)} className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-sm font-medium text-white transition-colors">
          + New Case
        </button>
      </div>

      <div className="flex gap-2">
        {['all', 'active', 'review', 'closed'].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${filter === s ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
            {s}
          </button>
        ))}
      </div>

      {cases.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <svg className="w-16 h-16 text-slate-700 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0" />
          </svg>
          <h3 className="text-lg font-semibold text-slate-400 mb-2">No Cases Yet</h3>
          <p className="text-sm text-slate-500 max-w-md">Create your first case to get started with investigations.</p>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-slate-500 text-xs uppercase">
                <th className="text-left px-4 py-3">Case ID</th>
                <th className="text-left px-4 py-3">Title</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Priority</th>
                <th className="text-left px-4 py-3">Assignee</th>
                <th className="text-right px-4 py-3">Entities</th>
                <th className="text-left px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filtered.map(c => (
                <tr key={c.id} className="hover:bg-slate-800/50 transition-colors cursor-pointer" onClick={() => navigate(`/cases/${c.id}`)}>
                  <td className="px-4 py-3 font-mono text-teal-400">{c.id}</td>
                  <td className="px-4 py-3 text-slate-200 font-medium">{c.title}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-xs capitalize">
                      <span className={`w-2 h-2 rounded-full ${statusColor[c.status]}`} />{c.status}
                    </span>
                  </td>
                  <td className={`px-4 py-3 text-xs font-semibold uppercase ${priorityColor[c.priority]}`}>{c.priority}</td>
                  <td className="px-4 py-3 text-slate-400">{c.assignee}</td>
                  <td className="px-4 py-3 text-right text-slate-400">{c.entities}</td>
                  <td className="px-4 py-3 text-slate-500">{c.created}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Case Modal */}
      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Create New Case" size="lg">
        <form onSubmit={e => {
          e.preventDefault();
          const newCase: CaseItem = {
            id: `CS-2025-${String(Math.floor(1000 + Math.random() * 9000))}`,
            title: newCaseTitle,
            status: 'active',
            priority: newCasePriority,
            assignee: newCaseAssignee,
            entities: 0,
            created: 'Just now',
            description: newCaseDescription,
            tags: newCaseTags.split(',').map(t => t.trim()).filter(Boolean),
          };
          setCases(prev => [newCase, ...prev]);
          setNewCaseTitle('');
          setNewCasePriority('medium');
          setNewCaseAssignee('J. Chen');
          setNewCaseDescription('');
          setNewCaseTags('');
          setShowCreateModal(false);
          addToast({ severity: 'success', title: 'Case Created', message: `${newCase.id} — ${newCase.title}` });
        }} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-300 mb-1">Case Title</label>
            <input type="text" required placeholder="e.g., Operation Nightfall" value={newCaseTitle} onChange={e => setNewCaseTitle(e.target.value)} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-300 mb-1">Priority</label>
              <select value={newCasePriority} onChange={e => setNewCasePriority(e.target.value as CaseItem['priority'])} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-purple-500">
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1">Assignee</label>
              <select value={newCaseAssignee} onChange={e => setNewCaseAssignee(e.target.value)} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-purple-500">
                <option>J. Chen</option>
                <option>M. Rivera</option>
                <option>A. Petrov</option>
                <option>S. Nakamura</option>
                <option>L. Okafor</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">Description</label>
            <textarea rows={4} placeholder="Describe the case objectives and scope..." value={newCaseDescription} onChange={e => setNewCaseDescription(e.target.value)} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500 resize-none" />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">Tags (comma-separated)</label>
            <input type="text" placeholder="csam, crypto, darkweb" value={newCaseTags} onChange={e => setNewCaseTags(e.target.value)} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500" />
          </div>
          <div className="flex gap-2 pt-4 border-t border-slate-800">
            <button type="submit" className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-medium transition-colors">
              Create Case
            </button>
            <button type="button" onClick={() => setShowCreateModal(false)} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm transition-colors">
              Cancel
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Router                                                             */
/* ------------------------------------------------------------------ */
export default function Cases() {
  return (
    <Routes>
      <Route index element={<CaseList />} />
      <Route path=":caseId" element={<CaseDetail />} />
    </Routes>
  );
}

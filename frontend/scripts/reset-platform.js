/**
 * Mary Poppins — Platform Reset Script
 *
 * Resets localStorage to a clean state, preserving ONLY:
 *   - tenant-demo   (Mary Poppins Demo)
 *   - tenant-empty   (New Investigation Unit)
 *
 * Usage: paste this entire script into the browser console (F12 → Console)
 *        while the app is open, then reload the page.
 */
(() => {
  'use strict';

  const KEEP_TENANTS = ['tenant-demo', 'tenant-empty'];

  // ── 1. Tenants list ─────────────────────────────────────────────
  const tenantsRaw = localStorage.getItem('mp-tenants');
  if (tenantsRaw) {
    try {
      const tenants = JSON.parse(tenantsRaw);
      const kept = tenants.filter(t => KEEP_TENANTS.includes(t.id));
      localStorage.setItem('mp-tenants', JSON.stringify(kept));
      console.log(`[reset] mp-tenants: kept ${kept.length}, removed ${tenants.length - kept.length}`);
    } catch { console.warn('[reset] mp-tenants: parse error, clearing'); localStorage.removeItem('mp-tenants'); }
  }

  // ── 2. Tenant-user assignments ──────────────────────────────────
  const tuRaw = localStorage.getItem('mp-tenant-users');
  if (tuRaw) {
    try {
      const users = JSON.parse(tuRaw);
      const kept = users.filter(u => KEEP_TENANTS.includes(u.tenant));
      localStorage.setItem('mp-tenant-users', JSON.stringify(kept));
      console.log(`[reset] mp-tenant-users: kept ${kept.length}, removed ${users.length - kept.length}`);
    } catch { console.warn('[reset] mp-tenant-users: parse error, clearing'); localStorage.removeItem('mp-tenant-users'); }
  }

  // ── 3. Platform credentials ─────────────────────────────────────
  const credRaw = localStorage.getItem('mp-platform-users');
  if (credRaw) {
    try {
      const creds = JSON.parse(credRaw);
      const kept = creds.filter(c => KEEP_TENANTS.includes(c.tenantId));
      localStorage.setItem('mp-platform-users', JSON.stringify(kept));
      console.log(`[reset] mp-platform-users: kept ${kept.length}, removed ${creds.length - kept.length}`);
    } catch { console.warn('[reset] mp-platform-users: parse error, clearing'); localStorage.removeItem('mp-platform-users'); }
  }

  // ── 4. Tenant-prefixed keys (settings, caches, etc.) ───────────
  const keepPrefixes = KEEP_TENANTS.map(id => `mp-${id}`);
  const systemKeys = ['mp-tenants', 'mp-tenant-users', 'mp-platform-users', 'mp-theme', 'mp-must-change-password'];
  let removedKeys = 0;

  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith('mp-')) continue;
    if (systemKeys.includes(key)) continue;
    if (keepPrefixes.some(prefix => key.startsWith(prefix))) continue;
    keysToRemove.push(key);
  }
  keysToRemove.forEach(k => { localStorage.removeItem(k); removedKeys++; });
  if (removedKeys) console.log(`[reset] Removed ${removedKeys} orphan localStorage keys`);

  // ── 5. Transient state ──────────────────────────────────────────
  localStorage.removeItem('mp-pending-tenant-selection');

  // ── Done ────────────────────────────────────────────────────────
  console.log('%c[reset] Platform reset complete. Reload the page (F5).', 'color: #22c55e; font-weight: bold');
  console.log(`        Preserved tenants: ${KEEP_TENANTS.join(', ')}`);
})();

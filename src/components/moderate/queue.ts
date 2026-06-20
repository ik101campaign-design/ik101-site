import { login, getToken, api } from '../../lib/admin-auth';
import type { MessageRow } from '../../lib/voices';

export function nextStatus(action: 'approve' | 'reject'): 'approved' | 'rejected' {
  return action === 'approve' ? 'approved' : 'rejected';
}
export function summarize(row: MessageRow): string {
  return `${row.display_name ?? 'Anonymous'} (${row.country_code}): ${row.message}`;
}

export async function mountModerate(): Promise<void> {
  const gate = document.querySelector<HTMLElement>('[data-auth-gate]');
  const queue = document.querySelector<HTMLElement>('[data-queue]');
  const signInBtn = document.querySelector<HTMLButtonElement>('[data-login-github]');
  const err = document.querySelector<HTMLElement>('[data-login-error]');
  if (!gate || !queue) return;

  signInBtn?.addEventListener('click', async () => {
    try { await login(); await showQueue(); }
    catch { if (err) err.textContent = 'Sign-in failed. Try again.'; }
  });
  if (getToken()) await showQueue();

  async function showQueue() {
    const res = await api('/api/pending');
    if (res.status === 403) { if (err) err.textContent = 'That GitHub account is not authorized.'; return; }
    gate!.hidden = true; queue!.hidden = false;
    const data = res.ok ? ((await res.json()) as MessageRow[]) : [];
    queue!.replaceChildren();
    if (data.length === 0) {
      const empty = document.createElement('p');
      empty.textContent = 'Nothing awaiting review.';
      queue!.appendChild(empty);
      return;
    }
    for (const row of data) {
      const card = document.createElement('div');
      card.style.cssText = 'background:#fff;border:1px solid rgba(20,40,28,0.08);border-radius:14px;padding:14px 16px;margin:10px 0;display:flex;justify-content:space-between;align-items:center;gap:12px;box-shadow:0 2px 10px rgba(20,40,28,0.05);';
      const text = document.createElement('span');
      text.textContent = summarize(row);
      card.appendChild(text);
      const actions = document.createElement('div');
      for (const action of ['approve', 'reject'] as const) {
        const btn = document.createElement('button');
        btn.textContent = action;
        btn.dataset.action = action;
        btn.style.cssText = action === 'approve'
          ? 'margin-left:8px;padding:7px 16px;border:0;border-radius:100px;cursor:pointer;font-weight:600;background:#00bf63;color:#16201b;'
          : 'margin-left:8px;padding:7px 16px;border:1px solid rgba(20,40,28,0.18);border-radius:100px;cursor:pointer;background:transparent;color:#5a6b62;';
        btn.addEventListener('click', async () => {
          const r = await api('/api/moderate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: row.id, action }),
          });
          if (r.ok) card.remove();
        });
        actions.appendChild(btn);
      }
      card.appendChild(actions);
      queue!.appendChild(card);
    }
  }
}

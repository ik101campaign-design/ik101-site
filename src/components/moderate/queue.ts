import { supabase } from '../../lib/supabase';
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
  const emailEl = document.querySelector<HTMLInputElement>('[data-login-email]');
  const pwEl = document.querySelector<HTMLInputElement>('[data-login-password]');
  const err = document.querySelector<HTMLElement>('[data-login-error]');
  if (!gate || !queue) return;

  document.querySelector('[data-login-form]')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({ email: emailEl!.value, password: pwEl!.value });
    if (error && err) err.textContent = error.message; else await showQueue();
  });
  document.querySelector('[data-login-magic-btn]')?.addEventListener('click', async () => {
    const { error } = await supabase.auth.signInWithOtp({ email: emailEl!.value });
    if (err) err.textContent = error ? error.message : 'Check your inbox for the magic link.';
  });

  const { data: session } = await supabase.auth.getSession();
  if (session.session) await showQueue();

  async function showQueue() {
    gate!.hidden = true; queue!.hidden = false;
    const { data } = await supabase.from('messages').select('id,message,display_name,country_code').eq('status', 'pending');
    queue!.replaceChildren();
    if (!data || data.length === 0) {
      const empty = document.createElement('p');
      empty.textContent = 'Nothing awaiting review.';
      queue!.appendChild(empty);
      return;
    }
    for (const row of data as MessageRow[]) {
      const card = document.createElement('div');
      card.style.cssText = 'background:#ffffff;border:1px solid rgba(20,40,28,0.08);border-radius:14px;padding:14px 16px;margin:10px 0;display:flex;justify-content:space-between;align-items:center;gap:12px;box-shadow:0 2px 10px rgba(20,40,28,0.05);';
      const text = document.createElement('span');
      text.textContent = summarize(row);
      card.appendChild(text);
      const actions = document.createElement('div');
      for (const action of ['approve', 'reject'] as const) {
        const btn = document.createElement('button');
        btn.textContent = action;
        btn.dataset.action = action;
        btn.style.cssText = action === 'approve'
          ? 'margin-left:8px;background:#00bf63;color:#16201b;border:0;border-radius:100px;padding:7px 16px;font-weight:600;cursor:pointer;'
          : 'margin-left:8px;background:transparent;border:1px solid rgba(20,40,28,0.18);color:#5a6b62;border-radius:100px;padding:7px 16px;cursor:pointer;';
        btn.addEventListener('click', async () => {
          await supabase.from('messages').update({ status: nextStatus(action) }).eq('id', row.id);
          card.remove();
        });
        actions.appendChild(btn);
      }
      card.appendChild(actions);
      queue!.appendChild(card);
    }
  }
}

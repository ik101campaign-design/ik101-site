import { createGlobe } from './globe';
import { buildSubmission } from './contribution-form';
import { isValidCountryCode } from '../../lib/countries';
import { COUNTRY_CENTROIDS } from '../../lib/countries-data';
import { supabase } from '../../lib/supabase';
import {
  rowToDot, mergeDots, readCache, writeCache, readOptimistic, addOptimistic,
  OPTIMISTIC_KEY, type Dot, type MessageRow,
} from '../../lib/voices';
import { validateSubmission } from '../../lib/validation';
import { containsProfanity } from '../../lib/profanity';

export async function mountHero(): Promise<void> {
  const container = document.querySelector<HTMLElement>('[data-globe]');
  const countEl = document.querySelector<HTMLElement>('[data-voices-count]');
  const cta = document.querySelector<HTMLElement>('[data-globe-cta]');
  if (!container) return;

  const handle = createGlobe(container, (d) => showPopover(container, d));

  let approved: Dot[] = readCache();
  const optimistic: Dot[] = readOptimistic();
  const render = (newestId?: string) => {
    const all = mergeDots(approved, optimistic);
    handle.setDots(all, newestId);
    if (countEl) countEl.textContent = String(approved.length);
  };
  render();

  const { data } = await supabase.from('messages').select('id,message,display_name,country_code').eq('status', 'approved');
  approved = (data ?? []).map((r) => rowToDot(r as MessageRow, false)).filter(Boolean) as Dot[];
  writeCache(approved);
  const approvedKeys = new Set(approved.map((d) => d.message + '|' + d.country));
  const kept = optimistic.filter((d) => !approvedKeys.has(d.message + '|' + d.country));
  if (kept.length !== optimistic.length) {
    optimistic.length = 0;
    optimistic.push(...kept);
    localStorage.setItem(OPTIMISTIC_KEY, JSON.stringify(optimistic));
  }
  render();

  supabase.channel('messages')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: 'status=eq.approved' },
      (payload) => {
        const row = payload.new as MessageRow;
        const dot = rowToDot(row, false);
        if (dot && !approved.some((d) => d.id === dot.id)) {
          approved.push(dot);
          writeCache(approved);
          const rtKey = dot.message + '|' + dot.country;
          const rtKept = optimistic.filter((d) => d.message + '|' + d.country !== rtKey);
          if (rtKept.length !== optimistic.length) {
            optimistic.length = 0;
            optimistic.push(...rtKept);
            localStorage.setItem(OPTIMISTIC_KEY, JSON.stringify(optimistic));
          }
          render(dot.id);
        }
      })
    .subscribe();

  cta?.addEventListener('click', () => openForm(container, async (raw) => {
    const input = buildSubmission(raw);
    const v = validateSubmission(input, isValidCountryCode);
    if (!v.ok) return { ok: false, errors: v.errors };
    if (containsProfanity(input.message)) return { ok: false, errors: ['profanity'] };
    const { error } = await supabase.from('messages').insert({
      message: input.message,
      display_name: input.displayName,
      country_code: input.countryCode,
      status: 'pending',
    });
    if (error) return { ok: false, errors: ['submit_failed'] };
    const localDot = rowToDot(
      { id: `local-${Date.now()}`, message: input.message, display_name: input.displayName ?? null, country_code: input.countryCode },
      true,
    );
    if (localDot) { addOptimistic(localDot); optimistic.push(localDot); render(localDot.id); }
    return { ok: true, errors: [] };
  }));
}

// ---------------------------------------------------------------------------
// Internal DOM helpers
// ---------------------------------------------------------------------------

const DIALOG_STYLE = `
[data-globe-form] {
  border: none;
  border-radius: 12px;
  padding: 0;
  background: transparent;
  max-width: 480px;
  width: 100%;
}
[data-globe-form]::backdrop {
  background: rgba(10,14,12,0.55);
  backdrop-filter: blur(3px);
}
.gf-inner {
  background: #f7f8f7;
  color: #0a0e0c;
  border-radius: 12px;
  padding: 28px 24px 24px;
  font-family: system-ui, sans-serif;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.gf-title {
  margin: 0 0 4px;
  font-size: 1.15rem;
  font-weight: 700;
  color: #0a0e0c;
}
.gf-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.gf-field label {
  font-size: 0.8rem;
  font-weight: 600;
  color: #0a0e0c;
  letter-spacing: 0.03em;
}
.gf-field textarea,
.gf-field input,
.gf-field select {
  background: #fff;
  border: 1.5px solid #c8cfc9;
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 0.9rem;
  color: #0a0e0c;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s;
  width: 100%;
  box-sizing: border-box;
}
.gf-field textarea:focus,
.gf-field input:focus,
.gf-field select:focus {
  border-color: #00bf63;
}
.gf-field textarea {
  resize: vertical;
  min-height: 90px;
}
.gf-counter {
  font-size: 0.75rem;
  color: #5a6b62;
  text-align: right;
  margin-top: -2px;
}
.gf-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}
[data-submit] {
  background: #00bf63;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 9px 22px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}
[data-submit]:hover {
  background: #009e52;
}
.gf-close-btn {
  background: transparent;
  border: 1.5px solid #c8cfc9;
  border-radius: 6px;
  padding: 9px 16px;
  font-size: 0.9rem;
  cursor: pointer;
  color: #0a0e0c;
}
.gf-close-btn:hover {
  background: #e8eae8;
}
.gf-status {
  border-radius: 6px;
  padding: 10px 12px;
  font-size: 0.875rem;
  line-height: 1.4;
}
.gf-status[role="status"] {
  background: #e6f9ef;
  color: #00774a;
}
.gf-status[role="alert"] {
  background: #fdecea;
  color: #b03030;
}
`;

function injectStyle(css: string, id: string): void {
  if (document.getElementById(id)) return;
  const s = document.createElement('style');
  s.id = id;
  s.textContent = css;
  document.head.appendChild(s);
}

type SubmitPayload = { message: string; displayName?: string; countryCode: string };
type OnSubmit = (raw: SubmitPayload) => Promise<{ ok: boolean; errors: string[] }>;

function openForm(root: HTMLElement, onSubmit: OnSubmit): void {
  injectStyle(DIALOG_STYLE, 'gf-style');

  // Remove any existing dialog
  document.querySelector('[data-globe-form]')?.remove();

  const dialog = document.createElement('dialog');
  dialog.setAttribute('data-globe-form', '');

  const inner = document.createElement('div');
  inner.className = 'gf-inner';

  // Title
  const title = document.createElement('h2');
  title.className = 'gf-title';
  title.textContent = 'Add your voice';
  inner.appendChild(title);

  // Message field
  const msgField = document.createElement('div');
  msgField.className = 'gf-field';
  const msgLabel = document.createElement('label');
  msgLabel.setAttribute('for', 'gf-message');
  msgLabel.textContent = 'Your message *';
  const msgTextarea = document.createElement('textarea');
  msgTextarea.id = 'gf-message';
  msgTextarea.setAttribute('data-field-message', '');
  msgTextarea.maxLength = 150;
  msgTextarea.placeholder = 'Share a message with the world…';
  const counter = document.createElement('div');
  counter.className = 'gf-counter';
  counter.textContent = '0/150';
  msgTextarea.addEventListener('input', () => {
    if (msgTextarea.value.length > 150) msgTextarea.value = msgTextarea.value.slice(0, 150);
    counter.textContent = `${msgTextarea.value.length}/150`;
  });
  msgField.appendChild(msgLabel);
  msgField.appendChild(msgTextarea);
  msgField.appendChild(counter);
  inner.appendChild(msgField);

  // Name field
  const nameField = document.createElement('div');
  nameField.className = 'gf-field';
  const nameLabel = document.createElement('label');
  nameLabel.setAttribute('for', 'gf-name');
  nameLabel.textContent = 'Name';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.id = 'gf-name';
  nameInput.setAttribute('data-field-name', '');
  nameInput.placeholder = 'Your name (optional — leave blank to stay anonymous)';
  nameField.appendChild(nameLabel);
  nameField.appendChild(nameInput);
  inner.appendChild(nameField);

  // Country field
  const countryField = document.createElement('div');
  countryField.className = 'gf-field';
  const countryLabel = document.createElement('label');
  countryLabel.setAttribute('for', 'gf-country');
  countryLabel.textContent = 'Country *';
  const countrySelect = document.createElement('select');
  countrySelect.id = 'gf-country';
  countrySelect.setAttribute('data-field-country', '');
  // Leading placeholder option
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select your country…';
  placeholder.disabled = true;
  placeholder.selected = true;
  countrySelect.appendChild(placeholder);
  // One option per country
  for (const [code, centroid] of Object.entries(COUNTRY_CENTROIDS)) {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = centroid.name;
    countrySelect.appendChild(opt);
  }
  countryField.appendChild(countryLabel);
  countryField.appendChild(countrySelect);
  inner.appendChild(countryField);

  // Status / alert area (initially hidden)
  const statusEl = document.createElement('div');
  statusEl.className = 'gf-status';
  statusEl.style.display = 'none';
  inner.appendChild(statusEl);

  // Actions
  const actions = document.createElement('div');
  actions.className = 'gf-actions';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'gf-close-btn';
  closeBtn.textContent = 'Cancel';
  closeBtn.addEventListener('click', () => dialog.close());

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.setAttribute('data-submit', '');
  submitBtn.textContent = 'Submit';

  actions.appendChild(closeBtn);
  actions.appendChild(submitBtn);
  inner.appendChild(actions);

  // Wire the form submit via a <form> wrapper (native submit event on dialog)
  const form = document.createElement('form');
  form.method = 'dialog'; // prevents page reload; we intercept below
  // Re-append inner contents into form
  form.appendChild(inner);
  dialog.appendChild(form);

  // Submit handler
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    statusEl.style.display = 'none';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';

    const raw: SubmitPayload = {
      message: msgTextarea.value,
      displayName: nameInput.value || undefined,
      countryCode: countrySelect.value,
    };

    try {
      const res = await onSubmit(raw);
      if (res.ok) {
        // Show pending message from root dataset, or a default
        const pendingMsg = root.dataset.pendingMessage ?? 'Your message is pending approval. Thank you!';
        statusEl.setAttribute('role', 'status');
        statusEl.textContent = pendingMsg;
        statusEl.style.display = 'block';
        setTimeout(() => dialog.close(), 1800);
      } else {
        statusEl.setAttribute('role', 'alert');
        statusEl.textContent = res.errors.join(' · ') || 'Something went wrong. Please try again.';
        statusEl.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit';
      }
    } catch {
      statusEl.setAttribute('role', 'alert');
      statusEl.textContent = 'Network error. Please try again.';
      statusEl.style.display = 'block';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit';
    }
  });

  document.body.appendChild(dialog);
  dialog.showModal();
}

// ---------------------------------------------------------------------------

const POPOVER_STYLE = `
[data-globe-popover] {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: #f7f8f7;
  color: #0a0e0c;
  border-radius: 10px;
  padding: 16px 18px;
  font-family: system-ui, sans-serif;
  font-size: 0.875rem;
  max-width: 340px;
  width: calc(100% - 48px);
  box-shadow: 0 4px 24px rgba(10,14,12,0.18);
  z-index: 9000;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.gp-message {
  font-size: 0.95rem;
  line-height: 1.45;
  color: #0a0e0c;
  margin: 0;
}
.gp-meta {
  font-size: 0.78rem;
  color: #5a6b62;
  display: flex;
  gap: 8px;
  align-items: center;
}
.gp-close {
  background: transparent;
  border: none;
  cursor: pointer;
  margin-left: auto;
  font-size: 1rem;
  color: #5a6b62;
  line-height: 1;
  padding: 2px 4px;
  border-radius: 4px;
}
.gp-close:hover {
  background: #e8eae8;
  color: #0a0e0c;
}
`;

function showPopover(_root: HTMLElement, d: Dot): void {
  injectStyle(POPOVER_STYLE, 'gp-style');

  // Singleton — remove existing
  document.querySelector('[data-globe-popover]')?.remove();

  const popover = document.createElement('div');
  popover.setAttribute('data-globe-popover', '');

  const msg = document.createElement('p');
  msg.className = 'gp-message';
  msg.textContent = `"${d.message}"`;
  popover.appendChild(msg);

  const meta = document.createElement('div');
  meta.className = 'gp-meta';
  const nameSpan = document.createElement('span');
  nameSpan.textContent = d.name ?? 'Anonymous';
  const sep = document.createElement('span');
  sep.textContent = '·';
  const countrySpan = document.createElement('span');
  countrySpan.textContent = d.country;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'gp-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', () => popover.remove());

  meta.appendChild(nameSpan);
  meta.appendChild(sep);
  meta.appendChild(countrySpan);
  meta.appendChild(closeBtn);
  popover.appendChild(meta);

  const onEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { popover.remove(); document.removeEventListener('keydown', onEscape); }
  };
  document.addEventListener('keydown', onEscape);

  document.body.appendChild(popover);
}

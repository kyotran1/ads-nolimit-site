/**
 * Key & máy (ADS-NOLIMIT AI Office): key của mình (che bớt, nút hiện/chép), gói, số máy đã dùng / tối đa,
 * danh sách máy đã kích hoạt, nút "Yêu cầu đổi máy" (tạo keyRequests/ cho chủ xử lý).
 */
import { dataErrorMessage } from '../auth/messages';
import { byId, confirmDialog, copyButton, h, icon, toast } from '../ui/dom';
import { badge, isVisible, lang, loadError, me, register, when } from './ctx';
import { ensure, errors, isLoaded, on, ops, reload, state } from './store';
import type { LicenseKey } from './store';
import { tx } from './text';

const list = byId('key-list');
const empty = byId('keys-empty');
const alert = byId('keys-alert');

const revealed = new Set<string>();
const mask = (key: string) => key.replace(/^(AINO)-(\w{4})-(\w{4})-(\w{4})$/, '$1-••••-••••-$4');

const requestReset = async (k: LicenseKey, button: HTMLButtonElement) => {
  const user = me();
  if (!user?.email) return;
  const answer = await confirmDialog({
    title: tx('keyResetTitle', { key: mask(k.key) }),
    body: [tx('keyResetBody')],
    confirm: tx('keyResetSend'),
    cancel: tx('back'),
    input: { label: tx('keyResetNote'), maxlength: 500, multiline: true },
  });
  if (!answer.ok) return;
  button.disabled = true;
  try {
    await ops.requestMachineReset({ uid: user.uid, email: user.email, keyId: k.id, note: answer.value, lang });
    await reload('keyRequests');
    toast(tx('keyResetSent'));
  } catch (err) {
    toast(dataErrorMessage(err), 'error');
    button.disabled = false;
  }
};

const keyCard = (k: LicenseKey) => {
  const shown = revealed.has(k.id);
  const keyText = h('code', { class: 'key-value', text: shown ? k.key : mask(k.key) });
  const toggle = h('button', { type: 'button', class: 'copy-btn', 'aria-pressed': String(shown) }, icon(shown ? 'eye-off' : 'eye'), shown ? tx('hideKey') : tx('revealKey'));
  toggle.addEventListener('click', () => {
    if (revealed.has(k.id)) revealed.delete(k.id);
    else revealed.add(k.id);
    render();
  });
  const used = k.machines.length;
  const pct = Math.min(100, Math.round((used / Math.max(1, k.maxMachines)) * 100));
  const pending = state.keyRequests.find((r) => r.keyId === k.id && r.status === 'new');

  const machines = used
    ? h(
        'ul',
        { class: 'machine-list' },
        ...k.machines.map((m) =>
          h('li', {}, icon('monitor'), h('span', { class: 'machine-name', text: m.name || m.id }), h('span', { class: 'machine-date', text: tx('keyActivated', { date: when(m.activatedAt) }) })),
        ),
      )
    : h('p', { class: 'muted small', text: tx('keyNoMachines') });

  const reset = h('button', { type: 'button', class: 'btn btn-sm', disabled: Boolean(pending) || k.status !== 'active' }, icon('refresh'), tx('keyReset'));
  reset.addEventListener('click', () => void requestReset(k, reset));

  return h(
    'li',
    { class: `key-card${k.status !== 'active' ? ' is-revoked' : ''}`, 'data-glow': true },
    h(
      'div',
      { class: 'key-top' },
      h('span', { class: 'icon-tile tone-violet', 'aria-hidden': 'true' }, icon('key')),
      h('div', { class: 'key-id' }, keyText, h('div', { class: 'key-actions' }, toggle, copyButton(() => k.key, { copy: tx('copy'), copied: tx('copied'), failed: tx('copyFailed') }, 'key'))),
      badge('key', k.status),
    ),
    h(
      'dl',
      { class: 'key-facts' },
      h('div', {}, h('dt', { text: tx('keyPlan') }), h('dd', { text: k.plan })),
      h('div', {}, h('dt', { text: tx('keyIssued') }), h('dd', { text: when(k.createdAt) })),
      h(
        'div',
        { class: 'key-usage' },
        h('dt', { text: tx('keyMachines') }),
        h(
          'dd',
          {},
          h('span', { text: tx('keyMachinesCount', { used, max: k.maxMachines }) }),
          h('span', { class: 'meter', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': k.maxMachines, 'aria-valuenow': used, 'aria-label': tx('keyMachines') }, h('span', { style: `width:${pct}%` })),
        ),
      ),
    ),
    machines,
    k.status !== 'active'
      ? h('p', { class: 'muted small', text: tx('keyRevokedHelp') })
      : h('div', { class: 'key-foot' }, reset, pending ? h('p', { class: 'key-pending' }, icon('clock'), h('span', { text: tx('keyResetPending', { date: when(pending.createdAt) }) })) : null),
  );
};

const render = () => {
  const err = errors.get('keys') ?? errors.get('keyRequests');
  if (err) {
    loadError(alert, err, () => void reload('keys', 'keyRequests'));
    return;
  }
  alert.replaceChildren();
  if (!isLoaded('keys')) return;
  empty.hidden = state.keys.length > 0;
  list.replaceChildren(...state.keys.map(keyCard));
};

on(['keys', 'keyRequests'], () => {
  if (isVisible('keys')) render();
});

register('keys', {
  enter() {
    render();
    void ensure('keys', 'keyRequests');
  },
});

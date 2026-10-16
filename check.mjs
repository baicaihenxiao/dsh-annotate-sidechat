/**
 * Runnable check for the client bundle: it must register one factory under the
 * package id, expose the pure quote seams, register the side-chat page type
 * (single page per pane), and render the pending panel from a tab's params.
 * Run: node check.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./client.js', import.meta.url), 'utf8');
const loads = [];

globalThis.window = { __ModuleLoader__: { load: (spec) => loads.push(spec) } };
globalThis.document = {
  querySelector: () => null,
  createElement: () => ({ dataset: {}, remove() {}, setAttribute() {}, append() {}, textContent: '' }),
  head: { append() {} },
  body: { append() {} },
  addEventListener() {},
  removeEventListener() {},
};

new Function(source)();

assert.equal(loads.length, 1, 'exactly one module registration');
assert.equal(loads[0].id, 'dsh-annotate-sidechat', 'factory id is the package name');

const React = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useEffect: () => {},
  useLayoutEffect: () => {},
  useRef: () => ({ current: null }),
  useState: (value) => [value, () => {}],
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
};

const plugin = loads[0].factory((name) => {
  if (name !== 'react') throw new Error(`unexpected runtime import: ${name}`);
  return React;
});

// ── the quote the two menu entries carry ────────────────────────────────────
const { locationLine, quoteText, draftQuote, appendDraft } = plugin.__test;

assert.equal(
  locationLine({ part: 'response', turn: 3, block: 'paragraph 2' }),
  "Quoted from the assistant's reply (turn 3, paragraph 2):",
);
assert.equal(locationLine({ part: 'reasoning', turn: 4 }), "Quoted from the assistant's reasoning (turn 4):");
assert.equal(locationLine({}), "Quoted from the assistant's reply:");

const quote = quoteText({ text: 'alpha\nbeta', turn: 1, block: 'paragraph 1' });
assert.equal(quote, "Quoted from the assistant's reply (turn 1, paragraph 1):\n> alpha\n> beta");
for (const banned of ['针对这段回复', '我的注解']) assert.ok(!quote.includes(banned), `quote still carries "${banned}"`);
assert.ok(quoteText({ text: 'x', turn: 2 }).startsWith('Quoted from '), 'an untitled selection still names its reply');
const long = quoteText({ text: 'a'.repeat(400), turn: 1 });
assert.ok(long.endsWith('> ' + 'a'.repeat(400)), 'a long selection is quoted whole');
assert.ok(!long.includes('…'), 'a long selection is never elided');

assert.equal(appendDraft('', 'q'), 'q', 'an empty draft takes the quote alone');
assert.equal(appendDraft('   ', 'q'), 'q', 'a blank draft takes the quote alone');
assert.equal(appendDraft('typed', 'q'), 'typed\n\nq', 'existing text keeps one blank line before the quote');

// What lands in either composer: both menu entries share it, and it ends on a
// fresh line so the caret waits for the user's own words.
assert.equal(draftQuote({ text: 'x', turn: 2 }), quoteText({ text: 'x', turn: 2 }) + '\n');
assert.ok(draftQuote({ text: 'x' }).endsWith('> x\n'), 'the composer draft ends with one newline');

// ── registration ────────────────────────────────────────────────────────────
const disposers = [];
const registered = [];
const slots = [];
const dictionaries = {};
const tabs = {
  register: (definition) => {
    registered.push(definition);
    return () => {};
  },
};
const ctx = {
  effect: (fn) => {
    const dispose = fn();
    if (typeof dispose === 'function') disposers.push(dispose);
    return () => {};
  },
  inject: (_deps, callback) => {
    callback({ get: (name) => (name === 'sidebarRightTabs' ? tabs : undefined) });
    return () => {};
  },
  slots: {
    register: (options, component) => {
      slots.push({ options, component });
      return () => {};
    },
    inject: (_name, callback) => {
      const dispose = callback();
      return () => { if (typeof dispose === 'function') dispose(); };
    },
  },
  locale: {
    register: (namespace, dict) => { dictionaries[namespace] = dict; },
    bind: () => (key) => key,
  },
  sessions: {
    list: { getSnapshot: () => ({ ids: [], byId: {}, current: 'parent-1' }) },
    scope: () => undefined,
    retain: () => { throw new Error('retain must not run before a send'); },
  },
  get: () => undefined,
};

plugin.apply(ctx);

assert.equal(registered.length, 1, 'one page type registered');
assert.equal(registered[0].kind, 'annotate-sidechat-note');
assert.equal(registered[0].multiple, false, 'one side chat per session pane');
assert.equal(registered[0].guide.length, 1, 'the guide offers the page, so it opens without a quote');
assert.equal(registered[0].guide[0].id, 'dsh-annotate-sidechat:note');
assert.equal(typeof registered[0].guide[0].title(), 'string');
assert.equal(typeof registered[0].guide[0].description(), 'string');

const zhKeys = Object.keys(dictionaries.annotateSidechat.zh).sort();
const enKeys = Object.keys(dictionaries.annotateSidechat.en).sort();
assert.deepEqual(zhKeys, enKeys, 'zh/en dictionaries cover the same keys');
assert.ok(zhKeys.includes('action.toMain') && zhKeys.includes('action.toSide'));
assert.ok(zhKeys.includes('guide.description'), 'the guide entry has copy');

const body = slots.find((entry) => entry.options.name === 'sidebar.right.pane.tab');
assert.ok(body !== undefined, 'the pane tab body is registered');
assert.equal(body.options.key, 'dsh-annotate-sidechat:note');

const injected = body.options.inject('parent-1');
assert.equal(typeof injected.sendSideChat, 'function', 'the body can send the pending panel');
assert.equal(injected.sessionId, 'parent-1', 'the injector receives the pane session');

// A restored tab carries its draft in navigation params; the panel renders it.
const tree = body.component({
  ...injected,
  t: (key) => key,
  useTabInfo: () => ({ tab: { navigation: { params: { parentId: 'parent-1', draft: 'Quoted from the assistant' } } } }),
  renderSlot: () => null,
  SessionProvider: () => null,
});
assert.equal(tree.props.className, 'dsh-note-panel', 'an uncreated side chat renders the pending panel');
assert.equal(tree.children[2].props.value, 'Quoted from the assistant', 'the panel restores the quoted draft');
assert.equal(typeof tree.children[2].props.ref, 'object', 'the pending composer is ref-wired for focus');

// A page opened from the guide carries no params at all: the pane's session is
// the parent, and the composer starts empty — the user just types into it.
const bare = slots.find((entry) => entry.options.name === 'sidebar.right.pane.tab');
const bareTree = bare.component({
  ...body.options.inject('pane-session'),
  t: (key) => key,
  useTabInfo: () => ({ tab: { navigation: {} } }),
  renderSlot: () => null,
  SessionProvider: () => null,
});
assert.equal(bareTree.props.className, 'dsh-note-panel', 'a guide-opened page shows the composer');
assert.equal(bareTree.children[2].props.value, '', 'the guide-opened composer starts empty');
assert.equal(bareTree.children[2].props.disabled, false, 'the empty composer is typable');

for (const dispose of disposers.reverse()) dispose();

// The bug this version fixes: the panel body is no longer our own DOM, and the
// sidebar exclusion uses the host's real markers.
assert.ok(source.includes('[data-sidebar-right-session]'), 'sidebar exclusion uses the host marker');
assert.ok(!source.includes('[data-sidebar-right],'), 'the bogus un-suffixed sidebar selector is gone');

// Hovering the primary menu entry must not repaint it with the light layer fill.
assert.match(
  source,
  /\.dsh-note-btn-primary:hover\s*\{[^}]*background:\s*var\(--dsw-alias-brand-primary\)/,
  'the primary hover restates the brand fill',
);
assert.ok(!source.includes('filter: brightness'), 'the primary hover no longer washes toward white');

console.log('ok — dsh-annotate-sidechat client bundle');

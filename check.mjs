/**
 * Runnable check for the client bundle: it must register one factory under the
 * package id, expose the pure quote and naming seams, register the side-chat
 * page type (one page per side chat, plus its guide entry and tab chip), and
 * render the pending panel for both a menu-opened and a guide-opened page.
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
  createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  useEffect: () => {},
  useLayoutEffect: () => {},
  useRef: () => ({ current: null }),
  useState: (value) => [typeof value === 'function' ? value() : value, () => {}],
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
};

const plugin = loads[0].factory((name) => {
  if (name !== 'react') throw new Error(`unexpected runtime import: ${name}`);
  return React;
});

/** Depth-first search of a rendered tree. */
function find(node, predicate) {
  if (node === null || node === undefined || typeof node !== 'object') return undefined;
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = find(child, predicate);
      if (hit !== undefined) return hit;
    }
    return undefined;
  }
  if (typeof node.type === 'string' && predicate(node)) return node;
  return find(node.children, predicate);
}

// ── the quote the two menu entries carry ────────────────────────────────────
const { locationLine, quoteText, draftQuote, appendDraft, sideChatTitle, nextSideChatIndex } = plugin.__test;

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

// ── naming: sidechat-<n>-<main chat title> ─────────────────────────────────
assert.equal(sideChatTitle(1, 'Fix the login timeout', '/tmp/repo'), 'sidechat-1-Fix the login timeout');
assert.equal(sideChatTitle(2, '   ', '/tmp/my-repo'), 'sidechat-2-my-repo', 'no title falls back to the directory');
assert.equal(sideChatTitle(3, '', ''), 'sidechat-3', 'no title and no directory leaves the number');

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
    bind: () => (key, params) => (params === undefined ? key : `${key}:${JSON.stringify(params)}`),
  },
  sessions: {
    list: { getSnapshot: () => ({
      current: 'parent-1',
      ids: ['parent-1', 'child-1', 'child-2'],
      byId: {
        'parent-1': { id: 'parent-1', cwd: '/tmp/repo', title: 'Main chat title' },
        'child-1': { id: 'child-1', parentId: 'parent-1', title: 'sidechat-1-Main chat title' },
        'child-2': { id: 'child-2', parentId: 'parent-1', title: 'sidechat-2-Main chat title' },
      },
    }) },
    scope: () => undefined,
    binding: () => undefined,
    retain: () => { throw new Error('retain must not run before a send'); },
  },
  get: () => undefined,
};

plugin.apply(ctx);

assert.equal(registered.length, 1, 'one page type registered');
assert.equal(registered[0].kind, 'annotate-sidechat-note');
assert.equal(registered[0].multiple, true, 'each side chat is its own page');
assert.equal(registered[0].guide.length, 1, 'the guide offers the page, so it opens without a quote');
assert.equal(registered[0].guide[0].id, 'dsh-annotate-sidechat:note');
assert.equal(typeof registered[0].guide[0].title(), 'string');
assert.equal(typeof registered[0].guide[0].description(), 'string');

const zhKeys = Object.keys(dictionaries.annotateSidechat.zh).sort();
const enKeys = Object.keys(dictionaries.annotateSidechat.en).sort();
assert.deepEqual(zhKeys, enKeys, 'zh/en dictionaries cover the same keys');
for (const key of ['action.toMain', 'action.toSide', 'guide.description', 'sideChat.new', 'sideChat.reset', 'sideChat.chip']) {
  assert.ok(zhKeys.includes(key), `dictionary carries ${key}`);
}

const body = slots.find((entry) => entry.options.name === 'sidebar.right.pane.tab');
const chip = slots.find((entry) => entry.options.name === 'sidebar.right.pane.tab.title');
assert.ok(body !== undefined, 'the pane tab body is registered');
assert.ok(chip !== undefined, 'the tab chip is registered');
assert.equal(body.options.key, 'dsh-annotate-sidechat:note');

const injected = body.options.inject('parent-1');
assert.equal(typeof injected.sendSideChat, 'function', 'the body can send the pending panel');
assert.equal(typeof injected.newSideChat, 'function', 'the body can open another side chat');
assert.equal(typeof injected.resetSideChat, 'function', 'the body can reset its side chat');
assert.equal(injected.sessionId, 'parent-1', 'the injector receives the pane session');

// ── numbering counts the parent's side chats, sessions and pages alike ──────
assert.equal(nextSideChatIndex(ctx, injected.chats, 'parent-1'), 3, 'two children in the list ⇒ next is 3');
injected.chats.create('parent-1');
assert.equal(nextSideChatIndex(ctx, injected.chats, 'parent-1'), 4, 'a live page pushes the number up too');
assert.equal(nextSideChatIndex(ctx, injected.chats, 'other'), 1, 'another parent starts at 1');

// ── the pending panel: a menu-opened page restores its draft ───────────────
const panelOf = (params, sessionId, tabId = 'tab-1') => body.component({
  ...body.options.inject(sessionId),
  t: (key, extra) => (extra === undefined ? key : `${key}${JSON.stringify(extra)}`),
  useTabInfo: () => ({ tab: { id: tabId, navigation: { params } } }),
  renderSlot: () => null,
  SessionProvider: () => null,
});

const tree = panelOf({ id: 'note-a', parentId: 'parent-1', index: 1, draft: 'Quoted from the assistant' }, 'parent-1');
assert.equal(tree.props.className, 'dsh-note-panel', 'an uncreated side chat renders the pending panel');
const textarea = find(tree, (node) => node.type === 'textarea');
assert.equal(textarea.props.value, 'Quoted from the assistant', 'the panel restores the quoted draft');
assert.equal(textarea.props.disabled, false, 'the empty composer is typable');
assert.equal(typeof textarea.props.ref, 'object', 'the pending composer is ref-wired for focus');
const toolButtons = find(tree, (node) => node.type === 'div' && node.props.className === 'dsh-note-tools')
  .children.filter(Boolean);
assert.deepEqual(toolButtons.map((button) => button.children[1]), ['sideChat.reset', 'sideChat.new'],
  'reset sits left of new');
assert.deepEqual(toolButtons.map((button) => button.children[0].children[0]), ['↺', '＋'],
  'each button carries its own glyph');
assert.ok(toolButtons[0].props.className.includes('dsh-note-tool-warn'), 'reset carries the caution tone');
assert.ok(toolButtons[1].props.className.includes('dsh-note-tool-primary'), 'new is the brand-tinted one');
assert.ok(toolButtons[0].props.title !== toolButtons[1].props.title, 'the two buttons explain themselves differently');

// ── a page opened from the guide mints its own side chat ───────────────────
const bareTree = panelOf({}, 'pane-session', 'tab-2');
assert.equal(bareTree.props.className, 'dsh-note-panel', 'a guide-opened page shows the composer');
const bareTextarea = find(bareTree, (node) => node.type === 'textarea');
assert.equal(bareTextarea.props.value, '', 'the guide-opened composer starts empty');
assert.equal(bareTextarea.props.disabled, false, 'its composer is typable without any quote');
const bareTitle = find(bareTree, (node) => node.type === 'div' && node.props.className === 'dsh-note-panelTitle');
assert.equal(bareTitle.children[0], 'sideChat.pendingTitle', 'it is a new side chat');
// Above the (short) composer sits what the chat will inherit. The check's
// document has no transcript, so it reports that instead of listing nothing.
const inheritBox = find(bareTree, (node) => node.type === 'div' && node.props.className === 'dsh-note-inherit');
assert.ok(inheritBox !== undefined, 'the new-chat panel shows the inherited history');
const inheritTexts = [];
(function collect(node) {
  if (node === null || node === undefined || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const child of node) collect(child); return; }
  if (node.type === 'div' && node.props.className === 'dsh-note-inheritMore') inheritTexts.push(node.children[0]);
  collect(node.children);
})(inheritBox);
assert.deepEqual(inheritTexts, ['sideChat.inheritEmpty'], 'with no main transcript it says so');

// ── the chip names the page's side chat ────────────────────────────────────
const chipTree = chip.component({
  ...chip.options.inject('parent-1'),
  t: (key, extra) => `${key}${JSON.stringify(extra)}`,
  useTabInfo: () => ({ tab: { id: 'tab-1', navigation: { params: { id: 'note-a', index: 1 } } } }),
});
assert.equal(chipTree.children[0], 'sideChat.chip{"index":1}', 'the chip shows the side chat number');

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
assert.match(
  source,
  /\.dsh-note-tool-warn\s*\{[^}]*color:\s*var\(--dsw-alias-state-warn-primary\)/,
  'the reset button is coloured with the warning tone',
);
assert.ok(!source.includes('filter: brightness'), 'the primary hover no longer washes toward white');

// The new-chat composer stays short, and the room it frees goes to the
// inherited history above it.
assert.match(source, /\.dsh-note-input\s*\{[^}]*height:\s*52px/, 'the new-chat composer is kept short');
assert.match(source, /\.dsh-note-inheritList\s*\{[^}]*overflow:\s*auto/, 'the inherited list scrolls');

// The inherited prefix is folded by CSS alone, so it stays folded through
// re-renders and copied/moved nodes.
assert.match(
  source,
  /\.dsh-note-sideBody\[data-dsh-sidechat-collapsed\]\s*\[data-dsh-sidechat-inherited\]\s*\{\s*display:\s*none;\s*\}/,
  'the inherited prefix has a collapse rule',
);

console.log('ok — dsh-annotate-sidechat client bundle');

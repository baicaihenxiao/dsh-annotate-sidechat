/**
 * Runnable check for the client bundle: it must register one factory under the
 * package id, expose the pure quote and naming seams, register the side-chat
 * page type (one page per side chat, plus its guide entry and tab chip), and
 * render the pending panel for both a menu-opened and a guide-opened page.
 * Run: node check.mjs
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const source = readFileSync(new URL('./client.js', import.meta.url), 'utf8');
const loads = [];

const storage = new Map();
globalThis.window = {
  __ModuleLoader__: { load: (spec) => loads.push(spec) },
  localStorage: {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => { storage.set(key, String(value)); },
    removeItem: (key) => { storage.delete(key); },
    key: (index) => Array.from(storage.keys())[index] ?? null,
    get length() { return storage.size; },
  },
};
globalThis.document = {
  querySelector: () => null,
  // A template keeps its markup as is here; the real parse runs in a browser.
  createElement: (tag) => (tag === 'template'
    ? { innerHTML: '', content: { querySelectorAll: () => [] } }
    : { dataset: {}, remove() {}, setAttribute() {}, append() {}, textContent: '' }),
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
  useMemo: (fn) => fn(),
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
const { locationLine, quoteText, draftQuote, appendDraft, nextDraft, sideChatTitle, nextSideChatIndex } = plugin.__test;

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

// DSH 0.2.0's composer is a plain string; from 0.2.1 it holds reference chips
// in a semantic document, which the quote must extend rather than flatten.
const plainInput = { state: { getSnapshot: () => ({ draft: 'typed' }) } };
assert.equal(nextDraft(plainInput, 'q'), 'typed\n\nq', 'a 0.2.0 composer gets the appended string');
const fileRef = { source: 'file', ref: 'notes.md', offset: 8, length: 9 };
const chipInput = {
  draftSnapshot: { text: 'Look at @notes.md', references: [fileRef] },
  state: { getSnapshot: () => ({ draft: 'Look at @notes.md' }) },
};
assert.deepEqual(
  nextDraft(chipInput, 'q'),
  { text: 'Look at @notes.md\n\nq', references: [fileRef] },
  'a 0.2.1 composer keeps its reference chips under the appended quote',
);

// What lands in either composer: both menu entries share it, and it ends on a
// fresh line so the caret waits for the user's own words.
assert.equal(draftQuote({ text: 'x', turn: 2 }), quoteText({ text: 'x', turn: 2 }) + '\n\n');
assert.ok(draftQuote({ text: 'x' }).endsWith('> x\n\n'), 'the composer draft ends with a blank line');

// ── naming: sidechat-<n>-<main chat title> ─────────────────────────────────
assert.equal(sideChatTitle(1, 'Fix the login timeout', '/tmp/repo'), 'sidechat-1-Fix the login timeout');
assert.equal(sideChatTitle(2, '   ', '/tmp/my-repo'), 'sidechat-2-my-repo', 'no title falls back to the directory');
assert.equal(sideChatTitle(3, '', ''), 'sidechat-3', 'no title and no directory leaves the number');

// ── the fold boundary finds this side chat's own first message ─────────────
// Every quote opens with the same location line, so an inherited message that
// quoted the same spot looks alike for ~60 characters.
const { ownMessageIndex } = plugin.__test;
const row = (kind, turn, text) => ({
  getAttribute: (name) => ({ 'data-chat-flow-kind': kind, 'data-chat-turn': String(turn) })[name] ?? null,
  textContent: text,
});
const sent = draftQuote({ text: 'The first point is the cache', turn: 3, block: 'paragraph 2' }) + 'why?';
const earlier = draftQuote({ text: 'The first point is the cache', turn: 3, block: 'paragraph 2' }) + 'explain more';
const rows = [row('user', 3, earlier), row('assistant-step', 3, 'answer'), row('user', 5, sent)];
assert.equal(ownMessageIndex(rows, sent, 4), 2, 'an inherited quote of the same spot is never the cut');
assert.equal(ownMessageIndex(rows, sent, null), 2, 'without a turn boundary the longer needle still tells them apart');
assert.equal(ownMessageIndex(rows, 'not on the page', 4), -1, 'a message not on the page is not found');

// The fork point is the last event the child copied verbatim. Both sessions keep
// numbering after it, so when the main chat was mid-turn at the fork its turn-3
// events share seqs with the side chat's own turn 3; those are not inherited.
const { inheritedTurnBoundary } = plugin.__test;
const ev = (seq, type, time, data) => ({ type: 'event', event: { seq, type, time, data } });
const shared = [ev(4, 'turn/start', 10, { turn: 1 }), ev(42, 'turn/start', 20, { turn: 2 }), ev(49, 'turn/end', 30, { turn: 2 })];
const windows = {
  main: [...shared, ev(50, 'agent/inbox/spliced', 40, {}), ev(51, 'turn/start', 41, { turn: 3 }), ev(53, 'step/start', 42, { turn: 3 })],
  side: [...shared, ev(50, 'session/end-seed', 30, { inherited: true }), ev(51, 'session/title', 90, {}), ev(53, 'turn/start', 91, { turn: 3 })],
};
const windowCtx = { sessions: { binding: (id) => ({ eventSource: { getSnapshot: () => ({ entries: windows[id] }) } }) } };
assert.equal(inheritedTurnBoundary(windowCtx, 'main', 'side'), 2, 'seqs the main chat wrote after the fork are not inherited');

// A page that stored the old, wrong boundary is corrected when it opens its chat,
// holding the main chat only for that read; one that cannot be told is left alone.
const { recheckBoundary } = plugin.__test;
let parentHeld = 0;
const recheckCtx = {
  ...windowCtx,
  sessions: { ...windowCtx.sessions, retain: () => { parentHeld += 1; return { ready: Promise.resolve(), release: () => { parentHeld -= 1; } }; } },
  get: () => undefined,
};
const page = { id: 'p', parentId: 'main', childId: 'side', boundaryTurn: 3 };
const pageStore = { get: () => page, patch: (_id, next) => Object.assign(page, next), tabOfId: () => undefined };
await recheckBoundary(recheckCtx, pageStore, 'p', { ready: Promise.resolve() });
assert.equal(page.boundaryTurn, 2, 'a stored boundary past the fork is corrected');
assert.equal(parentHeld, 0, 'the main chat is let go after the read');
page.childId = 'unknown';
page.boundaryTurn = 3;
await recheckBoundary({ ...recheckCtx, sessions: { ...recheckCtx.sessions, binding: () => undefined } }, pageStore, 'p', { ready: Promise.resolve() });
assert.equal(page.boundaryTurn, 3, 'a boundary that cannot be told keeps the stored one');

// ── where a selected reply can be quoted to ────────────────────────────────
// A fake element answers `closest` for any selector naming one of its marks.
class FakeElement {
  constructor(attrs = {}) { this.attrs = attrs; this.marks = {}; }
  closest(selector) {
    const mark = Object.keys(this.marks).find((name) => selector.includes(name));
    return mark === undefined ? null : this.marks[mark];
  }
  hasAttribute(name) { return name in this.attrs; }
  getAttribute(name) { return this.attrs[name] ?? null; }
  querySelector() { return null; }
}
globalThis.Element = FakeElement;
const { stepOf, Overlay } = plugin.__test;
const stepIn = ({ side, ours = false, sidebar = false, streaming = false } = {}) => {
  const step = new FakeElement(streaming ? { 'data-streaming': '' } : {});
  step.marks['assistant-step'] = step;
  if (side !== undefined) step.marks['data-dsh-sidechat-child'] = new FakeElement({ 'data-dsh-sidechat-child': side });
  if (ours) step.marks['data-dsh-annotate-sidechat'] = new FakeElement();
  if (sidebar) step.marks['data-sidebar-right'] = new FakeElement();
  return step;
};
assert.equal(stepOf(stepIn()).side, '', 'a main chat reply quotes to the main chat or a side chat');
assert.equal(stepOf(stepIn({ side: 'child-9', ours: true, sidebar: true })).side, 'child-9',
  'a reply inside a sent side chat quotes into that side chat');
assert.equal(stepOf(stepIn({ ours: true, sidebar: true })), null, 'a pending page\'s copied rows are not quotable');
assert.equal(stepOf(stepIn({ sidebar: true })), null, 'any other sidebar chat is not quotable');
assert.equal(stepOf(stepIn({ side: '', ours: true, sidebar: true })), null, 'a body with no child is not quotable');
assert.equal(stepOf(stepIn({ side: 'child-9', ours: true, sidebar: true, streaming: true })), null,
  'a reply still being written is not quotable');

const menuOf = (pending, sent) => Overlay({
  t: (key) => key,
  store: { subscribe: () => () => {}, getSnapshot: () => ({ pending, error: '' }) },
  toMain: (selection) => sent.push(['main', selection]),
  toSide: (selection) => sent.push(['side', selection]),
  toChat: (selection) => sent.push(['chat', selection]),
  sideIndex: (childId) => (childId === 'child-9' ? 3 : 0),
});
const buttonsOf = (tree) => find(tree, (node) => String(node.props.className).split(' ').includes('dsh-note-menu')).children
  .filter((node) => node !== null && node !== undefined && node.type === 'button');
const rect = { left: 0, bottom: 0 };
const sentTo = [];
const inSide = buttonsOf(menuOf({ text: 'x', rect, side: 'child-9' }, sentTo));
assert.deepEqual(inSide.map((button) => button.children[1]), ['action.toChat'], 'a side chat offers Send to chat alone');
assert.deepEqual(inSide.map((button) => button.children[0].children[0]), ['↵'], 'led by the key that sends it');
inSide[0].props.onClick();
assert.equal(sentTo[0][0], 'chat', 'Send to chat sends the quote to that chat');
assert.equal(sentTo[0][1].side, 'child-9', 'with the side chat it was selected in');
{
  const destOf = (side) => find(menuOf({ text: 'x', rect, side }, []), (node) => node.props.className === 'dsh-note-dest');
  assert.equal(destOf('child-9').children[0], 'sideChat.chip', 'a side chat\'s menu names the side chat it reaches');
  assert.equal(destOf('child-0'), undefined, 'unless no page holds it');
  assert.match(source, /\.dsh-note-menu \{[^}]*\}\n\.dsh-note-menu-spread \{[^}]*gap: 16px/, 'its gap rule comes after the base one');
}
const mainMenu = menuOf({ text: 'x', rect, side: '', turn: 3, block: 'paragraph 2' }, []);
assert.deepEqual(buttonsOf(mainMenu).map((button) => button.children[1]),
  ['action.toMain', 'action.toSide'], 'the main chat keeps its two items');
assert.deepEqual(buttonsOf(mainMenu).map((button) => button.children[0].children[0]), ['M', 'S'],
  'each led by its own key chip');
const band = find(mainMenu, (node) => node.props.className === 'dsh-note-where');
assert.equal(band.children[1].children[0], 'where.turn · where.paragraph · where.chars',
  'the card names where the selection sits');
assert.equal(band.props.title, band.children[1].children[0], 'and hovering it shows that line in full');
assert.match(source, /\.dsh-note-where \{[^}]*width: 0; min-width: 100%;/, 'the band never widens the card');
assert.match(source, /\.dsh-note-whereText \{[^}]*text-overflow: ellipsis;/, 'it ends in an ellipsis instead');

// ── the menu's location line and its keys ──────────────────────────────────
const { whereLabel, menuKey } = plugin.__test;
const tWhere = (key, extra) => (extra === undefined ? key : `${key}${JSON.stringify(extra)}`);
assert.equal(whereLabel({ text: '缓存命中', turn: 3, block: 'paragraph 2' }, tWhere),
  'where.turn{"turn":3} · where.paragraph{"n":2} · where.chars{"chars":4}', 'turn, block and length, in that order');
assert.equal(whereLabel({ text: 'ab', part: 'reasoning', turn: 4, block: 'code block 1' }, tWhere),
  'where.turn{"turn":4} · where.reasoning · where.code block{"n":1} · where.chars{"chars":2}',
  'the thinking block and a multi-word block kind are named');
assert.equal(whereLabel({ text: 'x' }, tWhere), 'where.chars{"chars":1}', 'an unplaced selection still gives its length');
const mainState = { pending: { side: '' } };
assert.equal(menuKey(mainState, 'm'), 'main', 'M sends to the main chat');
assert.equal(menuKey(mainState, 'S'), 'side', 'S sends to a side chat, either case');
assert.equal(menuKey(mainState, 'Enter'), undefined, 'Enter picks nothing when two entries compete');
assert.equal(menuKey(mainState, 'Escape'), 'cancel', 'Escape dismisses');
assert.equal(menuKey({ pending: { side: 'child-9' } }, 'Enter'), 'chat', 'Enter sends inside a side chat');
assert.equal(menuKey({ pending: { side: 'child-9' } }, 'm'), undefined, 'and M is not offered there');
assert.equal(menuKey({ pending: { side: '' }, notice: {} }, 'Enter'), 'new', 'Enter answers the notice yes');
assert.equal(menuKey({ pending: { side: '' }, notice: {} }, 's'), undefined, 'the notice ignores the menu keys');
assert.equal(menuKey({ pending: null }, 'm'), undefined, 'no card, no keys');
assert.equal(menuKey(mainState, 'ь', 'KeyM'), 'main', 'a Russian layout\'s M key still sends to the main chat');
assert.equal(menuKey(mainState, 'ы', 'KeyS'), 'side', 'and its S key to a side chat');
assert.equal(menuKey(mainState, ',', 'KeyM'), undefined, 'AZERTY\'s comma on the QWERTY M position picks nothing');
assert.equal(menuKey(mainState, 'm', 'Semicolon'), 'main', 'while AZERTY\'s own M key works by its letter');
assert.match(source, /event\.key === 'Enter' && target instanceof Element\s*&& target\.closest\('button, a\[href\], \[role="button"\], summary'\) !== null\) return;/,
  'Enter on a focused button stays that button\'s');
assert.match(source, /if \(event\.ctrlKey \|\| event\.metaKey \|\| event\.altKey \|\| event\.shiftKey\) return;/,
  'a chord such as Cmd+C stays the host\'s');
assert.match(source, /target\.closest\('input, textarea, select'\) !== null \|\| target\.isContentEditable === true\)\) return;/,
  'typing in a field is never taken');

// ── a quote from a turn the open side chat was forked before ───────────────
const { staleQuote } = plugin.__test;
const forkedAt2 = { childId: 'child-9', boundaryTurn: 2, index: 1 };
assert.deepEqual(staleQuote({ turn: 4 }, forkedAt2), { turn: 4, fork: 2, index: 1 },
  'a quote from turn 4 is news to a side chat forked at turn 2');
assert.equal(staleQuote({ turn: 2 }, forkedAt2), null, 'a quote from a turn it inherited goes straight in');
assert.equal(staleQuote({}, forkedAt2), null, 'a quote with no turn number is not second-guessed');
assert.equal(staleQuote({ turn: 4 }, { ...forkedAt2, childId: null }), null, 'a pending page has no fork point yet');
assert.equal(staleQuote({ turn: 4 }, { ...forkedAt2, boundaryTurn: null }), null,
  'with no fork point on record or on screen, the quote is not second-guessed');

const noticeOf = (pending, notice, sent) => Overlay({
  t: (key) => key,
  store: { subscribe: () => () => {}, getSnapshot: () => ({ pending, error: '', notice }) },
  toMain: () => {}, toSide: () => {}, toChat: () => {},
  toNewSide: (selection) => sent.push(['new', selection]),
  cancel: () => sent.push(['cancel']),
});
const answered = [];
const noticeCard = noticeOf({ text: 'x', rect, side: '', turn: 4 }, { turn: 4, fork: 2, index: 1 }, answered);
assert.equal(noticeCard.props.role, 'alertdialog', 'the notice is announced as a question');
assert.ok(find(noticeCard, (node) => node.props.className === 'dsh-note-notice') !== undefined, 'it explains the situation');
const answers = buttonsOf(noticeCard);
assert.deepEqual(answers.map((button) => button.children[1]), ['action.cancel', 'action.toNewSide'],
  'it offers Cancel and a new side chat');
answers[1].props.onClick();
answers[0].props.onClick();
assert.deepEqual(answered.map((entry) => entry[0]), ['new', 'cancel'], 'each answer reaches its own action');
assert.equal(answered[0][1].turn, 4, 'the new side chat gets the quote that raised the notice');
assert.match(source, /const recompute = \(\) => \{\s*\/\/[^\n]*\n[^\n]*\n\s*if \(store\.getSnapshot\(\)\.notice !== undefined\) return;/,
  'a selection event never replaces a notice that waits for its answer');

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
    retain: () => ({
      ready: Promise.resolve(),
      binding: { session: {} },
      release: () => {},
    }),
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

// ── against the host's real slot registry ──────────────────────────────────
// The stubs accept anything; the host's SlotCore refuses a second declaration
// of a child slot and a second occupant of a single one. ui-subagent ships in
// every Web profile and owns `sidebar.chat.conversation`, so this plugin's
// registrations must fit beside its own, in either load order. 0.2.0-rc.2
// ships dsh-client-ui-slots beside the `dsh` bin; 0.2.1-rc.2 only bundles
// SlotCore into the web app, so point DSH_SLOTS_MODULE at a separately
// installed dsh-client-ui-slots/lib/index.js. Without either the replay is
// skipped, and says so.
function hostSlotsModule() {
  if (process.env.DSH_SLOTS_MODULE) return process.env.DSH_SLOTS_MODULE;
  try {
    const bin = realpathSync(execFileSync('which', ['dsh'], { encoding: 'utf8' }).trim());
    const file = join(dirname(bin), '..', 'node_modules', '@deepseek-ai', 'dsh-client-ui-slots', 'lib', 'index.js');
    return existsSync(file) ? file : undefined;
  } catch (error) { return undefined; }
}
const slotsModule = hostSlotsModule();
if (slotsModule === undefined) {
  console.log('skip — no dsh-client-ui-slots beside the local dsh (0.2.1-rc.2 does not ship it): the real slot registry replay did not run; set DSH_SLOTS_MODULE to a dsh-client-ui-slots/lib/index.js to run it');
} else {
  const { SlotCore } = await import(pathToFileURL(slotsModule).href);
  const subagent = [
    [{ name: 'sidebar.right.pane.tab', key: 'subagentchat', children: { 'sidebar.chat.conversation': { kind: 'single', scope: 'session' } } }, () => null],
    [{ name: 'sidebar.chat.conversation' }, () => null],
  ];
  const ours = slots.map((entry) => [entry.options, entry.component]);
  for (const order of [[...subagent, ...ours], [...ours, ...subagent]]) {
    const core = new SlotCore();
    core.register({ name: 'root', children: {
      'sidebar.right.pane.tab': { kind: 'keyed', scope: 'session' },
      'sidebar.right.pane.tab.title': { kind: 'keyed', scope: 'session' },
      'conversation.session.header.utilities': { kind: 'list', scope: 'session' },
    } }, () => null);
    for (const [options, component] of order) {
      assert.doesNotThrow(() => core.register(options, component), `registering ${options.name} beside ui-subagent`);
    }
  }
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

// ── the header's New side chat: go to an unused page, else open one ────────
{
  assert.ok(slots.find((entry) => entry.options.name === 'conversation.session.header.utilities').options.order < -10,
    'the header button sits left of the shipped utilities');
  const chats = injected.chats;
  const opened = [];
  const focused = [];
  let open = [];
  const sidebar = {
    openTab: (_kind, options) => { opened.push(options.params); },
    openTabs: { getSnapshot: () => open },
    isExpanded: () => true,
    focus: (tabId) => { focused.push(tabId); },
  };
  const go = (parentId) => plugin.__test.openUnusedSideChat({ ...ctx, get: () => sidebar }, chats, parentId);
  const page = (tabId, sessionId, patch) => {
    const entry = chats.create(sessionId);
    chats.bindTab(tabId, entry.id);
    chats.patch(entry.id, patch);
    open.push({ sessionId, tabId, kind: 'annotate-sidechat-note' });
    return entry.id;
  };
  page('tab-sent', 'parent-h', { childId: 'child-h' });
  page('tab-typed', 'parent-h', { draft: 'typed' });
  page('tab-other', 'parent-other', {});
  go('parent-h');
  assert.deepEqual([opened.length, focused.length], [1, 0], 'no unused page of this chat: a new one opens');
  const fresh = page('tab-fresh', 'parent-h', {});
  // The main chat has two turns now, none when that page was created.
  const rows = [1, 2].flatMap((turn) => ['user', 'assistant-step'].map((kind) => Object.assign(
    new FakeElement({ 'data-chat-flow-key': `${kind}-${turn}`, 'data-chat-flow-kind': kind, 'data-chat-turn': String(turn) }),
    { parentElement: {}, outerHTML: '<div></div>' })));
  const mainChat = Object.assign(new FakeElement(), { dataset: {}, querySelector: () => rows[0], querySelectorAll: () => rows });
  document.querySelectorAll = (selector) => (selector === '[data-conversation-session]' ? [mainChat] : []);
  mainChat.dataset.conversationSession = 'parent-h';
  go('parent-h');
  assert.deepEqual([opened.length, focused], [1, ['tab-fresh']], 'an unused page is brought into view instead');
  assert.equal(chats.get(fresh).focusToken, 1, 'its composer asked for the keyboard');
  assert.equal(chats.get(fresh).inherited.turns, 2, 'and it previews the main chat as it is now');
  open = [{ sessionId: 'parent-r', tabId: 'tab-reloaded', kind: 'annotate-sidechat-note' }];
  storage.set('dsh-annotate-sidechat:page:tab-reloaded', JSON.stringify({ id: 'note-r', parentId: 'parent-r', index: 1 }));
  mainChat.dataset.conversationSession = 'parent-r';
  go('parent-r');
  delete document.querySelectorAll;
  assert.equal(focused.at(-1), 'tab-reloaded', 'a page not rendered since a reload is found by its record');
  assert.equal(JSON.parse(storage.get('dsh-annotate-sidechat:page:tab-reloaded')).inherited.turns, 2,
    'which takes the fresh preview for when it renders');
}

// ── Reset takes the main chat's history again ──────────────────────────────
// The next send forks from the main chat's latest completed turn, so a reset
// page must not keep showing the history it captured when it was created.
{
  const chats = injected.chats;
  const column = { className: 'column' };
  const row = (kind, turn) => Object.assign(
    new FakeElement({ 'data-chat-flow-key': `${kind}-${turn}`, 'data-chat-flow-kind': kind, 'data-chat-turn': String(turn) }),
    { parentElement: column, outerHTML: `<div>${kind} ${turn}</div>` },
  );
  const rows = [1, 2, 3].flatMap((turn) => [row('user', turn), row('assistant-step', turn)]);
  const mainChat = Object.assign(new FakeElement(), {
    dataset: { conversationSession: 'parent-reset' },
    querySelector: () => rows[0],
    querySelectorAll: () => rows,
  });
  const twoTurns = { columnClass: 'column', html: '<div>old</div>', messages: 4, turns: 2, hidden: 0 };
  const page = chats.create('parent-reset');
  chats.patch(page.id, { inherited: twoTurns, draft: 'typed' });
  document.querySelectorAll = (selector) => (selector === '[data-conversation-session]' ? [mainChat] : []);
  await injected.resetSideChat(page.id);
  assert.equal(chats.get(page.id).inherited.turns, 3, 'a reset page shows the turn the main chat added since');
  assert.ok(chats.get(page.id).inherited.html.includes('user 3'), 'with that turn in its history');
  assert.equal(chats.get(page.id).draft, '', 'and an empty composer');
  chats.patch(page.id, { inherited: twoTurns });
  document.querySelectorAll = () => [];
  await injected.resetSideChat(page.id);
  assert.equal(chats.get(page.id).inherited, twoTurns, 'with the main chat off screen the old history stays');

  // A long main chat pages its history in: only turns 4–8 are on screen.
  const paged = [4, 5, 6, 7, 8].flatMap((turn) => [row('user', turn), row('assistant-step', turn)]);
  mainChat.querySelector = () => paged[0];
  mainChat.querySelectorAll = () => paged;
  document.querySelectorAll = (selector) => (selector === '[data-conversation-session]' ? [mainChat] : []);
  const pagedPage = chats.create('parent-reset');
  assert.equal(pagedPage.inherited.turns, 8, 'the count is the last completed turn, not the turns on screen');
  assert.equal(pagedPage.inherited.earliest, 4, 'and the preview knows its oldest turns were not loaded');
  delete document.querySelectorAll;
}
assert.match(source, /setInherited\(typeof boundaryTurn === 'number' && boundaryTurn > 0 \? boundaryTurn/,
  'a sent page counts its inherited turns by the fork boundary, loaded or not');

// ── a page holds its side chat until it closes, not while it is mounted ────
// A body unmounts on every session switch. If the side chat's last reference
// went with it while the user had that chat open in the main column, coming
// back tore the generation down and reopened it under the panel, which stayed
// blank until a reload — so the page holds it until the page itself goes.
{
  const chats = injected.chats;
  const counts = { retained: 0, released: 0 };
  const originalRetain = ctx.sessions.retain;
  ctx.sessions.retain = () => {
    counts.retained += 1;
    return { ready: Promise.resolve(), binding: { session: {} }, release: () => { counts.released += 1; } };
  };
  const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
  chats.ensure('note-held', { parentId: 'held-parent', index: 1, childId: 'child-held' });
  chats.bindTab('tab-held', 'note-held');
  assert.equal(chats.hold('child-held'), chats.hold('child-held'), 'every mount of the page shares one reference');
  assert.equal(counts.retained, 1, 'retained once however often the body remounts');
  chats.drop('child-held');
  await tick();
  assert.equal(counts.released, 0, 'a page that still shows the side chat keeps holding it');
  chats.unbindTab('tab-held');
  chats.drop('child-held');
  await tick();
  assert.equal(counts.released, 1, 'a closed page lets its side chat go');
  chats.hold('child-held');
  assert.equal(counts.retained, 2, 'a page that shows it again holds it again');
  chats.dropAll();
  assert.equal(counts.released, 2, 'unloading the plugin lets every side chat go');
  ctx.sessions.retain = originalRetain;
}

// ── side chats archived or deleted elsewhere are cleaned up ────────────────
{
  const { childGone, closeGoneSideChats } = plugin.__test;
  const listsCtx = ({ archived = [], ids = [], workspaces = 'ready', sessions = 'ready', sidebar } = {}) => ({
    get: (name) => (name === 'workspaces'
      ? { list: { getSnapshot: () => ({ phase: workspaces, archivedSessionIds: archived }) } }
      : (name === 'sidebarRight' ? sidebar : undefined)),
    sessions: { list: { getSnapshot: () => ({ phase: sessions, ids }) } },
  });
  assert.equal(childGone(listsCtx({ archived: ['c'], ids: ['c'] }), 'c'), true, 'an archived child is gone');
  assert.equal(childGone(listsCtx({ ids: [] }), 'c'), true, 'a child missing from the ready session list is gone');
  assert.equal(childGone(listsCtx({ ids: ['c'] }), 'c'), false, 'a listed, unarchived child is not');
  assert.equal(childGone(listsCtx({ archived: ['c'], ids: ['c'], workspaces: 'pending' }), 'c'), false,
    'an archive set still arriving says nothing');
  assert.equal(childGone(listsCtx({ ids: [], sessions: 'pending' }), 'c'), false, 'a session list still arriving says nothing');
  assert.equal(childGone(listsCtx(), null), false, 'a page with no child is never gone');

  const chats = injected.chats;
  const counts = { released: 0 };
  const originalRetain = ctx.sessions.retain;
  ctx.sessions.retain = () => ({ ready: Promise.resolve(), binding: { session: {} }, release: () => { counts.released += 1; } });
  const page = (id, tabId, childId) => {
    chats.ensure(id, { parentId: 'gone-parent', index: 1, childId });
    chats.bindTab(tabId, id);
  };
  page('note-arch', 'tab-arch', 'child-arch');
  page('note-del', 'tab-del', 'child-del');
  page('note-live', 'tab-live', 'child-live');
  page('note-reset', 'tab-reset', 'child-reset');
  storage.set('dsh-annotate-sidechat:page:tab-kept-gone', JSON.stringify({ id: 'note-kept-gone', parentId: 'gone-parent', index: 2, childId: 'child-arch' }));
  chats.hold('child-del');
  chats.setResetting('child-reset', true);
  const closed = [];
  const kind = 'annotate-sidechat-note';
  const sidebar = {
    openTab() {},
    close: (tabId) => closed.push(tabId),
    mounted: { getSnapshot: () => 'on-screen' },
    openTabs: { getSnapshot: () => [
      { sessionId: 'on-screen', tabId: 'tab-arch', kind },
      { sessionId: 'elsewhere', tabId: 'tab-del', kind },
      { sessionId: 'on-screen', tabId: 'tab-live', kind },
      { sessionId: 'on-screen', tabId: 'tab-reset', kind },
      { sessionId: 'on-screen', tabId: 'tab-kept-gone', kind },
      { sessionId: 'on-screen', tabId: 'tab-other-type', kind: 'terminal' },
    ] },
  };
  closeGoneSideChats(listsCtx({
    archived: ['child-arch', 'child-reset'],
    ids: ['child-arch', 'child-live', 'child-reset'],
    sidebar,
  }), chats);
  assert.deepEqual(closed, ['tab-arch', 'tab-kept-gone'],
    'the on-screen chat\'s pages of archived or deleted side chats close, from memory or from their record');
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(counts.released, 1, 'a page of a chat not on screen lets its deleted side chat go at once');
  chats.setResetting('child-reset', false);
  ctx.sessions.retain = originalRetain;

  const goneTree = body.component({
    ...body.options.inject('gone-parent'),
    childGone: () => true,
    t: (key) => key,
    useTabInfo: () => ({ tab: { id: 'tab-gone', navigation: { params: { id: 'note-gone', parentId: 'gone-parent', index: 3, childId: 'child-gone' } } } }),
    renderSlot: () => { throw new Error('a gone side chat must not render its conversation'); },
    SessionProvider: () => null,
  });
  assert.ok(JSON.stringify(goneTree).includes('sideChat.gone'), 'a gone side chat\'s page says so');
  assert.ok(!JSON.stringify(goneTree).includes('sideChat.reset'), 'and offers nothing to act on');
}

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
assert.deepEqual(toolButtons.map((button) => button.children[0].props['data-icon']), ['refresh', 'plus'],
  'each button carries its own icon');
assert.ok(toolButtons[0].props.className.includes('dsh-note-tool-warn'), 'reset carries the caution tone');
assert.ok(toolButtons[1].props.className.includes('dsh-note-tool-primary'), 'new carries its own class');
assert.ok(toolButtons[0].props.title !== toolButtons[1].props.title, 'the two buttons explain themselves differently');

// ── a page opened from the guide mints its own side chat ───────────────────
const bareTree = panelOf({}, 'pane-session', 'tab-2');
assert.equal(bareTree.props.className, 'dsh-note-panel', 'a guide-opened page shows the composer');
const bareTextarea = find(bareTree, (node) => node.type === 'textarea');
assert.equal(bareTextarea.props.value, '', 'the guide-opened composer starts empty');
assert.equal(bareTextarea.props.disabled, false, 'its composer is typable without any quote');
// Above it, the panel already looks like a sent side chat: the main chat's own
// rows in a scrolling transcript, and the composer card below.
const transcript = find(bareTree, (node) => node.type === 'div'
  && String(node.props.className).startsWith('dsh-note-transcript'));
assert.ok(transcript !== undefined, 'the new-chat panel shows the inherited history');
const emptyNote = find(transcript, (node) => node.type === 'div' && node.props.className === 'dsh-note-empty');
assert.equal(emptyNote.children[0], 'sideChat.inheritEmpty', 'with no main transcript it says so');
assert.ok(find(bareTree, (node) => node.type === 'div' && node.props.className === 'dsh-note-composer') !== undefined,
  'the composer sits in a card of its own');

// ── a reloaded page finds itself again ─────────────────────────────────────
// The sidebar persists layouts but not navigation params, so a restored page
// gets its identity from the record this plugin kept for the tab: not a new
// mint, and with its draft, child and inherited snapshot intact.
storage.set('dsh-annotate-sidechat:page:tab-kept', JSON.stringify({
  at: Date.now(),
  id: 'note-kept',
  parentId: 'parent-1',
  index: 7,
  first: 'typed earlier',
  draft: 'a draft kept across the reload',
  inherited: { columnClass: '', html: '<div data-chat-flow-key="k"><p>kept row</p></div>', messages: 1, turns: 1, hidden: 0 },
}));
const reloaded = panelOf(undefined, 'parent-1', 'tab-kept');
assert.equal(injected.chats.idOfTab('tab-kept'), 'note-kept', 'the page keeps its side chat instead of minting one');
assert.equal(injected.chats.get('note-kept').draft, 'a draft kept across the reload', 'with its draft');
assert.equal(injected.chats.get('note-kept').index, 7, 'and its number');
assert.ok(JSON.stringify(reloaded).includes('kept row'), 'the restored page renders the history it snapshotted');

// Long messages are left out wherever they sit, so the note on them closes the
// preview — after the last previewed message, not above the first.
const skippedTree = panelOf({
  id: 'note-skipped', parentId: 'parent-skipped', index: 1,
  inherited: { columnClass: '', html: '<div>short row</div>', messages: 3, turns: 2, hidden: 2 },
}, 'parent-skipped', 'tab-skipped');
const previewRows = find(skippedTree, (node) => node.props.className === 'dsh-note-transcriptRows').children.flat().filter(Boolean);
assert.equal(previewRows[previewRows.length - 1].props.className, 'dsh-note-skipped',
  'the left-out note follows the last previewed message');
assert.equal(previewRows[previewRows.length - 1].children[0], 'sideChat.inheritMore', 'and says long messages were left out');
assert.match(source, /\.dsh-note-skipped::before, \.dsh-note-skipped::after \{[^}]*dashed/, 'as a centred, dashed rule');
assert.equal(previewRows.find((node) => String(node.props.className).includes('dsh-note-earlier')), undefined,
  'a preview that starts at turn 1 has no note on earlier turns');

// Turns the main chat had not paged in really are the earliest: their note heads the preview.
const earlierTree = panelOf({
  id: 'note-earlier', parentId: 'parent-earlier', index: 1,
  inherited: { columnClass: '', html: '<div>turn 4 row</div>', messages: 10, turns: 8, earliest: 4, hidden: 0 },
}, 'parent-earlier', 'tab-earlier');
const earlierRows = find(earlierTree, (node) => node.props.className === 'dsh-note-transcriptRows').children.flat().filter(Boolean);
assert.ok(earlierRows[0].props.className.includes('dsh-note-earlier'), 'the earlier-turns note heads the preview');
assert.equal(earlierRows[0].children[0], 'sideChat.inheritEarlier', 'and says the earlier turns are not loaded');
assert.equal(find(earlierTree, (node) => node.props.className === 'dsh-note-toolNote').children[0],
  'sideChat.inherited{"turns":8}', 'while the toolbar counts all 8 turns');

// Every loaded message too long to preview is not "nothing completed yet".
const allLongTree = panelOf({
  id: 'note-all-long', parentId: 'parent-all-long', index: 1,
  inherited: { columnClass: '', html: '', messages: 2, turns: 1, earliest: 1, hidden: 2 },
}, 'parent-all-long', 'tab-all-long');
const allLongRows = find(allLongTree, (node) => node.props.className === 'dsh-note-transcriptRows').children.flat().filter(Boolean);
assert.equal(allLongRows.find((node) => node.props.className === 'dsh-note-empty'), undefined,
  'a preview whose messages were all too long does not claim the main chat has nothing');
assert.equal(allLongRows[allLongRows.length - 1].props.className, 'dsh-note-skipped', 'it says they were too long instead');

storage.set('dsh-annotate-sidechat:page:tab-child', JSON.stringify({
  at: Date.now(),
  id: 'note-child',
  parentId: 'parent-1',
  index: 2,
  childId: 'child-7',
}));
const restoredChat = panelOf(undefined, 'parent-1', 'tab-child');
assert.equal(injected.chats.idOfTab('tab-child'), 'note-child', 'a page with a chat keeps it too');
assert.equal(injected.chats.get('note-child').childId, 'child-7', 'and restores that conversation');
assert.equal(find(restoredChat, (node) => node.type === 'textarea'), undefined,
  'and shows its conversation instead of a new-chat composer');

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

// The entry the card leans toward shows its key in the composer's send blue.
assert.match(
  source,
  /\.dsh-note-btn-primary \.dsh-note-key\s*\{[^}]*color:\s*var\(--dsw-alias-state-business-primary\)/,
  'the primary key chip carries the accent',
);
assert.match(
  source,
  /\.dsh-note-tool-warn\s*\{[^}]*color:\s*var\(--dsw-alias-state-warn-label\)/,
  'the reset button is coloured with the warning tone',
);
assert.ok(!source.includes('filter: brightness'), 'the primary hover no longer washes toward white');

// A history taller than its box opens at its end, so the newest inherited turns
// sit right above the composer instead of the page showing the oldest ones.
assert.ok(source.includes("className: 'dsh-note-transcriptRows', ref: rowsRef"), 'the rows are ref-wired');
assert.ok(source.includes('}, [hasChild, originHtml]);'), 'and scroll to their end when the panel opens');

// The transcript snapshot is read from the session on screen, not from whichever
// conversation happens to be first in the document (a chat switch leaves the
// previous one mounted for a moment).
assert.match(source, /function mainTranscript\(sessionId\)/, 'the transcript reader is session-addressed');
assert.match(source, /root\.dataset\.conversationSession === 'string'/, 'and reads the root\'s own session id');
assert.match(source, /owner === sessionId\) return root/, 'and returns only that session\'s transcript');
assert.match(source, /captureInherited\(props\.sessions, paneSessionId\)/,
  'a pending page re-reads its history when its pane moves to another chat');

// The transcript takes the room and scrolls inside itself; the composer hugs its
// own content under it, so the history is never covered.
assert.match(source, /\.dsh-note-transcript\s*\{[^}]*flex:\s*1 1 auto/, 'the transcript takes the room');
assert.match(source, /\.dsh-note-transcript\s*\{[^}]*overflow:\s*hidden/, 'and clips its own box');
assert.match(source, /\.dsh-note-transcriptRows\s*\{[^}]*overflow:\s*auto/, 'with the rows scrolling inside it');
assert.match(source, /\.dsh-note-composer\s*\{[^}]*flex:\s*0 0 auto/, 'the composer hugs its content');
assert.match(source, /\.dsh-note-composer\s*\{[^}]*max-height:\s*45%/, 'and never eats the panel');
assert.match(source, /\.dsh-note-composerRow\s*\{[^}]*justify-content:\s*flex-end/,
  'the send button sits at the right');
assert.match(source, /\.dsh-note-sendBtn\s*\{[^}]*border-radius:\s*var\(--dsw-radius-md/,
  'and is a rectangle, not a circle');
assert.match(source, /\.dsh-note-toolNote\s*\{/, 'the toolbar can carry the inherited count');

// The composer copies the host composer's card and its send button.
assert.match(source, /\.dsh-note-composer\s*\{[^}]*font-size:\s*var\(--dsh-content-font-size, 14px\)/,
  'the composer uses the conversation font size');
assert.match(source, /\.dsh-note-composer\s*\{[^}]*background:\s*var\(--dsw-specific-input-major/,
  'and the composer card fill');
assert.match(source, /\.dsh-note-composer\s*\{[^}]*border-radius:\s*var\(--dsw-radius-panel/,
  'and the composer card radius');
assert.match(source, /\.dsh-note-sendBtn\s*\{[^}]*background:\s*var\(--dsw-alias-button-info-fill\)/,
  'the send button uses the composer primary fill');
assert.match(source, /\.dsh-note-sendBtn\s*\{[^}]*height:\s*32px/, 'and a composer-sized button');
// The new-chat composer card stands twice its old height (the textarea inside it
// stretches), while a created side chat keeps the host composer as the host
// draws it. A long quote scrolls either composer to its end.
assert.match(source, /\.dsh-note-composer\s*\{[^}]*min-height:\s*172px/, 'the new-chat card is twice as tall');
assert.match(source, /\.dsh-note-input\s*\{[^}]*min-height:\s*72px/, 'with a textarea that fills it');
assert.ok(!source.includes('[data-sidebar-right-session] [data-composer-input]'),
  'the created side chat keeps the host composer untouched');
assert.ok(source.includes('function scrollComposerToEnd'), 'a composer keeps the end of a long quote in view');
assert.ok(source.includes('node.scrollTop = node.scrollHeight'), 'the panel composer scrolls to its end');
assert.ok(source.includes('M8.3125 0.980183C8.66767 1.0531'), 'with the composer arrow glyph');
assert.ok(find(bareTree, (node) => node.type === 'svg') !== undefined, 'the panel renders the send icon');

// The body the marking reads only renders once the child's retain lands, so the
// marking effect must run again then, or the toggle never appears.
assert.ok(source.includes('}, [boundaryTurn, childId, first, reference]);'),
  'the inherited marking re-runs once the conversation body mounts');

// The inherited prefix is folded by CSS alone, so it stays folded through
// re-renders and copied/moved nodes.
assert.match(
  source,
  /\.dsh-note-sideBody\[data-dsh-sidechat-collapsed\]\s*\[data-dsh-sidechat-inherited\]\s*\{\s*display:\s*none;\s*\}/,
  'the inherited prefix has a collapse rule',
);

console.log('ok — dsh-annotate-sidechat client bundle');

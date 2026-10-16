/**
 * Client half of `dsh-annotate-sidechat`.
 *
 * One flow, three steps:
 *
 *   select assistant reply text  →  「注解」popover  →  注解编辑器
 *                                                       →  fork + right-sidebar side chat
 *
 * The side chat is a real `sessions.fork` child of the session on screen,
 * opened as a `sidebar.right.pane.tab` page and rendered through the host's own
 * `sidebar.chat.conversation` slot, so the panel body IS the shipped
 * conversation (message stream + composer). The annotation lands in that
 * panel's composer as a draft; the user sends it.
 *
 * Everything is additive: the selection layer degrades to "no popover" if the
 * host's chat DOM markers move, and the side-chat leg degrades to "annotation
 * kept in the editor" if the sidebar page seat or the input machine is absent.
 * No annotation state is persisted — nothing is left behind in the reply.
 */
window.__ModuleLoader__.load({
  id: 'dsh-annotate-sidechat',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'annotateSidechat';

    const zh = {
      'action.annotate': '注解',
      'editor.title': '注解',
      'editor.placeholder': '写下你的注解…（Enter 发送到侧边对话，Esc 取消）',
      'editor.send': '发送到侧边对话',
      'editor.cancel': '取消',
      'editor.quoteAria': '引用的原文',
      'editor.hint': 'Enter 发送 · Shift+Enter 换行 · Esc 取消',
      'tab.title': '注解',
      'sideChat.empty': '无法打开侧边对话。',
      'sideChat.working': '正在创建侧边对话…',
    };

    const en = {
      'action.annotate': 'Annotate',
      'editor.title': 'Annotation',
      'editor.placeholder': 'Write your annotation… (Enter sends to the side chat, Esc cancels)',
      'editor.send': 'Send to side chat',
      'editor.cancel': 'Cancel',
      'editor.quoteAria': 'Quoted reply text',
      'editor.hint': 'Enter sends · Shift+Enter newline · Esc cancels',
      'tab.title': 'Annotation',
      'sideChat.empty': 'The side chat could not be opened.',
      'sideChat.working': 'Creating the side chat…',
    };

    /** Host chat DOM marker for one assistant step (internal seam, verified live). */
    const ASSISTANT_STEP = '[data-chat-flow-kind="assistant-step"]';
    /** Conversation root carrying the session id. */
    const CONVERSATION = '[data-conversation-session]';
    /** Controls and code chrome never become quoted text. */
    const NON_QUOTE = 'button, [role="button"], input, textarea, select, [contenteditable="true"], [data-code-block-banner]';
    /** Marker on our own overlay DOM — the selection layer ignores it. */
    const OURS = 'data-dsh-annotate-sidechat';
    /** Tab type identity: the `sidebar.right.pane.tab` key and the page kind. */
    const TAB_ID = 'dsh-annotate-sidechat:note';
    const TAB_KIND = 'annotate-sidechat-note';
    /** Quote kept in the first message; long selections are elided. */
    const QUOTE_MAX = 300;

    // ── host reads ──────────────────────────────────────────────────────────

    function currentSessionId(ctx) {
      try {
        const list = ctx.sessions.list.getSnapshot();
        if (typeof list.current === 'string' && list.current !== '') return list.current;
      } catch (error) { /* the list may not be up yet — fall through */ }
      if (typeof document === 'undefined') return '';
      const view = document.querySelector(CONVERSATION);
      return view === null ? '' : (view.dataset.conversationSession || '');
    }

    function currentCwd(ctx, sessionId) {
      try {
        const row = ctx.sessions.list.getSnapshot().byId[sessionId];
        return row !== null && row !== undefined && typeof row.cwd === 'string' && row.cwd !== '' ? row.cwd : undefined;
      } catch (error) { return undefined; }
    }

    function sidebarRightOf(ctx) {
      try {
        const face = ctx.get('sidebarRight');
        return face !== null && face !== undefined && typeof face.openTab === 'function' ? face : undefined;
      } catch (error) { return undefined; }
    }

    /** True once the conversation content view has mounted in the document. */
    function conversationMounted() {
      try { return document.querySelector('[data-chat-flow-kind]') !== null; } catch (error) { return false; }
    }

    // ── selection capture ───────────────────────────────────────────────────

    function elementOf(node) {
      return node instanceof Element ? node : node.parentElement;
    }

    function inNonQuote(node) {
      const element = elementOf(node);
      return element === null || element.closest(NON_QUOTE) !== null;
    }

    /**
     * The assistant step owning `node`, or null when the node is outside one,
     * inside the right sidebar, inside our own overlay, or still streaming.
     */
    function stepOf(node) {
      const element = elementOf(node);
      if (element === null || element.closest('[' + OURS + ']') !== null) return null;
      const step = element.closest(ASSISTANT_STEP);
      if (step === null) return null;
      if (step.closest('[data-sidebar-right], [data-sidebar-chat]') !== null) return null;
      if (step.hasAttribute('data-streaming') || step.querySelector('[data-streaming]') !== null) return null;
      return step;
    }

    /** The selected text, block-aware, with nothing from NON_QUOTE. */
    function selectionText(range) {
      const fragment = range.cloneContents();
      for (const element of fragment.querySelectorAll(NON_QUOTE)) element.remove();
      const textOf = (node) => {
        if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
        if (node instanceof Element && node.tagName === 'BR') return '\n';
        const inner = Array.from(node.childNodes).map(textOf).join('');
        return node instanceof Element && /^(P|DIV|LI|PRE|BLOCKQUOTE|H[1-6])$/.test(node.tagName) ? inner + '\n' : inner;
      };
      return textOf(fragment).replace(/\n{3,}/g, '\n\n').trim();
    }

    /** One valid annotation target: the assistant step plus the selected text. */
    function capture() {
      let selection;
      try { selection = window.getSelection(); } catch (error) { return null; }
      if (selection === null || selection.isCollapsed || selection.rangeCount === 0) return null;
      const range = selection.getRangeAt(0);
      const common = elementOf(range.commonAncestorContainer);
      if (common === null || inNonQuote(range.startContainer) || inNonQuote(range.endContainer)) return null;
      const step = stepOf(common);
      if (step === null) return null;
      const text = selectionText(range);
      if (text === '') return null;
      const rect = range.getBoundingClientRect();
      return { step: step, text: text, rect: rect };
    }

    // ── side chat ───────────────────────────────────────────────────────────

    /**
     * The host's per-session input machine for a retained child session:
     * `sessions.scope` → `conversation.input.for`. Undefined while the
     * generation or its composer shell is not up yet.
     */
    function inputOf(ctx, childId) {
      try {
        const scope = ctx.sessions.scope(childId);
        if (scope === undefined) return undefined;
        const conversation = ctx.get('conversation');
        if (conversation === null || conversation === undefined || !conversation.input) return undefined;
        const input = conversation.input.for(scope);
        return input !== undefined && input !== null && typeof input.setDraft === 'function' ? input : undefined;
      } catch (error) { return undefined; }
    }

    /**
     * Write the annotation into the child's composer draft without clobbering
     * text the user already typed. The composer shell appears only after the
     * sidebar panel mounts, so this retries for a while and gives up silently —
     * the annotation stays in the editor if it never lands.
     */
    function seedDraft(ctx, childId, text, attempts) {
      const input = inputOf(ctx, childId);
      if (input !== undefined) {
        try {
          const draft = input.state.getSnapshot().draft;
          const next = typeof draft === 'string' && draft.trim() !== '' ? draft + '\n\n' + text : text;
          input.setDraft(next);
          if (typeof input.focus === 'function') input.focus();
          return;
        } catch (error) { /* the shell can vanish between reads — retry */ }
      }
      if (attempts > 0) setTimeout(() => seedDraft(ctx, childId, text, attempts - 1), 400);
    }

    /**
     * Fork the session on screen and reveal a side-chat page for the child in
     * the right sidebar, with `text` as the first draft. `existing` re-uses the
     * side chat already opened for that parent. Returns the child to remember,
     * or undefined when the host has no sidebar page seat.
     */
    async function openSideChat(ctx, parentId, text, existing) {
      const sidebar = sidebarRightOf(ctx);
      if (sidebar === undefined) return undefined;
      if (existing !== undefined) {
        seedDraft(ctx, existing.childId, text, 25);
        try { sidebar.focus(existing.tabId); } catch (error) { /* it may be closed */ }
        return existing;
      }
      const childId = await ctx.sessions.fork({ sessionId: parentId, increaseTitle: true });
      const cwd = currentCwd(ctx, parentId);
      // Retain the child generation so its input machine materializes with the
      // panel; the tab body takes its own reference for the panel's lifetime.
      let held;
      try { held = ctx.sessions.retain(childId, { source: 'sidebarChat' }); } catch (error) { held = undefined; }
      sidebar.openTab(TAB_KIND, { params: { childId: childId, cwd: cwd } });
      seedDraft(ctx, childId, text, 25);
      if (held !== undefined) setTimeout(() => { try { held.release(); } catch (error) { /* already gone */ } }, 30000);
      return { childId: childId, tabId: undefined };
    }

    function draftOf(text, quote) {
      const clipped = quote.length > QUOTE_MAX ? quote.slice(0, QUOTE_MAX) + '…' : quote;
      const quoted = clipped.split('\n').map((line) => '> ' + line).join('\n');
      return '针对这段回复：\n' + quoted + '\n\n我的注解：' + text;
    }

    /** `capture()` result + editor text → the draft the child composer receives. */
    function toDraft(snapshot, text) {
      return draftOf(text, snapshot.quote);
    }

    // ── the overlay ─────────────────────────────────────────────────────────

    const CSS = `
.dsh-note-fab, .dsh-note-card {
  position: fixed; z-index: 2147483000; box-sizing: border-box;
  font-family: inherit; font-size: 13px; line-height: 1.5;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-overlay);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
}
.dsh-note-fab { padding: 5px 10px; cursor: pointer; white-space: nowrap; }
.dsh-note-fab:hover { background: var(--dsw-alias-bg-layer-2); }
.dsh-note-card { width: 380px; max-width: min(380px, calc(100vw - 24px)); padding: 12px; }
.dsh-note-title { font-weight: 600; margin-bottom: 8px; }
.dsh-note-quote {
  margin: 0 0 8px; padding: 6px 8px; max-height: 96px; overflow: auto;
  font-size: 12px; color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-layer-2);
  border-left: 2px solid var(--dsw-alias-border-l2); border-radius: 4px;
  white-space: pre-wrap; word-break: break-word;
}
.dsh-note-input {
  display: block; width: 100%; box-sizing: border-box; min-height: 84px; resize: vertical;
  padding: 8px; font: inherit; color: inherit;
  background: var(--dsw-alias-bg-base);
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px;
}
.dsh-note-input:focus { outline: none; border-color: var(--dsw-alias-brand-primary); }
.dsh-note-row { display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 8px; }
.dsh-note-btn {
  flex: 0 0 auto; padding: 5px 12px; font: inherit; white-space: nowrap; cursor: pointer; border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary);
}
.dsh-note-btn:hover { background: var(--dsw-alias-bg-layer-2); }
.dsh-note-btn[disabled] { opacity: 0.5; cursor: default; }
.dsh-note-btn-primary {
  background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); color: #fff;
}
.dsh-note-btn-primary:hover { filter: brightness(1.05); }
.dsh-note-hint { margin-top: 6px; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.dsh-note-error { margin-top: 8px; font-size: 12px; color: var(--dsw-alias-state-error-primary); }
`;

    /** Keep one floating card inside the viewport, near the selection. */
    function place(element, x, y) {
      const width = element.offsetWidth || 380;
      const height = element.offsetHeight || 180;
      const left = Math.max(8, Math.min(x, window.innerWidth - width - 8));
      const top = y + height + 16 > window.innerHeight ? Math.max(8, y - height - 12) : y + 12;
      element.style.left = left + 'px';
      element.style.top = Math.min(top, window.innerHeight - height - 8) + 'px';
    }

    /** Tiny external store: one mutable snapshot, `useSyncExternalStore` on top. */
    function createStore(initial) {
      let snapshot = initial;
      const listeners = new Set();
      return {
        getSnapshot: () => snapshot,
        subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; },
        set(next) { snapshot = next; for (const fn of Array.from(listeners)) fn(); },
      };
    }

    /**
     * Install the selection popover: one React root on a host element in
     * `document.body`, plus document-level selection listeners. Returns the
     * disposer that removes listeners, the root, and the style tag.
     */
    function installOverlay(ctx, t) {
      // Required lazily: a module table without `react-dom/client` must not stop
      // the side-chat half from registering.
      const createRoot = require('react-dom/client').createRoot;
      const store = createStore({ pending: null, editor: null });
      const host = document.createElement('div');
      host.setAttribute(OURS, '');
      document.body.append(host);
      const style = document.createElement('style');
      style.dataset.plugin = 'dsh-annotate-sidechat';
      style.textContent = CSS;
      document.head.append(style);

      /** parent session id → the side chat opened for it. */
      const sideChats = new Map();
      const reactRoot = createRoot(host);

      /** Let the popover keep the selection: kill mousedown inside our own DOM. */
      function onMouseDown(event) {
        const target = event.target;
        if (!(target instanceof Element) || target.closest('[' + OURS + ']') === null) return;
        if (target.closest('.dsh-note-input') === null) event.preventDefault();
      }

      let debounce;
      const recompute = () => {
        const state = store.getSnapshot();
        if (state.editor !== null) return;              // the editor owns the popover
        const next = capture();
        if (next === null) {
          if (state.pending !== null) store.set({ pending: null, editor: null });
          return;
        }
        store.set({ pending: next, editor: null });
      };
      const schedule = () => {
        if (debounce !== undefined) clearTimeout(debounce);
        debounce = setTimeout(recompute, 150);
      };
      const onNativeMouseDown = (event) => {
        onMouseDown(event);
        const state = store.getSnapshot();
        if (state.editor === null && state.pending !== null && !(event.target instanceof Element && event.target.closest('[' + OURS + ']') !== null)) {
          store.set({ pending: null, editor: null });
        }
      };

      async function submit(text) {
        const state = store.getSnapshot();
        if (state.editor === null || state.editor.busy) return;
        const selection = state.editor.selection;
        const parentId = currentSessionId(ctx);
        if (parentId === '') {
          store.set({ pending: state.pending, editor: { selection: selection, busy: false, error: t('sideChat.empty') } });
          return;
        }
        store.set({ pending: state.pending, editor: { selection: selection, busy: true, error: '' } });
        try {
          const opened = await openSideChat(ctx, parentId, toDraft(selection, text), sideChats.get(parentId));
          if (opened === undefined) {
            store.set({ pending: state.pending, editor: { selection: selection, busy: false, error: t('sideChat.empty') } });
            return;
          }
          sideChats.set(parentId, opened);
          try { window.getSelection().removeAllRanges(); } catch (error) { /* nothing selected */ }
          store.set({ pending: null, editor: null });
        } catch (error) {
          store.set({
            pending: state.pending,
            editor: { selection: selection, busy: false, error: String((error && error.message) || error) },
          });
        }
      }

      reactRoot.render(h(Overlay, {
        t: t,
        store: store,
        open: (selection) => { store.set({ pending: selection, editor: { selection: selection, busy: false, error: '' } }); },
        close: () => { store.set({ pending: null, editor: null }); },
        submit: (text) => { void submit(text); },
      }));

      document.addEventListener('selectionchange', schedule);
      document.addEventListener('mouseup', schedule);
      document.addEventListener('keyup', schedule);
      document.addEventListener('mousedown', onNativeMouseDown, true);
      recompute();

      return () => {
        document.removeEventListener('selectionchange', schedule);
        document.removeEventListener('mouseup', schedule);
        document.removeEventListener('keyup', schedule);
        document.removeEventListener('mousedown', onNativeMouseDown, true);
        if (debounce !== undefined) clearTimeout(debounce);
        setTimeout(() => { reactRoot.unmount(); });   // same-frame unmount warns in React
        host.remove();
        style.remove();
      };
    }

    function Overlay(props) {
      const t = props.t;
      const state = React.useSyncExternalStore(
        (fn) => props.store.subscribe(fn),
        () => props.store.getSnapshot(),
      );
      const anchor = state.editor !== null ? state.editor.selection : state.pending;
      const cardRef = React.useRef(null);
      const fabRef = React.useRef(null);
      const editingRef = React.useRef(null);

      // Size is known only after mount; re-place whenever the anchor moves.
      React.useLayoutEffect(() => {
        const node = state.editor !== null ? cardRef.current : fabRef.current;
        if (node === null || anchor === null) return;
        place(node, state.editor !== null ? anchor.rect.left : anchor.rect.right - node.offsetWidth, anchor.rect.bottom);
      });

      const [text, setText] = React.useState('');
      const editor = state.editor;
      React.useEffect(() => {
        if (editingRef.current === editor) return;
        editingRef.current = editor;
        setText('');
      }, [editor]);

      if (editor !== null) {
        const submit = () => { if (!editor.busy) props.submit(text.trim()); };
        return h('div', {
          className: 'dsh-note-card', ref: cardRef, [OURS]: '',
          onKeyDown: (event) => {
            if (event.key === 'Escape') { event.stopPropagation(); props.close(); return; }
            if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit(); }
          },
        },
          h('div', { className: 'dsh-note-title' }, t('editor.title')),
          h('blockquote', { className: 'dsh-note-quote', 'aria-label': t('editor.quoteAria') }, editor.selection.quote),
          h('textarea', {
            className: 'dsh-note-input',
            autoFocus: true,
            placeholder: t('editor.placeholder'),
            value: text,
            disabled: editor.busy,
            onChange: (event) => setText(event.target.value),
          }),
          h('div', { className: 'dsh-note-row' },
            h('button', { className: 'dsh-note-btn', type: 'button', onClick: props.close }, t('editor.cancel')),
            h('button', {
              className: 'dsh-note-btn dsh-note-btn-primary', type: 'button',
              disabled: editor.busy, onClick: submit,
            }, t('editor.send')),
          ),
          h('div', { className: 'dsh-note-hint' }, t('editor.hint')),
          editor.error === '' ? null : h('div', { className: 'dsh-note-error' }, editor.error),
        );
      }

      if (state.pending === null) return null;
      const pending = state.pending;
      return h('button', {
        className: 'dsh-note-fab', ref: fabRef, type: 'button', [OURS]: '',
        onClick: () => props.open(pending),
      }, t('action.annotate'));
    }

    // ── the side-chat tab ───────────────────────────────────────────────────

    /**
     * One side-chat page body. It declares the host's `sidebar.chat.conversation`
     * child slot and wraps it in the framework `SessionProvider`, so the panel
     * renders the shipped conversation (message stream + composer) for the
     * forked child session instead of a hand-written panel.
     */
    function SideChatTab(props) {
      const t = props.t;
      const info = props.useTabInfo();
      const params = info.tab.navigation.params;
      const childId = params !== null && typeof params === 'object' ? params.childId : undefined;
      const cwd = params !== null && typeof params === 'object' ? params.cwd : undefined;
      const [reference, setReference] = React.useState(null);
      const [failed, setFailed] = React.useState(false);

      React.useEffect(() => {
        if (typeof childId !== 'string' || childId === '') { setFailed(true); return undefined; }
        let held;
        try {
          held = props.sessions.retain(childId, { source: 'sidebarChat', signal: info.tab.signal });
        } catch (error) {
          setFailed(true);
          return undefined;
        }
        setReference(held);
        return () => { try { held.release(); } catch (error) { /* already released */ } };
      }, [childId]);

      if (failed) return h('div', { style: { padding: '16px' } }, t('sideChat.empty'));
      if (reference === null) return h('div', { style: { padding: '16px', opacity: 0.6 } }, t('sideChat.working'));
      // `reference` IS the scope target (`SlotScopeTargetMap.session`); the
      // fork inherits the parent's cwd, so only a divergence needs carrying.
      if (cwd !== undefined) reference.cwd = cwd;
      return h('div', {
        [OURS]: '',
        style: { display: 'flex', width: '100%', height: '100%', minHeight: 0 },
      }, h(props.SessionProvider, { session: reference },
        props.renderSlot('sidebar.chat.conversation', {})));
    }

    /**
     * The panel registered into the host's `sidebar.chat.conversation` slot: the
     * standard session kit supplies `sessionId`, `useSession` and the factory
     * renderer the shipped conversation content needs.
     */
    function SideChatPanel(props) {
      if (typeof props.sessionId !== 'string' || props.sessionId === '') {
        return h('div', { style: { padding: '16px' } }, props.t('sideChat.empty'));
      }
      return props.renderFactorySlot('conversation.content',
        { variant: 'embedded', phase: 'active', hero: false },
        { slots: { views: (viewProps) => viewProps.renderSlot('conversation.session', { view: 'chat' }) } });
    }

    // ── registration ────────────────────────────────────────────────────────

    return {
      inject: ['sessions', 'slots', 'locale'],
      /** Pure formatting seam for the runnable check (`check.mjs`). */
      __test: { draftOf: draftOf, selectionText: selectionText, toDraft: toDraft },
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh: zh, en: en }), 'dsh-annotate-sidechat: dictionaries');
        const t = ctx.locale.bind(NS);

        // The overlay is inert until the conversation has mounted once, so a
        // cold page does not install listeners the host would never feed.
        ctx.effect(() => {
          if (conversationMounted()) return installOverlay(ctx, t);
          let dispose;
          const timer = setInterval(() => {
            if (!conversationMounted()) return;
            clearInterval(timer);
            dispose = installOverlay(ctx, t);
          }, 500);
          return () => { clearInterval(timer); if (dispose !== undefined) dispose(); };
        }, 'dsh-annotate-sidechat: overlay');

        // The right-sidebar page type + its body. Both wait for the host
        // service: `sidebarRightTabs` is provided a few seconds after the pane
        // slot is declared, so waiting on the slot would silently never register.
        ctx.effect(() => ctx.inject(['sidebarRightTabs'], (scope) => {
          const tabs = scope.get('sidebarRightTabs');
          if (tabs === undefined || tabs === null) return;
          const disposeType = tabs.register({
            id: TAB_ID,
            kind: TAB_KIND,
            priority: 'extension',
            multiple: true,
            title: () => t('tab.title'),
          });
          const disposeBody = ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
            name: 'sidebar.right.pane.tab',
            key: TAB_ID,
            children: { 'sidebar.chat.conversation': { kind: 'single', scope: 'session' } },
            locale: NS,
            inject: () => ({ sessions: ctx.sessions }),
          }, SideChatTab));
          const disposeChat = ctx.slots.inject('sidebar.chat.conversation', () => ctx.slots.register({
            name: 'sidebar.chat.conversation',
            locale: NS,
          }, SideChatPanel));
          return () => { disposeChat(); disposeBody(); disposeType(); };
        }), 'dsh-annotate-sidechat: side chat tab');
      },
    };
  },
});

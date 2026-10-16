/**
 * Client half of `dsh-annotate-sidechat`.
 *
 * One gesture, two destinations: select text in an assistant reply of the main
 * chat and a two-item menu opens where the selection is.
 *
 *   Send to main chat  →  the located quote is appended to the main composer
 *   Send to side chat  →  the same quote reaches a side-chat composer in the
 *                         right sidebar, opening one when none is up
 *
 * The quote is English-located — `Quoted from the assistant's reply (turn 3,
 * paragraph 2):` followed by the block-quoted passage — so the receiver knows
 * which spot of the transcript is being talked about.
 *
 * The side chat is a real `sessions.fork` child of the session on screen, but
 * it is created only when its composer is sent: until then the panel holds a
 * plain draft and no chat exists in the session list. The child is titled
 * `sidechat-N` and is rendered by the host's own `sidebar.chat.conversation`
 * slot, so the panel body IS the shipped conversation.
 *
 * Everything is additive: the selection layer degrades to "no menu" if the
 * host's chat DOM markers move, and the side-chat leg degrades to an error line
 * if the sidebar page seat or the input machine is absent. No annotation state
 * is persisted — nothing is left behind in the reply.
 *
 * Sidebar selections are the host's: this module never marks the panel body as
 * its own DOM and never swallows its mousedown, so text in the side chat stays
 * selectable and copyable.
 */
window.__ModuleLoader__.load({
  id: 'dsh-annotate-sidechat',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'annotateSidechat';

    const zh = {
      'action.toMain': '发送到主对话',
      'action.toSide': '发送到侧边对话',
      'guide.description': '不引用也能直接输入；发送后新建 sidechat- 对话',
      'mainChat.failed': '无法写入主对话的输入框。',
      'sideChat.pendingTitle': '新建侧边对话',
      'sideChat.pendingHint': '可直接输入，不必引用；发送后新建以 sidechat- 开头的对话',
      'sideChat.pendingPlaceholder': '输入内容…',
      'sideChat.send': '发送',
      'sideChat.empty': '无法打开侧边对话。',
      'sideChat.working': '正在创建侧边对话…',
      'tab.title': '侧边对话',
    };

    const en = {
      'action.toMain': 'Send to main chat',
      'action.toSide': 'Send to side chat',
      'guide.description': 'Type directly — no quote needed; sending creates a sidechat- chat',
      'mainChat.failed': 'The main chat composer could not be reached.',
      'sideChat.pendingTitle': 'New side chat',
      'sideChat.pendingHint': 'Type directly, quoting is optional; sending creates a chat titled sidechat-…',
      'sideChat.pendingPlaceholder': 'Type your message…',
      'sideChat.send': 'Send',
      'sideChat.empty': 'The side chat could not be opened.',
      'sideChat.working': 'Creating the side chat…',
      'tab.title': 'Side chat',
    };

    // ── host seams ──────────────────────────────────────────────────────────

    /** Host chat DOM marker for one assistant step (internal seam, verified live). */
    const ASSISTANT_STEP = '[data-chat-flow-kind="assistant-step"]';
    /** Conversation root carrying the session id. */
    const CONVERSATION = '[data-conversation-session]';
    /** Every right-sidebar surface: sessions, the expanded panel, and one tab body. */
    const SIDEBAR = '[data-sidebar-right-session], [data-sidebar-right-open], [data-sidebar-right-tab]';
    /** Controls and code chrome never become quoted text. */
    const NON_QUOTE = 'button, [role="button"], input, textarea, select, [contenteditable="true"], [data-code-block-banner]';
    /** Marker on our own floating DOM — the selection layer and the mouse guard read it. */
    const OURS = 'data-dsh-annotate-sidechat';
    /** Tab type identity: the `sidebar.right.pane.tab` key and the page kind. */
    const TAB_ID = 'dsh-annotate-sidechat:note';
    const TAB_KIND = 'annotate-sidechat-note';
    /** Side-chat titles all start here, which is also how they are counted. */
    const TITLE_PREFIX = 'sidechat-';
    /** Block containers the location line can name. */
    const BLOCKS = 'p, li, pre, blockquote, h1, h2, h3, h4, h5, h6, td, th';
    const BLOCK_LABELS = {
      p: 'paragraph',
      li: 'list item',
      pre: 'code block',
      blockquote: 'quote',
      td: 'table cell',
      th: 'table cell',
    };

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

    /**
     * The host's per-session input machine: `sessions.scope` →
     * `conversation.input.for`. Undefined while the generation or its composer
     * shell is not up yet.
     */
    function inputOf(ctx, sessionId) {
      try {
        const scope = ctx.sessions.scope(sessionId);
        if (scope === undefined) return undefined;
        const conversation = ctx.get('conversation');
        if (conversation === null || conversation === undefined || !conversation.input) return undefined;
        const input = conversation.input.for(scope);
        return input !== undefined && input !== null && typeof input.setDraft === 'function' ? input : undefined;
      } catch (error) { return undefined; }
    }

    /**
     * Append `text` to one session's composer draft without clobbering what the
     * user already typed. The composer shell appears only after the panel (or
     * the main column) mounts, so this retries for a while.
     * @returns whether the draft landed.
     */
    function writeDraft(ctx, sessionId, text, attempts) {
      return new Promise((resolve) => {
        const attempt = (left) => {
          const input = inputOf(ctx, sessionId);
          if (input !== undefined) {
            try {
              const draft = input.state.getSnapshot().draft;
              input.setDraft(appendDraft(draft, text));
              if (typeof input.focus === 'function') input.focus();
              resolve(true);
              return;
            } catch (error) { /* the shell can vanish between reads — retry */ }
          }
          if (left > 0) { setTimeout(() => attempt(left - 1), 200); return; }
          resolve(false);
        };
        attempt(attempts);
      });
    }

    // ── selection capture ───────────────────────────────────────────────────

    function elementOf(node) {
      return node instanceof Element ? node : node.parentElement;
    }

    function inNonQuote(node) {
      const element = elementOf(node);
      return element === null || element.closest(NON_QUOTE) !== null;
    }

    /** The turn the reply belongs to, as the host's own turn navigation numbers it. */
    function turnOf(step) {
      const owner = step.closest('[data-chat-turn]');
      const raw = owner === null ? null : owner.getAttribute('data-chat-turn');
      const turn = Number(raw);
      return raw !== null && raw !== '' && Number.isSafeInteger(turn) && turn > 0 ? turn : undefined;
    }

    /** `response` for the answer, `reasoning` for the thinking block, else undefined. */
    function partOf(step) {
      const holder = step.closest('[data-chat-group-part]');
      const part = holder === null ? undefined : holder.getAttribute('data-chat-group-part');
      return part === 'reasoning' || part === 'response' ? part : undefined;
    }

    /** `paragraph 2` / `code block 1` — the selection's block inside its reply. */
    function blockLabel(step, range) {
      const start = elementOf(range.startContainer);
      if (start === null) return undefined;
      const block = start.closest(BLOCKS);
      if (block === null || !step.contains(block)) return undefined;
      const tag = block.tagName.toLowerCase();
      const siblings = Array.from(step.querySelectorAll(BLOCKS)).filter((candidate) => candidate.tagName.toLowerCase() === tag);
      const index = siblings.indexOf(block);
      if (index < 0) return undefined;
      const label = /^h[1-6]$/.test(tag) ? 'heading' : BLOCK_LABELS[tag];
      return (label === undefined ? 'block' : label) + ' ' + (index + 1);
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
      if (step.closest(SIDEBAR) !== null) return null;
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

    /** One valid menu target: where it sits in the reply, the text, and its rect. */
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
      return {
        text: text,
        rect: range.getBoundingClientRect(),
        turn: turnOf(step),
        part: partOf(step),
        block: blockLabel(step, range),
      };
    }

    // ── the quote ───────────────────────────────────────────────────────────

    /** English pointer at the quoted spot, e.g. `Quoted from the assistant's reply (turn 3, paragraph 2):`. */
    function locationLine(snapshot) {
      const where = snapshot.part === 'reasoning' ? "the assistant's reasoning" : "the assistant's reply";
      const at = [];
      if (typeof snapshot.turn === 'number') at.push('turn ' + snapshot.turn);
      if (typeof snapshot.block === 'string' && snapshot.block !== '') at.push(snapshot.block);
      return at.length === 0 ? 'Quoted from ' + where + ':' : 'Quoted from ' + where + ' (' + at.join(', ') + '):';
    }

    /** What both menu entries carry: the located quote, as a block quote. */
    function quoteText(snapshot) {
      const quoted = snapshot.text.split('\n').map((line) => '> ' + line).join('\n');
      return locationLine(snapshot) + '\n' + quoted;
    }

    /** `draft` + one blank line + `text`; `text` alone when the draft is empty. */
    function appendDraft(draft, text) {
      return typeof draft === 'string' && draft.trim() !== '' ? draft + '\n\n' + text : text;
    }

    // ── side chat ───────────────────────────────────────────────────────────

    /**
     * One side chat per parent session: its child (once the panel was sent),
     * the panel's draft while it is still pending, and its own busy/error state.
     * Entries are replaced on write, so every read is a stable snapshot.
     */
    function createSideChats() {
      const entries = new Map();
      const listeners = new Set();
      const EMPTY = { childId: null, draft: '', busy: false, error: '' };
      return {
        subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; },
        get(parentId) {
          if (typeof parentId !== 'string' || parentId === '') return EMPTY;
          return entries.get(parentId) ?? EMPTY;
        },
        /** Install the tab-restored state once; an entry already in hand wins. */
        ensure(parentId, seed) {
          if (typeof parentId !== 'string' || parentId === '') return EMPTY;
          const existing = entries.get(parentId);
          if (existing !== undefined) return existing;
          const entry = { ...EMPTY, ...seed };
          entries.set(parentId, entry);
          return entry;
        },
        patch(parentId, next) {
          if (typeof parentId !== 'string' || parentId === '') return;
          entries.set(parentId, { ...(entries.get(parentId) ?? EMPTY), ...next });
          for (const fn of Array.from(listeners)) fn();
        },
      };
    }

    /** `sidechat-<n>`, where n counts the parent's existing side chats. */
    function nextSideChatTitle(ctx, parentId) {
      let count = 0;
      try {
        const list = ctx.sessions.list.getSnapshot();
        for (const id of list.ids) {
          const row = list.byId[id];
          if (row === undefined || row === null || row.parentId !== parentId) continue;
          if (typeof row.title === 'string' && row.title.startsWith(TITLE_PREFIX)) count += 1;
        }
      } catch (error) { /* the list may not be up yet — start at 1 */ }
      return TITLE_PREFIX + (count + 1);
    }

    /** Open (or reveal) the side-chat page for one parent session. */
    function revealSideChatTab(ctx, parentId, entry) {
      const sidebar = sidebarRightOf(ctx);
      if (sidebar === undefined) return false;
      const cwd = currentCwd(ctx, parentId);
      sidebar.openTab(TAB_KIND, {
        params: {
          parentId: parentId,
          ...entry.childId === null ? {} : { childId: entry.childId },
          ...entry.draft === '' ? {} : { draft: entry.draft },
          ...cwd === undefined ? {} : { cwd: cwd },
        },
      });
      return true;
    }

    /**
     * Fork `parentId`, title the child `sidechat-N`, and send `text` as its
     * first message. This is the only place a side chat is created, which is why
     * nothing shows up in the session list before the panel is sent.
     * @returns the child session id.
     */
    async function createSideChat(ctx, parentId, text) {
      const childId = await ctx.sessions.fork({ sessionId: parentId });
      const reference = ctx.sessions.retain(childId, { source: 'sidebarChat' });
      let handedOver = false;
      try {
        await reference.ready;
        const session = reference.binding.session;
        // Rename first: an explicit title pins the session against automatic
        // title generation from the first message.
        const renamed = await session.rename(nextSideChatTitle(ctx, parentId));
        if (!renamed.ok) throw new Error(renamed.error.message);
        const submission = session.beginSubmission({ mode: 'queue', text: text, attachments: [] });
        const sent = await session.prompt([{ type: 'text', text: text }], 'queue', undefined, submission.requestId);
        if (!sent.ok) {
          submission.abandon();
          throw new Error(sent.error.message);
        }
        handedOver = true;
      } finally {
        // The panel retains the child for its own lifetime; hold ours briefly so
        // the generation survives the hand-over, then release.
        if (handedOver) setTimeout(() => { try { reference.release(); } catch (error) { /* already released */ } }, 30000);
        else { try { reference.release(); } catch (error) { /* already released */ } }
      }
      return childId;
    }

    /** Send the pending panel: this is what creates the chat. */
    async function submitSideChat(ctx, chats, parentId) {
      if (typeof parentId !== 'string' || parentId === '') return;
      const entry = chats.get(parentId);
      const text = entry.draft.trim();
      if (text === '' || entry.busy) return;
      chats.patch(parentId, { busy: true, error: '' });
      try {
        const childId = await createSideChat(ctx, parentId, text);
        chats.patch(parentId, { childId: childId, draft: '', busy: false, error: '' });
        // Record the child in the tab's own navigation params so a reloaded page
        // restores the conversation instead of an empty composer.
        revealSideChatTab(ctx, parentId, chats.get(parentId));
      } catch (error) {
        chats.patch(parentId, { busy: false, error: String((error && error.message) || error) });
      }
    }

    // ── the overlay ─────────────────────────────────────────────────────────

    const CSS = `
.dsh-note-card {
  position: fixed; z-index: 2147483000; box-sizing: border-box;
  display: flex; flex-direction: column; gap: 6px; padding: 6px;
  font-family: inherit; font-size: 13px; line-height: 1.5;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-overlay);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
}
.dsh-note-menu { display: flex; align-items: center; gap: 6px; }
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
.dsh-note-btn-primary:hover {
  /* The generic hover rule above would repaint this button with a light layer
     fill; restate the brand fill, then darken it a touch where color-mix lands. */
  background: var(--dsw-alias-brand-primary);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 88%, #000);
  border-color: var(--dsw-alias-brand-primary); color: #fff;
}
.dsh-note-panel {
  box-sizing: border-box; display: flex; flex-direction: column; gap: 8px;
  width: 100%; height: 100%; min-height: 0; padding: 12px;
  font-family: inherit; font-size: 13px; line-height: 1.5;
  color: var(--dsw-alias-label-primary);
}
.dsh-note-panelTitle { font-weight: 600; }
.dsh-note-input {
  display: block; box-sizing: border-box; width: 100%; min-height: 84px; flex: 1 1 auto; resize: none;
  padding: 8px; font: inherit; color: inherit;
  background: var(--dsw-alias-bg-base);
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px;
}
.dsh-note-input:focus { outline: none; border-color: var(--dsw-alias-brand-primary); }
.dsh-note-row { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
.dsh-note-hint { font-size: 11px; color: var(--dsw-alias-label-secondary); }
.dsh-note-error { font-size: 12px; color: var(--dsw-alias-state-error-primary); }
`;

    /** Keep one floating card inside the viewport, near the selection. */
    function place(element, x, y) {
      const width = element.offsetWidth || 240;
      const height = element.offsetHeight || 40;
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
     * Install the selection menu: one React root on a host element in
     * `document.body`, plus document-level selection listeners. Returns the
     * disposer that removes listeners, the root, and the style tag.
     */
    function installOverlay(ctx, t, chats) {
      // Required lazily: a module table without `react-dom/client` must not stop
      // the side-chat half from registering.
      const createRoot = require('react-dom/client').createRoot;
      const store = createStore({ pending: null, error: '' });
      const host = document.createElement('div');
      host.setAttribute(OURS, '');
      document.body.append(host);
      const style = document.createElement('style');
      style.dataset.plugin = 'dsh-annotate-sidechat';
      style.textContent = CSS;
      document.head.append(style);
      const reactRoot = createRoot(host);

      /**
       * Only our own floating card keeps the selection alive across a mousedown.
       * Everything else — the conversation, the side-chat panel, its composer —
       * belongs to the host and must keep its normal focus and selection.
       */
      function onMouseDown(event) {
        const target = event.target;
        if (!(target instanceof Element) || target.closest('.dsh-note-card') === null) return;
        if (target.closest('input, textarea, [contenteditable="true"]') !== null) return;
        event.preventDefault();
      }

      let debounce;
      const recompute = () => {
        const next = capture();
        if (next === null) {
          if (store.getSnapshot().pending !== null) store.set({ pending: null, error: '' });
          return;
        }
        store.set({ pending: next, error: '' });
      };
      const schedule = () => {
        if (debounce !== undefined) clearTimeout(debounce);
        debounce = setTimeout(recompute, 150);
      };
      const onNativeMouseDown = (event) => {
        onMouseDown(event);
        const target = event.target;
        const insideCard = target instanceof Element && target.closest('.dsh-note-card') !== null;
        if (!insideCard && store.getSnapshot().pending !== null) store.set({ pending: null, error: '' });
      };

      const clearSelection = () => {
        try { window.getSelection().removeAllRanges(); } catch (error) { /* nothing selected */ }
      };

      /** Send to main chat: append the quote to the current session's composer. */
      async function toMain(selection) {
        const parentId = currentSessionId(ctx);
        if (parentId === '') { store.set({ pending: selection, error: t('mainChat.failed') }); return; }
        const landed = await writeDraft(ctx, parentId, quoteText(selection), 10);
        if (!landed) { store.set({ pending: selection, error: t('mainChat.failed') }); return; }
        clearSelection();
        store.set({ pending: null, error: '' });
      }

      /** Send to side chat: same quote, into the side chat's own composer. */
      function toSide(selection) {
        const parentId = currentSessionId(ctx);
        if (parentId === '') { store.set({ pending: selection, error: t('sideChat.empty') }); return; }
        // One trailing newline, so the composer is ready for the user to type
        // their own line right under the quote.
        const text = quoteText(selection) + '\n';
        const entry = chats.get(parentId);
        if (typeof entry.childId === 'string' && entry.childId !== '') {
          // The chat exists: the quote joins that conversation's composer draft.
          void writeDraft(ctx, entry.childId, text, 10);
        } else {
          chats.patch(parentId, { draft: appendDraft(entry.draft, text), error: '' });
        }
        if (!revealSideChatTab(ctx, parentId, chats.get(parentId))) {
          store.set({ pending: selection, error: t('sideChat.empty') });
          return;
        }
        clearSelection();
        store.set({ pending: null, error: '' });
      }

      reactRoot.render(h(Overlay, {
        t: t,
        store: store,
        toMain: (selection) => { void toMain(selection); },
        toSide: (selection) => { toSide(selection); },
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

    /** The two-item menu, anchored under the selection. */
    function Overlay(props) {
      const t = props.t;
      const state = React.useSyncExternalStore(
        (fn) => props.store.subscribe(fn),
        () => props.store.getSnapshot(),
      );
      const selection = state.pending;
      const cardRef = React.useRef(null);

      // Size is known only after mount; re-place whenever the anchor moves.
      React.useLayoutEffect(() => {
        const node = cardRef.current;
        if (node === null || selection === null) return;
        place(node, selection.rect.left, selection.rect.bottom);
      });

      if (selection === null) return null;
      return h('div', { className: 'dsh-note-card', ref: cardRef, [OURS]: '' },
        h('div', { className: 'dsh-note-menu' },
          h('button', {
            className: 'dsh-note-btn', type: 'button',
            onClick: () => props.toMain(selection),
          }, t('action.toMain')),
          h('button', {
            className: 'dsh-note-btn dsh-note-btn-primary', type: 'button',
            onClick: () => props.toSide(selection),
          }, t('action.toSide')),
        ),
        state.error === '' ? null : h('div', { className: 'dsh-note-error' }, state.error),
      );
    }

    // ── the side-chat tab ───────────────────────────────────────────────────

    /**
     * One side-chat page body. Before the panel is sent it is a plain composer —
     * holding a quote when the menu opened it, empty when the sidebar's guide
     * opened it, since a side chat needs no quote. Once sent it declares the
     * host's `sidebar.chat.conversation` child slot and wraps it in the framework
     * `SessionProvider`, so the panel renders the shipped conversation (message
     * stream + composer) for the forked child.
     */
    function SideChatTab(props) {
      const t = props.t;
      const info = props.useTabInfo();
      const params = info.tab.navigation.params;
      const bag = params !== null && typeof params === 'object' ? params : {};
      // `params.parentId` is the session that opened the page from the menu; a
      // page opened from the sidebar guide names no parent, so the pane's own
      // session — the framework-resolved `sessionId` — is the side chat's parent.
      const paneSessionId = typeof props.sessionId === 'string' ? props.sessionId : '';
      const parentId = typeof bag.parentId === 'string' && bag.parentId !== '' ? bag.parentId : paneSessionId;
      // A tab restored from a previous page load carries its child and draft in
      // its own navigation params; the store is authoritative once it has an entry.
      props.chats.ensure(parentId, {
        childId: typeof bag.childId === 'string' ? bag.childId : null,
        draft: typeof bag.draft === 'string' ? bag.draft : '',
      });
      const entry = React.useSyncExternalStore(
        (fn) => props.chats.subscribe(fn),
        () => props.chats.get(parentId),
      );
      const childId = entry.childId;
      const cwd = typeof bag.cwd === 'string' ? bag.cwd : undefined;
      const [reference, setReference] = React.useState(null);
      const [failed, setFailed] = React.useState(false);

      React.useEffect(() => {
        if (typeof childId !== 'string' || childId === '') { setReference(null); setFailed(false); return undefined; }
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

      if (typeof childId === 'string' && childId !== '') {
        if (failed) return h('div', { style: { padding: '16px' } }, t('sideChat.empty'));
        if (reference === null) return h('div', { style: { padding: '16px', opacity: 0.6 } }, t('sideChat.working'));
        // `reference` IS the scope target (`SlotScopeTargetMap.session`); the
        // fork inherits the parent's cwd, so only a divergence needs carrying.
        if (cwd !== undefined) reference.cwd = cwd;
        return h('div', {
          style: { display: 'flex', width: '100%', height: '100%', minHeight: 0 },
        }, h(props.SessionProvider, { session: reference },
          props.renderSlot('sidebar.chat.conversation', {})));
      }

      const send = () => props.sendSideChat(parentId);
      return h('div', { className: 'dsh-note-panel', [OURS]: '' },
        h('div', { className: 'dsh-note-panelTitle' }, t('sideChat.pendingTitle')),
        h('div', { className: 'dsh-note-hint' }, t('sideChat.pendingHint')),
        h('textarea', {
          className: 'dsh-note-input',
          value: entry.draft,
          disabled: entry.busy,
          placeholder: t('sideChat.pendingPlaceholder'),
          onChange: (event) => props.chats.patch(parentId, { draft: event.target.value, error: '' }),
          onKeyDown: (event) => {
            if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); }
          },
        }),
        h('div', { className: 'dsh-note-row' },
          h('button', {
            className: 'dsh-note-btn dsh-note-btn-primary', type: 'button',
            disabled: entry.busy || entry.draft.trim() === '',
            onClick: send,
          }, t('sideChat.send')),
        ),
        entry.error === '' ? null : h('div', { className: 'dsh-note-error' }, entry.error),
      );
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
      /** Pure formatting plus the selection rule, for the runnable check (`check.mjs`). */
      __test: {
        locationLine: locationLine,
        quoteText: quoteText,
        appendDraft: appendDraft,
        selectionText: selectionText,
        capture: capture,
      },
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh: zh, en: en }), 'dsh-annotate-sidechat: dictionaries');
        const t = ctx.locale.bind(NS);
        const chats = createSideChats();

        // The overlay is inert until the conversation has mounted once, so a
        // cold page does not install listeners the host would never feed.
        ctx.effect(() => {
          if (conversationMounted()) return installOverlay(ctx, t, chats);
          let dispose;
          const timer = setInterval(() => {
            if (!conversationMounted()) return;
            clearInterval(timer);
            dispose = installOverlay(ctx, t, chats);
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
            // One side chat per session pane: opening again reveals the same page
            // and refreshes its navigation params instead of stacking a second one.
            multiple: false,
            title: () => t('tab.title'),
            // The guide (the strip's add control / empty column) is how a side
            // chat is opened without quoting anything — picking it opens the page
            // with no params, and the body falls back to the pane's session.
            guide: [{
              id: TAB_ID,
              order: 120,
              title: () => t('tab.title'),
              description: () => t('guide.description'),
            }],
          });
          const disposeBody = ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
            name: 'sidebar.right.pane.tab',
            key: TAB_ID,
            children: { 'sidebar.chat.conversation': { kind: 'single', scope: 'session' } },
            locale: NS,
            // Session-scoped slots hand the injector the pane's own session id.
            inject: (sessionId) => ({
              sessions: ctx.sessions,
              chats: chats,
              sessionId: sessionId,
              sendSideChat: (parentId) => { void submitSideChat(ctx, chats, parentId); },
            }),
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

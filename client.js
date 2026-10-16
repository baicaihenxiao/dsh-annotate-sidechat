/**
 * Client half of `dsh-annotate-sidechat`.
 *
 * One gesture, two destinations: select text in an assistant reply of the main
 * chat and a two-item menu opens where the selection is.
 *
 *   Send to main chat  →  the located quote is appended to the main composer
 *   Send to side chat  →  the same quote reaches a side-chat composer in the
 *                         right sidebar: the one that is open, or a new one
 *
 * The quote is English-located — `Quoted from the assistant's reply (turn 3,
 * paragraph 2):` followed by the block-quoted passage — so the receiver knows
 * which spot of the transcript is being talked about.
 *
 * A side chat is a real `sessions.fork` child of its main chat, created only
 * when its composer is sent: until then the page holds a plain draft and no
 * chat exists in the session list. The child is titled
 * `sidechat-<n>-<main chat title>` and rendered by the host's own
 * `sidebar.chat.conversation` slot, so the panel body IS the shipped
 * conversation.
 *
 * Several side chats can be open at once (each page carries its own instance
 * id). Every side chat keeps its inherited transcript folded away — the fork's
 * copy of the main chat — with a toolbar toggle to show it, plus `Reset side
 * chat` (archive the session, start over in place) and `New side chat`.
 *
 * Everything is additive: the selection layer degrades to "no menu" if the
 * host's chat DOM markers move, and the side-chat leg degrades to an error line
 * if the sidebar page seat or the input machine is absent. Nothing is written
 * back into the annotated reply.
 *
 * Sidebar selections are the host's: the panel never swallows its mousedown, so
 * text inside a side chat stays selectable and copyable.
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
      'sideChat.chip': 'sidechat-{index}',
      'sideChat.hideInherited': '隐藏继承内容',
      'sideChat.inheritEmpty': '主对话还没有已完成的内容',
      'sideChat.inheritMore': '更早的 {messages} 条未显示',
      'sideChat.inherited': '继承自主对话 {turns} 轮',
      'sideChat.new': '新建',
      'sideChat.newHint': '再开一个侧边对话',
      'sideChat.pendingPlaceholder': '输入内容，发送后新建 sidechat- 对话…',
      'sideChat.reset': '重置',
      'sideChat.resetFailed': '重置失败：{message}',
      'sideChat.resetHint': '归档当前对话，在本页重新开始',
      'sideChat.send': '发送',
      'sideChat.showInherited': '显示继承内容',
      'sideChat.empty': '无法打开侧边对话。',
      'sideChat.working': '正在创建侧边对话…',
      'tab.title': '侧边对话',
    };

    const en = {
      'action.toMain': 'Send to main chat',
      'action.toSide': 'Send to side chat',
      'guide.description': 'Type directly — no quote needed; sending creates a sidechat- chat',
      'mainChat.failed': 'The main chat composer could not be reached.',
      'sideChat.chip': 'sidechat-{index}',
      'sideChat.hideInherited': 'Hide inherited',
      'sideChat.inheritEmpty': 'The main chat has nothing completed yet',
      'sideChat.inheritMore': '{messages} earlier messages not shown',
      'sideChat.inherited': '{turns} turns inherited from the main chat',
      'sideChat.new': 'New',
      'sideChat.newHint': 'Open another side chat',
      'sideChat.pendingPlaceholder': 'Type a message; sending creates a sidechat- chat…',
      'sideChat.reset': 'Reset',
      'sideChat.resetFailed': 'Reset failed: {message}',
      'sideChat.resetHint': 'Archive this chat and start over in this page',
      'sideChat.send': 'Send',
      'sideChat.showInherited': 'Show inherited',
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
    /** Marker on our own DOM — the selection layer and the page body read it. */
    const OURS = 'data-dsh-annotate-sidechat';
    /** Marker on one flow item that belongs to the fork's inherited prefix. */
    const INHERITED = 'data-dsh-sidechat-inherited';
    /** Attribute that folds every inherited flow item away while it is set. */
    const COLLAPSED = 'data-dsh-sidechat-collapsed';
    /** Tab type identity: the `sidebar.right.pane.tab` key and the page kind. */
    const TAB_ID = 'dsh-annotate-sidechat:note';
    const TAB_KIND = 'annotate-sidechat-note';
    /** Side-chat titles all start here; the number after it is the chat's index. */
    const TITLE_PREFIX = 'sidechat-';
    /** How much inherited message markup one new-chat page carries. */
    const INHERIT_MARKUP_MAX = 4096;
    const INHERIT_MARKUP_TOTAL = 24576;
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

    /** The durable title and directory of one session row, for the child's name. */
    function parentInfo(ctx, parentId) {
      try {
        const row = ctx.sessions.list.getSnapshot().byId[parentId];
        if (row === null || row === undefined) return { title: '', cwd: undefined };
        return { title: typeof row.title === 'string' ? row.title : '', cwd: typeof row.cwd === 'string' ? row.cwd : undefined };
      } catch (error) { return { title: '', cwd: undefined }; }
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

    /** The located quote both menu entries carry, as a block quote. */
    function quoteText(snapshot) {
      const quoted = snapshot.text.split('\n').map((line) => '> ' + line).join('\n');
      return locationLine(snapshot) + '\n' + quoted;
    }

    /** Whitespace-normalized text, for matching a message inside the transcript. */
    function normalizeText(value) {
      return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
    }

    /** One flow item's turn number, when the host marked it. */
    function itemTurn(item) {
      const raw = item.getAttribute('data-chat-turn');
      const turn = Number(raw);
      return raw !== null && raw !== '' && Number.isSafeInteger(turn) && turn > 0 ? turn : undefined;
    }

    /**
     * Where the side chat's own first message sits among the transcript's flow
     * items, or -1 when it is not on the page. Everything before it is what the
     * fork inherited from the main chat — the one boundary that needs no turn
     * numbers, no event windows, and no host cooperation.
     */
    function ownMessageIndex(items, first) {
      const needle = normalizeText(first).slice(0, 60);
      if (needle === '') return -1;
      return items.findIndex((item) => item.getAttribute('data-chat-flow-kind') === 'user'
        && normalizeText(item.textContent).includes(needle));
    }

    /** `draft` + one blank line + `text`; `text` alone when the draft is empty. */
    function appendDraft(draft, text) {
      return typeof draft === 'string' && draft.trim() !== '' ? draft + '\n\n' + text : text;
    }

    /**
     * The quote as it lands in a composer: `quoteText` plus one trailing
     * newline, so the caret waits on a fresh line for the user's own words.
     */
    function draftQuote(snapshot) {
      return quoteText(snapshot) + '\n';
    }

    // ── side chats ──────────────────────────────────────────────────────────

    /**
     * Every side chat this page knows, keyed by its own instance id. Entries are
     * replaced on write, so every read is a stable snapshot. `focusToken` counts
     * outside requests for the panel's composer focus, so a re-render that only
     * echoes the user's own typing never moves the caret.
     */
    function createSideChats(ctx) {
      const entries = new Map();
      const tabIds = new Map();
      const idsByTab = new Map();
      const listeners = new Set();
      const EMPTY = {
        id: '',
        parentId: '',
        index: 0,
        childId: null,
        boundaryTurn: null,
        first: '',
        inherited: null,
        draft: '',
        busy: false,
        error: '',
        focusToken: 0,
        collapsed: true,
      };
      const notify = () => { for (const fn of Array.from(listeners)) fn(); };
      const store = {
        subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; },
        get(id) {
          if (typeof id !== 'string' || id === '') return EMPTY;
          return entries.get(id) ?? EMPTY;
        },
        /** Install a page's restored state once; an entry already in hand wins. */
        ensure(id, seed) {
          if (typeof id !== 'string' || id === '') return EMPTY;
          const existing = entries.get(id);
          if (existing !== undefined) return existing;
          const entry = { ...EMPTY, ...seed, id: id };
          entries.set(id, entry);
          return entry;
        },
        patch(id, next) {
          if (typeof id !== 'string' || id === '') return;
          entries.set(id, { ...(entries.get(id) ?? EMPTY), ...next, id: id });
          notify();
        },
        /** Live side chats of one parent session, for numbering and for the toolbar. */
        of(parentId) {
          return Array.from(entries.values()).filter((entry) => entry.parentId === parentId);
        },
        /** Mint the side chat a page opened without params (the guide) belongs to. */
        forTab(tabId, parentId) {
          const known = tabIds.get(tabId);
          if (known !== undefined) return known;
          const entry = store.create(parentId);
          store.bindTab(tabId, entry.id);
          return entry.id;
        },
        create(parentId) {
          const id = 'note-' + Math.random().toString(36).slice(2, 10);
          const entry = {
            ...EMPTY,
            id: id,
            parentId: parentId,
            index: nextSideChatIndex(ctx, store, parentId),
            // A snapshot, not a mirror: the page shows the main chat as it was
            // when this side chat was created.
            inherited: captureInherited(ctx.sessions, parentId),
          };
          entries.set(id, entry);
          notify();
          return entry;
        },
        bindTab(tabId, id) {
          if (typeof tabId !== 'string' || tabId === '' || typeof id !== 'string' || id === '') return;
          const previous = tabIds.get(tabId);
          if (previous !== undefined && previous !== id) idsByTab.delete(previous);
          tabIds.set(tabId, id);
          idsByTab.set(id, tabId);
        },
        idOfTab(tabId) {
          return typeof tabId === 'string' ? tabIds.get(tabId) : undefined;
        },
        tabOfId(id) {
          return typeof id === 'string' ? idsByTab.get(id) : undefined;
        },
      };
      return store;
    }

    /** `sidechat-<n>-<main chat title>`; the suffix falls back to the directory name. */
    function sideChatTitle(index, parentTitle, cwd) {
      const named = typeof parentTitle === 'string' ? parentTitle.trim() : '';
      const suffix = named !== '' ? named : cwdBasename(cwd);
      return TITLE_PREFIX + index + (suffix === '' ? '' : '-' + suffix);
    }

    function cwdBasename(cwd) {
      if (typeof cwd !== 'string' || cwd === '') return '';
      const parts = cwd.split(/[\\/]/).filter((part) => part !== '');
      return parts.length === 0 ? '' : parts[parts.length - 1];
    }

    /**
     * The next free `sidechat-<n>` number for one parent: one past the highest
     * number any of its side chats carries, counting the sessions already in the
     * list (including archived ones) and the pending pages in hand.
     */
    function nextSideChatIndex(ctx, chats, parentId) {
      let highest = 0;
      if (ctx !== null && ctx !== undefined) {
        try {
          const list = ctx.sessions.list.getSnapshot();
          for (const id of list.ids) {
            const row = list.byId[id];
            if (row === undefined || row === null || row.parentId !== parentId) continue;
            const match = typeof row.title === 'string' ? /^sidechat-(\d+)/.exec(row.title) : null;
            if (match !== null) highest = Math.max(highest, Number(match[1]));
          }
        } catch (error) { /* the list may not be up yet — numbering still counts in-hand pages */ }
      }
      for (const entry of chats.of(parentId)) if (entry.index > highest) highest = entry.index;
      return highest + 1;
    }

    /** The main chat's transcript root — never the sidebar's copy of it. */
    function mainTranscript() {
      try {
        for (const root of document.querySelectorAll(CONVERSATION)) {
          if (root.closest(SIDEBAR) === null) return root;
        }
      } catch (error) { /* no document, nothing to read */ }
      return null;
    }

    /** Whether the main chat is mid-turn, so its last turn is not forkable yet. */
    function parentRunning(sessions, parentId) {
      try {
        const binding = sessions.binding(parentId);
        return binding !== undefined && binding.session.getSnapshot().running === true;
      } catch (error) { return false; }
    }

    /**
     * The main chat's own message markup, as of right now, up to the turn a fork
     * cuts at. Cloning the rows (and the column's class) keeps the host's
     * rendering, so the new-chat panel shows the history the way the main chat
     * shows it. Best effort: it reads the transcript on screen, so a windowed
     * history contributes what is rendered.
     */
    function captureInherited(sessions, parentId) {
      const empty = { columnClass: '', scrollClass: '', html: '', messages: 0, turns: 0, hidden: 0 };
      const root = mainTranscript();
      const first = root === null ? null : root.querySelector('[data-chat-flow-key]');
      const column = first === null ? null : first.parentElement;
      if (root === null || column === null) return empty;
      const scroll = column.parentElement;
      let boundary = null;
      for (const item of root.querySelectorAll('[data-chat-turn]')) {
        const turn = itemTurn(item);
        if (turn !== undefined && (boundary === null || turn > boundary)) boundary = turn;
      }
      if (boundary !== null && parentRunning(sessions, parentId)) boundary = Math.max(0, boundary - 1);
      const items = [];
      const turns = new Set();
      for (const item of root.querySelectorAll('[data-chat-flow-key]')) {
        if (item.hasAttribute('hidden')) continue;
        const kind = item.getAttribute('data-chat-flow-kind');
        if (kind !== 'user' && kind !== 'assistant-step') continue;
        // The thinking blocks are part of the reply, not of the conversation.
        if (item.getAttribute('data-chat-group-part') === 'reasoning') continue;
        const turn = itemTurn(item);
        if (boundary !== null && turn !== undefined && turn > boundary) continue;
        if (turn !== undefined) turns.add(turn);
        items.push(item);
      }
      // Carry the newest messages that fit; the rest are reported as not shown.
      const kept = [];
      let used = 0;
      for (let index = items.length - 1; index >= 0; index -= 1) {
        const markup = items[index].outerHTML;
        if (markup.length > INHERIT_MARKUP_MAX) continue;
        if (used + markup.length > INHERIT_MARKUP_TOTAL) break;
        used += markup.length;
        kept.unshift(markup);
      }
      return {
        columnClass: typeof column.className === 'string' ? column.className : '',
        scrollClass: scroll !== null && typeof scroll.className === 'string' ? scroll.className : '',
        html: kept.join(''),
        messages: items.length,
        turns: turns.size,
        hidden: items.length - kept.length,
      };
    }

    /** One durable-window read of a retained session, for the fork boundary. */
    function windowEntries(ctx, sessionId) {
      try {
        const binding = ctx.sessions.binding(sessionId);
        if (binding === undefined) return undefined;
        return binding.eventSource.getSnapshot().entries;
      } catch (error) { return undefined; }
    }

    /**
     * The last turn a fresh fork inherited, or null when it cannot be told.
     *
     * The fork copies an inclusive prefix, so every seq the child shares with
     * its parent is inherited; the highest shared seq is that prefix's end. The
     * boundary is the highest turn among the child's own events up to it — the
     * panel folds turns at or below it away.
     */
    function inheritedTurnBoundary(ctx, parentId, childId) {
      const parentEntries = windowEntries(ctx, parentId);
      const childEntries = windowEntries(ctx, childId);
      if (parentEntries === undefined || childEntries === undefined) return null;
      const parentSeqs = new Set();
      for (const entry of parentEntries) if (entry.type === 'event') parentSeqs.add(entry.event.seq);
      let boundarySeq = null;
      for (const entry of childEntries) {
        if (entry.type !== 'event') continue;
        const seq = entry.event.seq;
        if (!parentSeqs.has(seq)) continue;
        if (boundarySeq === null || seq > boundarySeq) boundarySeq = seq;
      }
      if (boundarySeq === null) return null;
      let turn = null;
      for (const entry of childEntries) {
        if (entry.type !== 'event' || entry.event.seq > boundarySeq) continue;
        const value = entry.event.data === undefined ? undefined : entry.event.data.turn;
        if (typeof value !== 'number' || !Number.isSafeInteger(value)) continue;
        if (turn === null || value > turn) turn = value;
      }
      return turn;
    }

    /** One side chat's page parameters: the whole state a reload needs. */
    function sideChatParams(entry) {
      return {
        id: entry.id,
        parentId: entry.parentId,
        index: entry.index,
        ...entry.childId === null ? {} : { childId: entry.childId },
        ...entry.boundaryTurn === null ? {} : { boundaryTurn: entry.boundaryTurn },
        ...entry.first === '' ? {} : { first: entry.first },
        ...entry.inherited === null ? {} : { inherited: entry.inherited },
        ...entry.draft === '' ? {} : { draft: entry.draft },
      };
    }

    /**
     * Open a fresh side-chat page (`multiple: true` ⇒ one page per side chat).
     *
     * `openTab` throws while the on-screen session's sidebar surface is not
     * mounted yet (`sidebarRight: no session surface is mounted`) — right after
     * a session switch, for instance. The seat renders a moment later, so the
     * open is retried; a failed attempt opened nothing, so retrying cannot
     * duplicate the page.
     * @returns whether a page was placed, once the retries are spent.
     */
    function openSideChatPage(ctx, entry, attempts) {
      const sidebar = sidebarRightOf(ctx);
      if (sidebar === undefined) return Promise.resolve(false);
      const cwd = currentCwd(ctx, entry.parentId);
      const params = { ...sideChatParams(entry), ...cwd === undefined ? {} : { cwd: cwd } };
      const total = typeof attempts === 'number' ? attempts : 10;
      return new Promise((resolve) => {
        const attempt = (left) => {
          try {
            sidebar.openTab(TAB_KIND, { params: params });
            resolve(true);
          } catch (error) {
            if (left <= 0) { resolve(false); return; }
            setTimeout(() => { attempt(left - 1); }, 150);
          }
        };
        attempt(total);
      });
    }

    /**
     * Bring one side chat into view: the column expands when it was collapsed,
     * and the page is focused (raising it when it floats). Without this a quote
     * aimed at a tab the user cannot see looks like nothing happened.
     */
    function revealSideChat(ctx, chats, entry) {
      const sidebar = sidebarRightOf(ctx);
      if (sidebar === undefined) return;
      try {
        if (typeof sidebar.isExpanded === 'function' && typeof sidebar.toggleExpanded === 'function'
          && sidebar.isExpanded() === false) sidebar.toggleExpanded();
      } catch (error) { /* no surface to expand yet */ }
      const tabId = chats.tabOfId(entry.id);
      if (tabId === undefined) return;
      try { sidebar.focus(tabId); } catch (error) { /* the page is gone */ }
    }

    /**
     * Rewrite one side chat's page parameters in place — the tab takes its own
     * place back — so a reloaded page restores the chat it was showing.
     */
    function refreshSideChatPage(ctx, chats, id) {
      const sidebar = sidebarRightOf(ctx);
      const tabId = chats.tabOfId(id);
      if (sidebar === undefined || tabId === undefined) return;
      const entry = chats.get(id);
      const cwd = currentCwd(ctx, entry.parentId);
      try {
        sidebar.openTab(TAB_KIND, {
          replaceTab: tabId,
          params: { ...sideChatParams(entry), ...cwd === undefined ? {} : { cwd: cwd } },
        });
      } catch (error) { /* the layout is gone; the page keeps its previous params */ }
    }

    /** The side chat the right sidebar currently shows, when there is one. */
    function activeSideChatId(ctx, chats) {
      const sidebar = sidebarRightOf(ctx);
      if (sidebar === undefined || typeof sidebar.active !== 'function') return undefined;
      try {
        const onScreen = sidebar.mounted !== undefined && typeof sidebar.mounted.getSnapshot === 'function'
          ? sidebar.mounted.getSnapshot()
          : undefined;
        if (typeof onScreen !== 'string' || onScreen === '' || onScreen !== currentSessionId(ctx)) return undefined;
        const tab = sidebar.active();
        if (tab === undefined || tab === null || tab.kind !== TAB_KIND) return undefined;
        return chats.idOfTab(tab.id);
      } catch (error) { return undefined; }
    }

    /**
     * Fork `parentId`, title the child `sidechat-<index>-<parent title>`, and
     * send `text` as its first message. This is the only place a side chat is
     * created, which is why nothing shows up in the session list before a
     * composer is sent.
     * @returns the child session id.
     */
    async function createSideChat(ctx, parentId, text, index) {
      // No explicit boundary: the host cuts at the main chat's last completed
      // turn, so a side chat never inherits a turn that is still being written.
      const childId = await ctx.sessions.fork({ sessionId: parentId });
      const reference = ctx.sessions.retain(childId, { source: 'sidebarChat' });
      let handedOver = false;
      try {
        await reference.ready;
        const session = reference.binding.session;
        const info = parentInfo(ctx, parentId);
        // Rename first: an explicit title pins the session against automatic
        // generation from the first message.
        const renamed = await session.rename(sideChatTitle(index, info.title, info.cwd));
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

    /** Send one pending panel: this is what creates the chat. */
    async function submitSideChat(ctx, chats, id) {
      const entry = chats.get(id);
      if (entry.id === '' || entry.busy) return;
      const text = entry.draft.trim();
      if (text === '') return;
      const index = entry.index > 0 ? entry.index : nextSideChatIndex(ctx, chats, entry.parentId);
      chats.patch(id, { busy: true, error: '', index: index });
      try {
        const childId = await createSideChat(ctx, entry.parentId, text, index);
        const boundaryTurn = inheritedTurnBoundary(ctx, entry.parentId, childId);
        chats.patch(id, { childId: childId, boundaryTurn: boundaryTurn, first: text, draft: '', busy: false, error: '' });
        // Record the child (and the boundary) in the page's own params.
        refreshSideChatPage(ctx, chats, id);
      } catch (error) {
        chats.patch(id, { busy: false, error: String((error && error.message) || error) });
      }
    }

    /** `Reset side chat`: archive the session and start over in this same page. */
    async function resetSideChat(ctx, chats, id, t) {
      const entry = chats.get(id);
      if (entry.id === '') return;
      if (entry.childId !== null) {
        const workspace = ctx.get('uiWorkspace');
        if (workspace !== undefined && workspace !== null && typeof workspace.archiveSession === 'function') {
          try {
            await workspace.archiveSession(entry.childId, { stopActivity: true });
          } catch (error) {
            chats.patch(id, { error: t('sideChat.resetFailed', { message: String((error && error.message) || error) }) });
            return;
          }
        }
      }
      // A fresh number: the archived chat keeps the old one, so titles stay
      // distinct, and the reset page goes back to a plain composer.
      chats.patch(id, {
        index: nextSideChatIndex(ctx, chats, entry.parentId),
        childId: null,
        boundaryTurn: null,
        first: '',
        draft: '',
        busy: false,
        error: '',
        collapsed: true,
        focusToken: entry.focusToken + 1,
      });
      refreshSideChatPage(ctx, chats, id);
    }

    /** `New side chat`: one more page for the same main chat. */
    function newSideChat(ctx, chats, id) {
      const entry = chats.get(id);
      if (entry.id === '') return;
      const created = chats.create(entry.parentId);
      openSideChatPage(ctx, chats.get(created.id));
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
.dsh-note-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; flex: none; }
.dsh-note-tool {
  padding: 3px 8px; font: inherit; font-size: 12px; white-space: nowrap; cursor: pointer; border-radius: 6px;
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l1);
}
.dsh-note-tool:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.dsh-note-toolGlyph { font-size: 12px; line-height: 1; opacity: 0.85; }
.dsh-note-tool-primary {
  color: var(--dsw-alias-brand-primary);
  border-color: var(--dsw-alias-brand-primary);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent);
}
.dsh-note-tool-primary:hover {
  color: var(--dsw-alias-brand-primary);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, transparent);
}
.dsh-note-tool-warn {
  /* Reset archives the current chat: a caution tone, plainly apart from the
     brand-tinted New beside it. Without color-mix the text and border still
     carry the tone, only the fill falls back to the plain layer. */
  color: var(--dsw-alias-state-warn-primary);
  border-color: var(--dsw-alias-state-warn-primary);
  background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 10%, transparent);
}
.dsh-note-tool-warn:hover {
  color: var(--dsw-alias-state-warn-primary);
  background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 18%, transparent);
}
.dsh-note-tool-toggle { margin-left: auto; }
.dsh-note-tool[data-active] { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-2); }
.dsh-note-sideBody { flex: 1 1 auto; min-height: 0; display: flex; }
/* The fork's inherited prefix, folded away until the toolbar is asked to show it. */
.dsh-note-sideBody[data-dsh-sidechat-collapsed] [data-dsh-sidechat-inherited] { display: none; }
/* The room under the toolbar splits the way a sent side chat does: the
   transcript takes two thirds (scrolling in the main chat's own container), the
   composer one. */
.dsh-note-transcript {
  flex: 2 1 0; min-height: 0; overflow: auto; display: flex; flex-direction: column;
  padding: 4px 0; box-sizing: border-box;
}
/* The captured rows carry the main chat's own classes; only their controls are
   dropped, since a clone has no handlers. */
.dsh-note-transcript > div { min-width: 0; }
.dsh-note-transcript button, .dsh-note-transcript [role="button"] { display: none; }
.dsh-note-empty { padding: 8px 0; font-size: 12px; color: var(--dsw-alias-label-tertiary); }
.dsh-note-composer {
  flex: 1 1 0; min-height: 64px; box-sizing: border-box;
  display: flex; flex-direction: column; gap: 4px; padding: 8px 10px;
  background: var(--dsw-specific-input-major, var(--dsw-alias-bg-layer-1));
  border: 1px solid var(--dsw-alias-border-l1); border-radius: var(--dsw-radius-xl, 12px);
}
.dsh-note-composer:focus-within { border-color: var(--dsw-alias-border-l3); }
.dsh-note-input {
  flex: 1 1 auto; min-height: 40px; width: 100%; box-sizing: border-box;
  display: block; resize: none; padding: 2px 0;
  font: inherit; color: inherit; background: transparent; border: none;
}
.dsh-note-input:focus { outline: none; }
.dsh-note-composerRow { flex: none; display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
.dsh-note-sendBtn {
  padding: 3px 10px; font: inherit; font-size: 12px; white-space: nowrap; cursor: pointer; border-radius: 6px;
  color: #fff; background: var(--dsw-alias-brand-primary); border: 1px solid var(--dsw-alias-brand-primary);
}
.dsh-note-sendBtn:hover { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 88%, #000); }
.dsh-note-sendBtn[disabled] { opacity: 0.5; cursor: default; }
.dsh-note-toolNote { margin-left: auto; font-size: 11px; color: var(--dsw-alias-label-tertiary); }
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

      /**
       * Send to main chat: append the quote to the current session's composer,
       * which `writeDraft` leaves focused with the caret at the end.
       */
      async function toMain(selection) {
        const parentId = currentSessionId(ctx);
        if (parentId === '') { store.set({ pending: selection, error: t('mainChat.failed') }); return; }
        // Order matters: dropping the quote highlight after the composer took
        // focus would clear the DOM selection under the caret it just placed.
        clearSelection();
        const landed = await writeDraft(ctx, parentId, draftQuote(selection), 10);
        if (!landed) { store.set({ pending: selection, error: t('mainChat.failed') }); return; }
        store.set({ pending: null, error: '' });
      }

      /**
       * Send to side chat: the quote joins the side chat the sidebar shows, and a
       * new side chat is opened when it shows none. Either way the page is
       * brought into view, so the action is never invisible.
       */
      async function toSide(selection) {
        const parentId = currentSessionId(ctx);
        if (parentId === '') { store.set({ pending: selection, error: t('sideChat.empty') }); return; }
        const text = draftQuote(selection);
        const activeId = activeSideChatId(ctx, chats);
        const active = activeId === undefined ? undefined : chats.get(activeId);
        const target = active !== undefined && active.id !== '' && active.parentId === parentId ? active : undefined;
        clearSelection();
        store.set({ pending: null, error: '' });
        if (target !== undefined && target.childId !== null) {
          // The chat exists: the quote joins that conversation's composer draft,
          // and the composer takes the focus once the panel is up.
          revealSideChat(ctx, chats, target);
          void writeDraft(ctx, target.childId, text, 10);
          return;
        }
        if (target !== undefined) {
          // The open page is still pending; the bumped token asks it to take the
          // focus once it has re-rendered with the quote.
          revealSideChat(ctx, chats, target);
          chats.patch(target.id, {
            draft: appendDraft(target.draft, text),
            error: '',
            focusToken: target.focusToken + 1,
          });
          return;
        }
        const created = chats.create(parentId);
        chats.patch(created.id, { draft: text });
        if (!(await openSideChatPage(ctx, chats.get(created.id)))) {
          store.set({ pending: selection, error: t('sideChat.empty') });
        }
      }

      reactRoot.render(h(Overlay, {
        t: t,
        store: store,
        toMain: (selection) => { void toMain(selection); },
        toSide: (selection) => { void toSide(selection); },
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

    // ── the side-chat page ──────────────────────────────────────────────────

    /**
     * One side-chat page body. Before the page is sent it is a plain composer —
     * holding a quote when the menu opened it, empty when the sidebar's guide
     * opened it, since a side chat needs no quote. Once sent it declares the
     * host's `sidebar.chat.conversation` child slot and wraps it in the framework
     * `SessionProvider`, so the panel renders the shipped conversation (message
     * stream + composer) for the forked child, with the fork's inherited prefix
     * folded away.
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
      const tabId = typeof info.tab.id === 'string' ? info.tab.id : '';
      // A page opened from the guide carries no params at all: it mints its own
      // side chat, once per tab.
      const id = typeof bag.id === 'string' && bag.id !== '' ? bag.id : props.sideChatForTab(tabId, parentId);
      props.chats.ensure(id, {
        parentId: parentId,
        index: Number.isSafeInteger(bag.index) ? bag.index : 1,
        childId: typeof bag.childId === 'string' ? bag.childId : null,
        boundaryTurn: Number.isSafeInteger(bag.boundaryTurn) ? bag.boundaryTurn : null,
        first: typeof bag.first === 'string' ? bag.first : '',
        inherited: bag.inherited !== null && typeof bag.inherited === 'object' ? bag.inherited : null,
        draft: typeof bag.draft === 'string' ? bag.draft : '',
      });
      props.chats.bindTab(tabId, id);
      const entry = React.useSyncExternalStore(
        (fn) => props.chats.subscribe(fn),
        () => props.chats.get(id),
      );
      const childId = entry.childId;
      const hasChild = typeof childId === 'string' && childId !== '';
      const boundaryTurn = entry.boundaryTurn;
      const first = entry.first;
      const cwd = typeof bag.cwd === 'string' ? bag.cwd : undefined;
      const [reference, setReference] = React.useState(null);
      const [failed, setFailed] = React.useState(false);
      const [inherited, setInherited] = React.useState(0);
      const composerRef = React.useRef(null);
      const bodyRef = React.useRef(null);

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

      // The pending composer takes the keyboard when the panel appears and each
      // time an outside action (the quote menu) puts text in it, with the caret
      // after that text. Keyed on the token, so typing never moves the caret.
      React.useEffect(() => {
        const node = composerRef.current;
        if (node === null || entry.busy) return;
        node.focus({ preventScroll: true });
        const end = node.value.length;
        try { node.setSelectionRange(end, end); } catch (error) { /* not selectable */ }
      }, [entry.focusToken, entry.busy]);

      // Mark the fork's inherited flow items, and keep marking them as older
      // history pages arrive. `inherited` is what the toolbar toggles.
      React.useEffect(() => {
        const node = bodyRef.current;
        if (node === null) { setInherited(0); return undefined; }
        let frame = null;
        const mark = () => {
          frame = null;
          const items = Array.from(node.querySelectorAll('[data-chat-flow-key]'));
          const cut = ownMessageIndex(items, first);
          const byTurn = cut < 0 && typeof boundaryTurn === 'number';
          const turns = new Set();
          let marked = 0;
          for (let index = 0; index < items.length; index += 1) {
            const item = items[index];
            const turn = itemTurn(item);
            const inherited = cut > 0 ? index < cut : byTurn && turn !== undefined && turn <= boundaryTurn;
            if (inherited) {
              item.setAttribute(INHERITED, '');
              if (turn !== undefined) turns.add(turn);
              marked += 1;
            } else {
              item.removeAttribute(INHERITED);
            }
          }
          setInherited(turns.size > 0 ? turns.size : marked);
        };
        mark();
        const observer = new MutationObserver(() => {
          if (frame !== null) return;
          frame = requestAnimationFrame(mark);
        });
        observer.observe(node, { childList: true, subtree: true });
        return () => {
          observer.disconnect();
          if (frame !== null) cancelAnimationFrame(frame);
        };
      }, [boundaryTurn, childId, first]);

      // Reset (destructive, secondary) sits left of New (additive, brand-tinted):
      // same size and shape, different glyph, colour and tooltip.
      const tools = h('div', { className: 'dsh-note-tools' },
        h('button', {
          className: 'dsh-note-tool dsh-note-tool-warn', type: 'button',
          title: t('sideChat.resetHint'),
          onClick: () => { void props.resetSideChat(id); },
        }, h('span', { className: 'dsh-note-toolGlyph' }, '↺'), t('sideChat.reset')),
        h('button', {
          className: 'dsh-note-tool dsh-note-tool-primary', type: 'button',
          title: t('sideChat.newHint'),
          onClick: () => props.newSideChat(id),
        }, h('span', { className: 'dsh-note-toolGlyph' }, '＋'), t('sideChat.new')),
        hasChild && inherited > 0
          ? h('button', {
              className: 'dsh-note-tool dsh-note-tool-toggle', type: 'button',
              'data-active': entry.collapsed ? undefined : true,
              title: entry.collapsed ? t('sideChat.showInherited') : t('sideChat.hideInherited'),
              onClick: () => props.chats.patch(id, { collapsed: !entry.collapsed }),
            }, h('span', { className: 'dsh-note-toolGlyph' }, entry.collapsed ? '▸' : '▾'),
              t('sideChat.inherited', { turns: inherited }))
          : (!hasChild && entry.inherited !== null && entry.inherited.turns > 0
              ? h('span', { className: 'dsh-note-toolNote' }, t('sideChat.inherited', { turns: entry.inherited.turns }))
              : null),
      );

      if (hasChild) {
        if (failed) return h('div', { className: 'dsh-note-panel', [OURS]: '' }, tools, h('div', null, t('sideChat.empty')));
        if (reference === null) return h('div', { className: 'dsh-note-panel', [OURS]: '' }, tools, h('div', { style: { opacity: 0.6 } }, t('sideChat.working')));
        // `reference` IS the scope target (`SlotScopeTargetMap.session`); the
        // fork inherits the parent's cwd, so only a divergence needs carrying.
        if (cwd !== undefined) reference.cwd = cwd;
        return h('div', { className: 'dsh-note-panel', [OURS]: '' },
          tools,
          entry.error === '' ? null : h('div', { className: 'dsh-note-error' }, entry.error),
          h('div', {
            className: 'dsh-note-sideBody',
            ref: bodyRef,
            ...entry.collapsed ? { [COLLAPSED]: '' } : {},
          }, h(props.SessionProvider, { session: reference },
            props.renderSlot('sidebar.chat.conversation', {}))),
        );
      }

      const send = () => props.sendSideChat(id);
      // Before the chat exists the panel already looks like one that has been
      // sent to: the same toolbar, the main chat's own rows inside the main
      // chat's own scroll container, and a composer card below them.
      const origin = entry.inherited;
      const transcript = h('div', {
        className: 'dsh-note-transcript' + (origin !== null && origin.scrollClass ? ' ' + origin.scrollClass : ''),
      },
        origin === null || origin.html === ''
          ? h('div', { className: 'dsh-note-empty' }, t('sideChat.inheritEmpty'))
          : [
              origin.hidden === 0
                ? null
                : h('div', { className: 'dsh-note-empty' }, t('sideChat.inheritMore', { messages: origin.hidden })),
              h('div', {
                key: 'rows',
                className: origin.columnClass || '',
                dangerouslySetInnerHTML: { __html: origin.html },
              }),
            ],
      );
      return h('div', { className: 'dsh-note-panel', [OURS]: '' },
        tools,
        transcript,
        h('div', { className: 'dsh-note-composer' },
          h('textarea', {
            className: 'dsh-note-input',
            ref: composerRef,
            value: entry.draft,
            disabled: entry.busy,
            placeholder: t('sideChat.pendingPlaceholder'),
            onChange: (event) => props.chats.patch(id, { draft: event.target.value, error: '' }),
            onKeyDown: (event) => {
              if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); }
            },
          }),
          h('div', { className: 'dsh-note-composerRow' },
            h('button', {
              className: 'dsh-note-sendBtn', type: 'button',
              disabled: entry.busy || entry.draft.trim() === '',
              onClick: send,
            }, t('sideChat.send')),
          ),
        ),
        entry.error === '' ? null : h('div', { className: 'dsh-note-error' }, entry.error),
      );
    }

    /** The tab chip: which side chat a page is, when several are open. */
    function SideChatChip(props) {
      const info = props.useTabInfo();
      const params = info.tab.navigation.params;
      const bag = params !== null && typeof params === 'object' ? params : {};
      const tabId = typeof info.tab.id === 'string' ? info.tab.id : '';
      const bound = props.chats.idOfTab(tabId);
      const id = typeof bound === 'string' ? bound : (typeof bag.id === 'string' ? bag.id : '');
      const entry = React.useSyncExternalStore(
        (fn) => props.chats.subscribe(fn),
        () => props.chats.get(id),
      );
      const index = entry.index > 0 ? entry.index : (Number.isSafeInteger(bag.index) ? bag.index : 1);
      return h('span', null, props.t('sideChat.chip', { index: index }));
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
      /** Pure formatting, naming, and the selection rule, for the runnable check. */
      __test: {
        locationLine: locationLine,
        quoteText: quoteText,
        draftQuote: draftQuote,
        appendDraft: appendDraft,
        selectionText: selectionText,
        capture: capture,
        sideChatTitle: sideChatTitle,
        nextSideChatIndex: nextSideChatIndex,
      },
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh: zh, en: en }), 'dsh-annotate-sidechat: dictionaries');
        const t = ctx.locale.bind(NS);
        const chats = createSideChats(ctx);

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
            // Each side chat is its own page; opening again is how a second one
            // is born, and a page rewrites its own params in place (replaceTab).
            multiple: true,
            title: () => t('tab.title'),
            // The guide (the strip's add control / empty column) is how a side
            // chat is opened without quoting anything — picking it opens the page
            // with no params, and the body mints a side chat for the pane.
            guide: [{
              id: TAB_ID,
              order: 120,
              title: () => t('tab.title'),
              description: () => t('guide.description'),
            }],
          });
          const shared = {
            chats: chats,
            newSideChat: (id) => newSideChat(ctx, chats, id),
            resetSideChat: (id) => resetSideChat(ctx, chats, id, t),
            sendSideChat: (id) => { void submitSideChat(ctx, chats, id); },
          };
          const disposeBody = ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
            name: 'sidebar.right.pane.tab',
            key: TAB_ID,
            children: { 'sidebar.chat.conversation': { kind: 'single', scope: 'session' } },
            locale: NS,
            // Session-scoped slots hand the injector the pane's own session id.
            inject: (sessionId) => ({
              ...shared,
              sessions: ctx.sessions,
              sessionId: sessionId,
              sideChatForTab: (tabId, parentId) => chats.forTab(tabId, parentId),
            }),
          }, SideChatTab));
          const disposeTitle = ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
            name: 'sidebar.right.pane.tab.title',
            key: TAB_ID,
            locale: NS,
            inject: () => ({ chats: chats }),
          }, SideChatChip));
          const disposeChat = ctx.slots.inject('sidebar.chat.conversation', () => ctx.slots.register({
            name: 'sidebar.chat.conversation',
            locale: NS,
          }, SideChatPanel));
          return () => { disposeChat(); disposeTitle(); disposeBody(); disposeType(); };
        }), 'dsh-annotate-sidechat: side chat tab');
      },
    };
  },
});

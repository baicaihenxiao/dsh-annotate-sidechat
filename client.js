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
 * Inside a side chat that has been sent, the same gesture offers one item:
 *
 *   Send to chat       →  the quote joins that side chat's own composer
 *
 * The quote is English-located — `Quoted from the assistant's reply (turn 3,
 * paragraph 2):` followed by the block-quoted passage — so the receiver knows
 * which spot of the transcript is being talked about.
 *
 * A side chat is a real `sessions.fork` child of its main chat, created only
 * when its composer is sent: until then the page holds a plain draft and no
 * chat exists in the session list. The child is titled
 * `sidechat-<n>-<main chat title>` and rendered by the host's own
 * `conversation.content` factory, so the panel body IS the shipped
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
      'action.cancel': '取消',
      'action.toChat': '发送到此对话',
      'action.toMain': '主对话',
      'action.toNewSide': '发送到新的侧边对话',
      'action.toSide': '侧边对话',
      'guide.description': '不引用也能直接输入；发送后新建 sidechat- 对话',
      'mainChat.failed': '无法写入主对话的输入框。',
      'sideChat.chip': 'sidechat-{index}',
      'sideChat.hideInherited': '隐藏继承内容',
      'sideChat.inheritEmpty': '主对话还没有已完成的内容',
      'sideChat.inheritMore': '更早的 {messages} 条未显示',
      'sideChat.inherited': '继承 {turns} 轮',
      'sideChat.inheritedOne': '继承 {turns} 轮',
      'sideChat.new': '新建',
      'sideChat.newHint': '再开一个侧边对话',
      'sideChat.pendingPlaceholder': '输入内容，发送后新建 sidechat- 对话…',
      'sideChat.quoteFailed': '无法写入侧边对话的输入框。',
      'sideChat.reset': '重置',
      'sideChat.resetFailed': '重置失败：{message}',
      'sideChat.resetHint': '归档当前对话，在本页重新开始',
      'sideChat.send': '发送',
      'sideChat.showInherited': '显示继承内容',
      'sideChat.staleQuote': '这段内容来自主对话第 {turn} 轮，而当前的 sidechat-{index} 是在第 {fork} 轮 fork 的，看不到这一轮及其上下文。要改为发送到一个新的侧边对话吗？新对话会从主对话最新的轮次 fork。',
      'sideChat.empty': '无法打开侧边对话。',
      'sideChat.gone': '这个侧边对话已在别处归档或删除，本页随即关闭。',
      'sideChat.working': '正在创建侧边对话…',
      'tab.title': '侧边对话',
      'where.block': '第{n}块',
      'where.chars': '{chars}字',
      'where.code block': '第{n}个代码块',
      'where.heading': '第{n}个标题',
      'where.list item': '第{n}项',
      'where.paragraph': '第{n}段',
      'where.quote': '第{n}处引用',
      'where.reasoning': '思考',
      'where.table cell': '第{n}格',
      'where.turn': '第{turn}轮',
    };

    const en = {
      'action.cancel': 'Cancel',
      'action.toChat': 'Send to chat',
      'action.toMain': 'Main chat',
      'action.toNewSide': 'Send to a new side chat',
      'action.toSide': 'Side chat',
      'guide.description': 'Type directly — no quote needed; sending creates a sidechat- chat',
      'mainChat.failed': 'The main chat composer could not be reached.',
      'sideChat.chip': 'sidechat-{index}',
      'sideChat.hideInherited': 'Hide inherited',
      'sideChat.inheritEmpty': 'The main chat has nothing completed yet',
      'sideChat.inheritMore': '{messages} earlier messages not shown',
      'sideChat.inherited': '{turns} turns inherited',
      'sideChat.inheritedOne': '{turns} turn inherited',
      'sideChat.new': 'New',
      'sideChat.newHint': 'Open another side chat',
      'sideChat.pendingPlaceholder': 'Type a message; sending creates a sidechat- chat…',
      'sideChat.quoteFailed': 'The side chat composer could not be reached.',
      'sideChat.reset': 'Reset',
      'sideChat.resetFailed': 'Reset failed: {message}',
      'sideChat.resetHint': 'Archive this chat and start over in this page',
      'sideChat.send': 'Send',
      'sideChat.showInherited': 'Show inherited',
      'sideChat.staleQuote': 'This passage is from turn {turn} of the main chat, but sidechat-{index} was forked at turn {fork}, so it has neither that turn nor its context. Send it to a new side chat instead? The new one forks from the main chat\'s latest turn.',
      'sideChat.empty': 'The side chat could not be opened.',
      'sideChat.gone': 'This side chat was archived or deleted elsewhere; this page closes.',
      'sideChat.working': 'Creating the side chat…',
      'tab.title': 'Side chat',
      'where.block': 'block {n}',
      'where.chars': '{chars} chars',
      'where.code block': 'code {n}',
      'where.heading': 'heading {n}',
      'where.list item': 'item {n}',
      'where.paragraph': 'para {n}',
      'where.quote': 'quote {n}',
      'where.reasoning': 'thinking',
      'where.table cell': 'cell {n}',
      'where.turn': 'turn {turn}',
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
    /** On a sent side chat's body: the child session its replies quote into. */
    const SIDE_CHILD = 'data-dsh-sidechat-child';
    /** Tab type identity: the `sidebar.right.pane.tab` key and the page kind. */
    const TAB_ID = 'dsh-annotate-sidechat:note';
    const TAB_KIND = 'annotate-sidechat-note';
    /** The page body's own conversation seat. Not the host's
     *  `sidebar.chat.conversation`: ui-subagent declares and fills that one, and
     *  the slot registry refuses a second declaration or occupant. */
    const CONVERSATION_SLOT = 'annotateSidechat.conversation';
    /** Side-chat titles all start here; the number after it is the chat's index. */
    const TITLE_PREFIX = 'sidechat-';
    /** Plugin-owned per-page memory. The sidebar persists its layout (ids and
     *  addresses) but not the navigation params a page was opened with, so on
     *  reload a page would forget which side chat it is, what it inherited and
     *  what was typed into it. Records are keyed by the tab's own id, which the
     *  layout does keep, and dropped once no saved layout holds that tab. */
    const PAGE_PREFIX = 'dsh-annotate-sidechat:page:';
    const PAGE_WRITE_DELAY = 300;
    const pageRecords = new Map();

    function readPage(tabId) {
      if (typeof tabId !== 'string' || tabId === '') return null;
      if (pageRecords.has(tabId)) return pageRecords.get(tabId);
      let record = null;
      try {
        const raw = window.localStorage.getItem(PAGE_PREFIX + tabId);
        const parsed = raw === null ? null : JSON.parse(raw);
        if (parsed !== null && typeof parsed === 'object' && typeof parsed.id === 'string' && parsed.id !== '') record = parsed;
      } catch (error) { record = null; }
      pageRecords.set(tabId, record);
      return record;
    }

    function writePage(tabId, entry) {
      if (typeof tabId !== 'string' || tabId === '' || typeof entry.id !== 'string' || entry.id === '') return;
      const record = {
        id: entry.id,
        parentId: entry.parentId,
        index: entry.index,
        ...entry.childId === null ? {} : { childId: entry.childId },
        ...entry.boundaryTurn === null ? {} : { boundaryTurn: entry.boundaryTurn },
        ...entry.first === '' ? {} : { first: entry.first },
        ...entry.inherited === null ? {} : { inherited: entry.inherited },
        ...entry.draft === '' ? {} : { draft: entry.draft },
      };
      pageRecords.set(tabId, record);
      try { window.localStorage.setItem(PAGE_PREFIX + tabId, JSON.stringify(record)); } catch (error) { /* the page just loses its memory */ }
    }

    function forgetPage(tabId) {
      if (typeof tabId !== 'string' || tabId === '') return;
      pageRecords.delete(tabId);
      try { window.localStorage.removeItem(PAGE_PREFIX + tabId); } catch (error) { /* nothing to forget */ }
    }

    /**
     * Drop the records whose tab no saved or adopted layout holds any more — a
     * page closed while this plugin was not listening. Age is no signal: a page
     * in a chat nobody opened for a month is still that side chat.
     * @param openTabs - the sidebar's tab inventory, read from every saved layout.
     */
    function sweepPages(openTabs) {
      const live = new Set(openTabs.map((tab) => tab.tabId));
      try {
        const stale = [];
        for (let index = 0; index < window.localStorage.length; index += 1) {
          const key = window.localStorage.key(index);
          if (key !== null && key.startsWith(PAGE_PREFIX) && !live.has(key.slice(PAGE_PREFIX.length))) stale.push(key);
        }
        for (const key of stale) window.localStorage.removeItem(key);
      } catch (error) { /* storage unavailable */ }
    }

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
              input.setDraft(nextDraft(input, text));
              if (typeof input.focus === 'function') input.focus();
              scrollComposerToEnd(sessionId);
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
     * The assistant step owning `node`, and where a quote of it goes: `side` is
     * the child session when the step is a reply inside one of our sent side
     * chats, '' for the main chat. Null when the node is outside a step, in any
     * other sidebar surface, inside our own overlay or a pending page's copied
     * rows, or still streaming.
     */
    function stepOf(node) {
      const element = elementOf(node);
      if (element === null) return null;
      const step = element.closest(ASSISTANT_STEP);
      if (step === null) return null;
      if (step.hasAttribute('data-streaming') || step.querySelector('[data-streaming]') !== null) return null;
      const body = step.closest('[' + SIDE_CHILD + ']');
      if (body !== null) {
        const side = body.getAttribute(SIDE_CHILD) || '';
        return side === '' ? null : { step: step, side: side };
      }
      if (step.closest('[' + OURS + ']') !== null || step.closest(SIDEBAR) !== null) return null;
      return { step: step, side: '' };
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

    /** One valid menu target: where it sits in the reply, the text, its rect, and its side chat. */
    function capture() {
      let selection;
      try { selection = window.getSelection(); } catch (error) { return null; }
      if (selection === null || selection.isCollapsed || selection.rangeCount === 0) return null;
      const range = selection.getRangeAt(0);
      const common = elementOf(range.commonAncestorContainer);
      if (common === null || inNonQuote(range.startContainer) || inNonQuote(range.endContainer)) return null;
      const owner = stepOf(common);
      if (owner === null) return null;
      const step = owner.step;
      const text = selectionText(range);
      if (text === '') return null;
      return {
        text: text,
        rect: range.getBoundingClientRect(),
        turn: turnOf(step),
        part: partOf(step),
        block: blockLabel(step, range),
        side: owner.side,
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

    /** The menu's own location line, short and in the UI language: `turn 3 · para 2 · 4 chars`, `第3轮 · 第2段 · 4字`. */
    function whereLabel(snapshot, t) {
      const at = [];
      if (typeof snapshot.turn === 'number') at.push(t('where.turn', { turn: snapshot.turn }));
      if (snapshot.part === 'reasoning') at.push(t('where.reasoning'));
      // `block` is the quote's English `paragraph 2`; its kind keys the label.
      const block = typeof snapshot.block === 'string' ? /^(.+) (\d+)$/.exec(snapshot.block) : null;
      if (block !== null) at.push(t('where.' + block[1], { n: Number(block[2]) }));
      at.push(t('where.chars', { chars: Array.from(snapshot.text).length }));
      return at.join(' · ');
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
     *
     * Every quote opens with the same location line, so an inherited message
     * quoting the same spot reads alike for its first ~60 characters: the
     * needle runs well past it, and a known turn boundary rules out every
     * inherited row.
     */
    function ownMessageIndex(items, first, boundaryTurn) {
      const needle = normalizeText(first).slice(0, 200);
      if (needle === '') return -1;
      return items.findIndex((item) => {
        if (item.getAttribute('data-chat-flow-kind') !== 'user') return false;
        const turn = itemTurn(item);
        if (typeof boundaryTurn === 'number' && turn !== undefined && turn <= boundaryTurn) return false;
        return normalizeText(item.textContent).includes(needle);
      });
    }

    /** `draft` + one blank line + `text`; `text` alone when the draft is empty. */
    function appendDraft(draft, text) {
      return typeof draft === 'string' && draft.trim() !== '' ? draft + '\n\n' + text : text;
    }

    /**
     * What `writeDraft` hands `setDraft`. From DSH 0.2.1 the composer keeps
     * reference chips in a semantic document (`draftSnapshot`, whose `text` is
     * the same projection as `state.draft`); appending to that document keeps
     * them, where the projected string would flatten each chip into plain text.
     * 0.2.0 has no document, so its string is the whole draft.
     */
    function nextDraft(input, text) {
      const doc = input.draftSnapshot;
      if (doc !== null && typeof doc === 'object' && typeof doc.text === 'string') {
        return { ...doc, text: appendDraft(doc.text, text) };
      }
      return appendDraft(input.state.getSnapshot().draft, text);
    }

    /**
     * The quote as it lands in a composer: `quoteText` plus a blank line, so the
     * caret waits on a fresh line with room to write under the quote.
     */
    function draftQuote(snapshot) {
      return quoteText(snapshot) + '\n\n';
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
      const writing = new Map();
      const held = new Map();
      /** Children Reset is archiving itself: their page stays and starts over. */
      const resetting = new Set();
      /** Keep this page's record current; typing collapses into one write. */
      const remember = (id) => {
        if (idsByTab.get(id) === undefined) return;
        const timer = writing.get(id);
        if (timer !== undefined) clearTimeout(timer);
        writing.set(id, setTimeout(() => {
          writing.delete(id);
          const entry = entries.get(id);
          const tabId = idsByTab.get(id);
          if (entry === undefined || tabId === undefined) return;
          writePage(tabId, entry);
        }, PAGE_WRITE_DELAY));
      };
      const store = {
        // No `this`: handed to `useSyncExternalStore` as is, one stable function,
        // so a re-render never resubscribes.
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
          remember(id);
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
          // `forTab` mints during a page body's render; telling the other
          // subscribers then would update them mid-render, so wait for it to end.
          queueMicrotask(notify);
          return entry;
        },
        bindTab(tabId, id) {
          if (typeof tabId !== 'string' || tabId === '' || typeof id !== 'string' || id === '') return;
          const previous = tabIds.get(tabId);
          if (previous !== undefined && previous !== id) idsByTab.delete(previous);
          tabIds.set(tabId, id);
          idsByTab.set(id, tabId);
          remember(id);
        },
        idOfTab(tabId) {
          return typeof tabId === 'string' ? tabIds.get(tabId) : undefined;
        },
        tabOfId(id) {
          return typeof id === 'string' ? idsByTab.get(id) : undefined;
        },
        /** A closed page no longer shows its side chat. */
        unbindTab(tabId) {
          const id = tabIds.get(tabId);
          tabIds.delete(tabId);
          if (id !== undefined && idsByTab.get(id) === tabId) idsByTab.delete(id);
        },
        /**
         * The child's reference for as long as a page shows it, the way the host's
         * own sidebar chat holds its child per tab record. A page body unmounts on
         * every session switch; holding only while mounted let the main column
         * drop the last reference when the user left the side chat open there,
         * so coming back tore that generation down and reopened a new one under
         * the panel in the same commit, and the panel stayed blank until reload.
         */
        hold(childId) {
          let reference = held.get(childId);
          if (reference === undefined) {
            reference = ctx.sessions.retain(childId, { source: 'sidebarChat' });
            held.set(childId, reference);
          }
          return reference;
        },
        /**
         * Let a child go once no page shows it — on the next tick, so a panel
         * still rendering it never reads a released binding, and a page that
         * replaced itself in place has bound its new tab by then. `gone` lets
         * it go even so: an archived or deleted child, whose page renders
         * none of it any more.
         */
        drop(childId, gone) {
          setTimeout(() => {
            const reference = held.get(childId);
            if (reference === undefined) return;
            if (gone !== true) {
              for (const entry of entries.values()) {
                if (entry.childId === childId && idsByTab.has(entry.id)) return;
              }
            }
            held.delete(childId);
            try { reference.release(); } catch (error) { /* already released */ }
          }, 0);
        },
        dropAll() {
          for (const reference of held.values()) {
            try { reference.release(); } catch (error) { /* already released */ }
          }
          held.clear();
        },
        /** Mark a child Reset is archiving, so it is not taken for archived elsewhere. */
        setResetting(childId, on) {
          if (on) resetting.add(childId);
          else resetting.delete(childId);
        },
        isResetting(childId) {
          return resetting.has(childId);
        },
      };
      return store;
    }

    /**
     * Whether a side chat's child left the user's chats elsewhere: archived (it
     * cannot be opened until restored) or deleted (no longer in the Host's
     * complete session list). False while either list is still arriving, so a
     * cold page never takes itself for gone.
     */
    function childGone(ctx, childId) {
      if (typeof childId !== 'string' || childId === '') return false;
      try {
        const workspaces = ctx.get('workspaces');
        const registry = workspaces === undefined || workspaces === null ? undefined : workspaces.list.getSnapshot();
        if (registry !== undefined && registry.phase === 'ready' && registry.archivedSessionIds.includes(childId)) return true;
      } catch (error) { /* no archive set to read */ }
      try {
        const list = ctx.sessions.list.getSnapshot();
        if (list.phase === 'ready' && !list.ids.includes(childId)) return true;
      } catch (error) { /* no session list to read */ }
      return false;
    }

    /** Subscribe to both lists `childGone` reads. */
    function subscribeChildLists(ctx, fn) {
      const off = [];
      try { off.push(ctx.sessions.list.subscribe(fn)); } catch (error) { /* no session list */ }
      try {
        const workspaces = ctx.get('workspaces');
        if (workspaces !== undefined && workspaces !== null) off.push(workspaces.list.subscribe(fn));
      } catch (error) { /* no archive set */ }
      return () => { for (const dispose of off) dispose(); };
    }

    /** The child a side-chat page shows: from the page in hand, else from its kept record. */
    function childOfTab(chats, tabId) {
      const id = chats.idOfTab(tabId);
      if (id !== undefined) return chats.get(id).childId;
      const record = readPage(tabId);
      return record !== null && typeof record.childId === 'string' && record.childId !== '' ? record.childId : null;
    }

    /**
     * Clean up after side chats archived or deleted elsewhere — from the
     * session list, or while the user had one open in the main column. A page
     * of the chat on screen closes (its close handler forgets its record and
     * lets the child go); a page of another chat can only close once that chat
     * is back on screen, so until then it just lets the child go.
     */
    function closeGoneSideChats(ctx, chats) {
      const sidebar = sidebarRightOf(ctx);
      if (sidebar === undefined || sidebar.openTabs === undefined || sidebar.mounted === undefined) return;
      let onScreen;
      let tabs;
      try {
        onScreen = sidebar.mounted.getSnapshot();
        tabs = sidebar.openTabs.getSnapshot();
      } catch (error) { return; }
      for (const tab of tabs) {
        if (tab.kind !== TAB_KIND) continue;
        const childId = childOfTab(chats, tab.tabId);
        if (childId === null || chats.isResetting(childId) || !childGone(ctx, childId)) continue;
        if (tab.sessionId === onScreen) {
          try { sidebar.close(tab.tabId); } catch (error) { /* already closed */ }
        } else {
          chats.drop(childId, true);
        }
      }
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

    /** The conversation root drawn for one session: the main column's first, else the panel's. */
    function conversationRootOf(sessionId) {
      let panel = null;
      try {
        for (const root of document.querySelectorAll(CONVERSATION)) {
          const owner = typeof root.dataset.conversationSession === 'string' ? root.dataset.conversationSession : '';
          if (sessionId !== undefined && sessionId !== '' && owner !== sessionId) continue;
          if (root.closest(SIDEBAR) === null) return root;
          if (panel === null) panel = root;
        }
      } catch (error) { /* nothing to read */ }
      return panel;
    }

    /**
     * Keep a composer's end in view: a long quote is written past the fold, and
     * the host's own focus takes `preventScroll`, so the box would otherwise show
     * its top. The scrollable ancestor is found by its computed overflow, since
     * the host's class names are per-build hashes.
     */
    function scrollComposerToEnd(sessionId) {
      const scroll = () => {
        const root = conversationRootOf(sessionId);
        const editor = root === null ? null : root.querySelector('[data-composer-input]');
        if (editor === null) return;
        editor.scrollTop = editor.scrollHeight;
        for (let node = editor.parentElement; node !== null; node = node.parentElement) {
          const style = window.getComputedStyle(node);
          if (style.overflowY !== 'auto' && style.overflowY !== 'scroll') continue;
          node.scrollTop = node.scrollHeight;
          return;
        }
      };
      scroll();
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(scroll);
    }

    /**
     * One session's transcript root in the main column — never the sidebar's own
     * copy of it, and never another session's: switching chats leaves the old
     * transcript in the document for a moment, and reading that one would hand a
     * new side chat the previous project's history.
     * @param sessionId - the session the transcript must belong to.
     */
    function mainTranscript(sessionId) {
      let fallback = null;
      try {
        for (const root of document.querySelectorAll(CONVERSATION)) {
          if (root.closest(SIDEBAR) !== null) continue;
          const owner = typeof root.dataset.conversationSession === 'string' ? root.dataset.conversationSession : '';
          if (sessionId !== undefined && sessionId !== '' && owner === sessionId) return root;
          if (fallback === null) fallback = root;
        }
      } catch (error) { /* no document, nothing to read */ }
      // Nothing claimed the id: keep the old behaviour rather than showing none.
      return sessionId === undefined || sessionId === '' ? fallback : (fallback !== null
        && (typeof fallback.dataset.conversationSession !== 'string' || fallback.dataset.conversationSession === '')
        ? fallback
        : null);
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
      const empty = { columnClass: '', html: '', messages: 0, turns: 0, hidden: 0 };
      const root = mainTranscript(parentId);
      const first = root === null ? null : root.querySelector('[data-chat-flow-key]');
      const column = first === null ? null : first.parentElement;
      if (root === null || column === null) return empty;
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
        html: kept.join(''),
        messages: items.length,
        turns: turns.size,
        hidden: items.length - kept.length,
      };
    }

    /** Row markers the host's CSS styles by; the rest stay unique to the live transcript. */
    const STYLED_CHAT_ATTRIBUTES = new Set(['data-chat-flow-kind', 'data-chat-group-part']);
    const URL_ATTRIBUTES = new Set(['href', 'src', 'xlink:href', 'action', 'formaction']);

    /**
     * Captured rows made inert before they are shown again. The markup comes
     * back from page params or localStorage, so anything that could run is
     * dropped, and so are the host's turn and anchor markers, which the host
     * looks up document-wide. Parsed in a template, whose content never loads
     * or runs anything.
     */
    function inertMarkup(html) {
      if (html === '') return '';
      const template = document.createElement('template');
      template.innerHTML = html;
      const root = template.content;
      for (const element of root.querySelectorAll('script, iframe, object, embed, link, meta, style, base')) element.remove();
      for (const element of root.querySelectorAll('*')) {
        for (const name of element.getAttributeNames()) {
          const lower = name.toLowerCase();
          if (lower.startsWith('on') || lower === 'srcdoc'
            || (lower.startsWith('data-chat-') && !STYLED_CHAT_ATTRIBUTES.has(lower))
            || (URL_ATTRIBUTES.has(lower) && /^\s*javascript:/i.test(element.getAttribute(name)))) {
            element.removeAttribute(name);
          }
        }
      }
      return template.innerHTML;
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
     * The fork copies an inclusive prefix verbatim, so an inherited event is the
     * parent's event at the same seq with the same type and time; the highest
     * such seq is that prefix's end. A seq alone is no proof: both sessions
     * keep numbering after the fork, so the child's own events reuse the seqs
     * of whatever the parent wrote since (a turn still running when it forked).
     * The boundary is the highest turn among the child's own events up to it —
     * the panel folds turns at or below it away.
     */
    function inheritedTurnBoundary(ctx, parentId, childId) {
      const parentEntries = windowEntries(ctx, parentId);
      const childEntries = windowEntries(ctx, childId);
      if (parentEntries === undefined || childEntries === undefined) return null;
      const parentEvents = new Map();
      for (const entry of parentEntries) if (entry.type === 'event') parentEvents.set(entry.event.seq, entry.event);
      let boundarySeq = null;
      for (const entry of childEntries) {
        if (entry.type !== 'event') continue;
        const seq = entry.event.seq;
        const copied = parentEvents.get(seq);
        if (copied === undefined || copied.type !== entry.event.type || copied.time !== entry.event.time) continue;
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
     * The last main-chat turn a sent side chat inherited: the fork's own record,
     * else the highest turn its panel marked inherited. Null when neither tells.
     */
    function forkTurnOf(entry) {
      if (typeof entry.boundaryTurn === 'number') return entry.boundaryTurn;
      let last = null;
      try {
        for (const body of document.querySelectorAll('[' + SIDE_CHILD + ']')) {
          if (body.getAttribute(SIDE_CHILD) !== entry.childId) continue;
          for (const item of body.querySelectorAll('[' + INHERITED + ']')) {
            const turn = itemTurn(item);
            if (turn !== undefined && (last === null || turn > last)) last = turn;
          }
        }
      } catch (error) { /* nothing on screen to read */ }
      return last;
    }

    /**
     * A quote from a main-chat turn the sent side chat never inherited — it was
     * forked before that turn, so it would get the passage without its context.
     * @returns what the notice tells the user, or null when the quote fits.
     */
    function staleQuote(selection, entry) {
      if (entry.childId === null || typeof selection.turn !== 'number') return null;
      const fork = forkTurnOf(entry);
      return fork !== null && selection.turn > fork ? { turn: selection.turn, fork: fork, index: entry.index } : null;
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

    /**
     * Re-derive a sent side chat's fork boundary each time its page opens it, so
     * a page that stored a wrong one — 1.2.0 and earlier took the main chat's
     * later seqs for inherited ones, folding the chat's own first turn away —
     * folds the right turns again. The main chat is held only for the read; a
     * boundary that cannot be told leaves the stored one alone.
     * @param reference - the page's own hold on the child.
     */
    async function recheckBoundary(ctx, chats, id, reference) {
      const entry = chats.get(id);
      if (entry.childId === null || entry.parentId === '') return;
      let parent;
      try {
        parent = ctx.sessions.retain(entry.parentId, { source: 'sidebarChat' });
        await Promise.all([parent.ready, reference.ready]);
        const turn = inheritedTurnBoundary(ctx, entry.parentId, entry.childId);
        const now = chats.get(id);
        if (turn === null || now.childId !== entry.childId || now.boundaryTurn === turn) return;
        chats.patch(id, { boundaryTurn: turn });
        refreshSideChatPage(ctx, chats, id);
      } catch (error) {
        /* either chat could not be opened: keep the stored boundary */
      } finally {
        if (parent !== undefined) { try { parent.release(); } catch (error) { /* already released */ } }
      }
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
      let reference;
      let handedOver = false;
      try {
        reference = ctx.sessions.retain(childId, { source: 'sidebarChat' });
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
        const release = () => { try { reference.release(); } catch (error) { /* already released */ } };
        if (handedOver) setTimeout(release, 30000);
        else {
          if (reference !== undefined) release();
          // The fork exists but never got its first message: archive it, or every
          // failed send would leave an unlinked copy of the main chat behind.
          archiveSession(ctx, childId).catch(() => { /* best effort */ });
        }
      }
      return childId;
    }

    /**
     * Archive one session and stop its activity.
     * @returns false when the workspace face is absent (nothing was archived).
     */
    async function archiveSession(ctx, sessionId) {
      const workspace = ctx.get('uiWorkspace');
      if (workspace === undefined || workspace === null || typeof workspace.archiveSession !== 'function') return false;
      await workspace.archiveSession(sessionId, { stopActivity: true });
      return true;
    }

    /** Send one pending panel: this is what creates the chat. */
    async function submitSideChat(ctx, chats, id, t) {
      const entry = chats.get(id);
      if (entry.id === '' || entry.busy) return;
      const text = entry.draft.trim();
      if (text === '') return;
      const index = entry.index > 0 ? entry.index : nextSideChatIndex(ctx, chats, entry.parentId);
      chats.patch(id, { busy: true, error: '', index: index });
      try {
        const childId = await createSideChat(ctx, entry.parentId, text, index);
        const boundaryTurn = inheritedTurnBoundary(ctx, entry.parentId, childId);
        // A quote sent here while the chat was being created was appended after
        // the text that went out; it moves on to the new chat's own composer.
        const now = chats.get(id).draft;
        const late = now.startsWith(entry.draft) ? now.slice(entry.draft.length).trim() : '';
        chats.patch(id, { childId: childId, boundaryTurn: boundaryTurn, first: text, draft: '', busy: false, error: '' });
        // Record the child (and the boundary) in the page's own params.
        refreshSideChatPage(ctx, chats, id);
        if (late !== '' && !(await writeDraft(ctx, childId, late + '\n\n', 25))) {
          chats.patch(id, { error: t('sideChat.quoteFailed') });
        }
      } catch (error) {
        chats.patch(id, { busy: false, error: String((error && error.message) || error) });
      }
    }

    /** `Reset side chat`: archive the session and start over in this same page. */
    async function resetSideChat(ctx, chats, id, t) {
      const entry = chats.get(id);
      if (entry.id === '') return;
      if (entry.childId !== null) {
        // This archive is the page's own: it starts over instead of closing.
        chats.setResetting(entry.childId, true);
        try {
          await archiveSession(ctx, entry.childId);
        } catch (error) {
          chats.setResetting(entry.childId, false);
          chats.patch(id, { error: t('sideChat.resetFailed', { message: String((error && error.message) || error) }) });
          return;
        }
      }
      // A fresh number: the archived chat keeps the old one, so titles stay
      // distinct, and the reset page goes back to a plain composer. Its next
      // send forks from the main chat's latest completed turn, so the history
      // shown above the composer is taken again from the main chat as it is
      // now; with the main chat off screen there is nothing to read, and the
      // old snapshot stays.
      chats.patch(id, {
        index: nextSideChatIndex(ctx, chats, entry.parentId),
        inherited: mainTranscript(entry.parentId) === null ? entry.inherited : captureInherited(ctx.sessions, entry.parentId),
        childId: null,
        boundaryTurn: null,
        first: '',
        draft: '',
        busy: false,
        error: '',
        collapsed: true,
        focusToken: entry.focusToken + 1,
      });
      if (entry.childId !== null) {
        chats.setResetting(entry.childId, false);
        chats.drop(entry.childId);
      }
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

    /** Menu shortcuts while the card is up: the key it answers and the chip that shows it. */
    const MENU_KEYS = {
      main: { key: 'm', chip: 'M', aria: 'M' },
      side: { key: 's', chip: 'S', aria: 'S' },
      chat: { key: 'Enter', chip: '↵', aria: 'Enter' },
      new: { key: 'Enter', chip: '↵', aria: 'Enter' },
      cancel: { key: 'Escape', chip: 'Esc', aria: 'Escape' },
    };

    /**
     * Which menu entry `key` picks in this card state; Escape always dismisses.
     * A non-Latin layout types another letter on the M and S keys (`ь`, `ы`),
     * so such a letter is read by its key position, `code`, instead.
     */
    function menuKey(state, key, code) {
      if (state.pending === null || typeof key !== 'string') return undefined;
      const offered = state.notice !== undefined ? ['cancel', 'new']
        : (state.pending.side !== '' ? ['chat', 'cancel'] : ['main', 'side', 'cancel']);
      const foreign = /^\p{L}$/u.test(key) && !/^[a-z]$/i.test(key) && typeof code === 'string' && /^Key[A-Z]$/.test(code);
      const pressed = foreign ? code.slice(3).toLowerCase() : (key.length === 1 ? key.toLowerCase() : key);
      return offered.find((name) => MENU_KEYS[name].key === pressed);
    }

    /** 24-grid outline icons (Tabler, MIT), drawn in the text colour. */
    const ICONS = {
      refresh: 'M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4',
      plus: 'M12 5v14M5 12h14',
      chevronRight: 'M9 6l6 6l-6 6',
      chevronDown: 'M6 9l6 6l6 -6',
      quote: 'M10 11h-4a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1h3a1 1 0 0 1 1 1v6c0 2.667 -1.333 4.333 -4 5M19 11h-4a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1h3a1 1 0 0 1 1 1v6c0 2.667 -1.333 4.333 -4 5',
    };

    function icon(name) {
      return h('svg', {
        className: 'dsh-note-icon', 'data-icon': name, viewBox: '0 0 24 24', width: 14, height: 14, 'aria-hidden': true,
        fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
      }, h('path', { d: ICONS[name] }));
    }

    const CSS = `
.dsh-note-card {
  position: fixed; z-index: 2147483000; box-sizing: border-box;
  display: flex; flex-direction: column; overflow: hidden;
  font-family: inherit; font-size: 12px; line-height: 1.4;
  color: var(--dsw-alias-label-primary);
  /* One white, outlined card: the host's overlay token is a grey fill in the light theme. */
  background: var(--dsw-alias-bg-layer-1);
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: 10px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  animation: dsh-note-in 120ms ease-out;
}
@keyframes dsh-note-in { from { opacity: 0; transform: translateY(-2px); } }
@media (prefers-reduced-motion: reduce) { .dsh-note-card { animation: none; } }
/* Where the selection sits, in the UI language: a pale band over the entries. */
.dsh-note-where {
  /* Zero width, stretched by min-width: the entries alone size the card, and
     a location longer than them ends in an ellipsis. */
  box-sizing: border-box; width: 0; min-width: 100%;
  display: flex; align-items: center; gap: 4px; padding: 3px 10px;
  font-size: 11px; line-height: 14px; white-space: nowrap; color: var(--dsw-alias-label-tertiary);
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 3%, transparent);
  border-bottom: 0.5px solid var(--dsw-alias-border-l2);
}
.dsh-note-whereText { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.dsh-note-menu { display: flex; align-items: center; gap: 10px; padding: 4px 10px; }
/* The notice reads as a short paragraph, its answers right-aligned under a hairline. */
.dsh-note-notice { max-width: 300px; padding: 8px 10px; white-space: normal; }
.dsh-note-noticeActions { justify-content: flex-end; border-top: 0.5px solid var(--dsw-alias-border-l2); }
.dsh-note-card .dsh-note-error { padding: 0 10px 5px; }
/* Borderless entries, each led by its key chip. The negative margin keeps the
   hover fill from pushing the text apart. */
.dsh-note-btn {
  flex: 0 0 auto; display: inline-flex; align-items: center; gap: 4px;
  margin: 0 -4px; padding: 2px 4px; font: inherit; white-space: nowrap; cursor: pointer; border-radius: 5px;
  border: none; background: transparent; color: var(--dsw-alias-label-primary);
}
.dsh-note-btn:hover { background: color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent); }
.dsh-note-btn[disabled] { opacity: 0.5; cursor: default; }
.dsh-note-btn-primary { font-weight: 500; }
.dsh-note-sep { flex: none; width: 1px; height: 14px; background: var(--dsw-alias-border-l3); }
.dsh-note-key {
  /* One height for every chip, whatever its glyph: M, S, ↵ or Esc. */
  box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center;
  height: 15px; min-width: 15px; padding: 0 3px;
  font: inherit; font-size: 10px; font-weight: 400; line-height: 1;
  color: var(--dsw-alias-label-secondary);
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 4%, transparent);
  border: 0.5px solid var(--dsw-alias-border-l4); border-radius: 3px;
}
/* The entry the card leans toward: its key on the composer's pale send blue. */
.dsh-note-btn-primary .dsh-note-key {
  color: var(--dsw-alias-state-business-primary);
  color: color-mix(in srgb, var(--dsw-alias-state-business-primary) 80%, var(--dsw-alias-label-primary));
  background: var(--dsw-alias-state-business-tertiary);
  border-color: color-mix(in srgb, var(--dsw-alias-state-business-primary) 40%, transparent);
}
.dsh-note-panel {
  box-sizing: border-box; display: flex; flex-direction: column; gap: 8px;
  width: 100%; height: 100%; min-height: 0; padding: 12px;
  font-family: inherit; font-size: 13px; line-height: 1.5;
  color: var(--dsw-alias-label-primary);
}
/* Outlined, icon-led Reset and New; the inherited-turns toggle, plain text, on the right. */
.dsh-note-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; flex: none; }
.dsh-note-tool {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 5px 9px; font: inherit; font-size: 12px; line-height: 14px; white-space: nowrap; cursor: pointer; border-radius: 6px;
  color: var(--dsw-alias-label-primary);
  background: transparent;
  border: 0.5px solid var(--dsw-alias-border-l4);
}
.dsh-note-tool:hover { background: color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent); }
.dsh-note-icon { flex: none; }
.dsh-note-tool-warn {
  /* Reset archives the current chat: a dark amber label, apart from New beside
     it. Without color-mix it stays the host's plain warning label colour. */
  color: var(--dsw-alias-state-warn-label);
  color: color-mix(in srgb, var(--dsw-alias-state-warn-label) 70%, var(--dsw-alias-label-primary));
}
.dsh-note-tool-warn:hover {
  background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 8%, transparent);
}
.dsh-note-tool-toggle {
  margin-left: auto; padding: 5px 2px; border-color: transparent;
  color: var(--dsw-alias-label-secondary);
}
.dsh-note-tool-toggle:hover, .dsh-note-tool-toggle[data-active] {
  background: transparent; color: var(--dsw-alias-label-primary);
}
.dsh-note-sideBody { flex: 1 1 auto; min-height: 0; display: flex; }
/* The fork's inherited prefix, folded away until the toolbar is asked to show it. */
.dsh-note-sideBody[data-dsh-sidechat-collapsed] [data-dsh-sidechat-inherited] { display: none; }
/* The room under the toolbar splits the way a sent side chat does: the
   transcript takes two thirds (scrolling in the main chat's own container), the
   composer one. */
.dsh-note-transcript {
  position: relative; flex: 1 1 auto; min-height: 0; overflow: hidden;
  display: flex; flex-direction: column;
}
/* The rows scroll inside the transcript, so nothing paints over the composer. */
.dsh-note-transcriptRows {
  flex: 1 1 auto; min-height: 0; overflow: auto;
  display: flex; flex-direction: column; padding: 4px 0; box-sizing: border-box;
}
/* The captured rows carry the main chat's own classes; only their controls are
   dropped, since a clone has no handlers. */
.dsh-note-transcript > div { min-width: 0; }
.dsh-note-transcript button, .dsh-note-transcript [role="button"] { display: none; }
.dsh-note-empty { padding: 8px 0; font-size: 12px; color: var(--dsw-alias-label-tertiary); }
/* The composer card, its type and its send button copy the host composer
   (InputBar.module.css): same panel radius, input fill and elevation, the same
   content font size, and the same 34px round send button. */
.dsh-note-composer {
  /* Twice the height the card had, pinned under the transcript the way the host
     composer sits under the chat: the history keeps the room it does not need. */
  flex: 0 0 auto; min-height: 172px; max-height: 45%; overflow: auto; box-sizing: border-box;
  display: flex; flex-direction: column;
  padding: 4px 8px 6px;
  font-size: var(--dsh-content-font-size, 14px);
  line-height: calc(24px + var(--dsh-content-font-delta, 0px));
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-specific-input-major, var(--dsw-alias-bg-layer-1));
  --dsw-elevation-stroke-color: var(--dsw-alias-border-l2);
  box-shadow: var(--dsw-elevation-soft);
  border: 0; border-radius: var(--dsw-radius-panel, 12px);
}
.dsh-note-input {
  flex: 1 1 auto; min-height: 72px; width: 100%; box-sizing: border-box;
  display: block; resize: none; padding: 4px 8px 0 14px;
  font-family: var(--dsw-font-family); font-size: inherit; line-height: inherit;
  color: inherit; caret-color: var(--dsw-alias-state-business-primary);
  background: transparent; border: none;
}
.dsh-note-input::placeholder { color: var(--dsw-alias-label-caption); }
.dsh-note-input:focus { outline: none; }
.dsh-note-composerRow {
  flex: none; display: flex; align-items: center; justify-content: flex-end; gap: 12px;
  padding: 2px 8px 6px; min-width: 0;
}
.dsh-note-sendBtn {
  display: inline-flex; align-items: center; gap: 6px; flex: none;
  height: 32px; padding: 0 14px; cursor: pointer;
  font: inherit; font-size: 13px; white-space: nowrap;
  color: #fff; background: var(--dsw-alias-button-info-fill);
  border: none; border-radius: var(--dsw-radius-md, 8px);
}
.dsh-note-sendBtn:hover:not(:disabled) { background: var(--dsw-alias-button-info-hover); }
.dsh-note-sendBtn:disabled { opacity: 0.4; cursor: default; }
.dsh-note-toolNote { margin-left: auto; font-size: 12px; color: var(--dsw-alias-label-secondary); }
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
        // A notice waits for its answer: the click that raised it still ends in
        // a selection event, and only a click outside the card dismisses it.
        if (store.getSnapshot().notice !== undefined) return;
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
        // A side chat archived or deleted elsewhere is no destination: it closes.
        const target = active !== undefined && active.id !== '' && active.parentId === parentId
          && !childGone(ctx, active.childId) ? active : undefined;
        // The open side chat was forked before the quoted turn: say so, and let
        // the user pick a new side chat or nothing at all.
        const notice = target === undefined ? null : staleQuote(selection, target);
        if (notice !== null) { store.set({ pending: selection, error: '', notice: notice }); return; }
        clearSelection();
        store.set({ pending: null, error: '' });
        if (target !== undefined && target.childId !== null) {
          // The chat exists: the quote joins that conversation's composer draft,
          // and the composer takes the focus once the panel is up. A chat that
          // takes too long to load gets the menu back with an error, rather
          // than the quote vanishing.
          revealSideChat(ctx, chats, target);
          if (!(await writeDraft(ctx, target.childId, text, 25))) {
            store.set({ pending: selection, error: t('sideChat.quoteFailed') });
          }
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
        await openNewSideChat(parentId, selection);
      }

      /**
       * A new side-chat page holding the quote. Like every side chat it forks
       * when sent, from the main chat's latest completed turn.
       */
      async function openNewSideChat(parentId, selection) {
        const created = chats.create(parentId);
        chats.patch(created.id, { draft: draftQuote(selection) });
        if (!(await openSideChatPage(ctx, chats.get(created.id)))) {
          store.set({ pending: selection, error: t('sideChat.empty') });
        }
      }

      /** The notice's yes: the quote goes to a new side chat instead. */
      async function toNewSide(selection) {
        const parentId = currentSessionId(ctx);
        if (parentId === '') { store.set({ pending: selection, error: t('sideChat.empty') }); return; }
        clearSelection();
        store.set({ pending: null, error: '' });
        await openNewSideChat(parentId, selection);
      }

      /** The notice's no: nothing is sent; the card and the highlight go away. */
      function cancel() {
        clearSelection();
        store.set({ pending: null, error: '' });
      }

      /**
       * Send to chat, offered inside a sent side chat: the quote joins that
       * side chat's own composer. It is on screen, so its input is up.
       */
      async function toChat(selection) {
        clearSelection();
        store.set({ pending: null, error: '' });
        if (!(await writeDraft(ctx, selection.side, draftQuote(selection), 25))) {
          store.set({ pending: selection, error: t('sideChat.quoteFailed') });
        }
      }

      /**
       * The card's key chips, live while it is up. Typing in any field, a
       * shortcut chord or an IME composition is never taken; a key the card
       * answers is kept from the host and from the composer it focuses.
       */
      const onKeyDown = (event) => {
        if (event.defaultPrevented || event.isComposing) return;
        if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
        const target = event.target;
        if (target instanceof Element
          && (target.closest('input, textarea, select') !== null || target.isContentEditable === true)) return;
        // Enter on a focused control is that control's own — a host button, or
        // one of the card's (a tabbed-to Cancel must cancel, not send).
        if (event.key === 'Enter' && target instanceof Element
          && target.closest('button, a[href], [role="button"], summary') !== null) return;
        const state = store.getSnapshot();
        const name = menuKey(state, event.key, event.code);
        if (name === undefined) return;
        event.preventDefault();
        event.stopPropagation();
        const actions = { main: toMain, side: toSide, chat: toChat, new: toNewSide, cancel: cancel };
        void actions[name](state.pending);
      };

      reactRoot.render(h(Overlay, {
        t: t,
        store: store,
        toMain: (selection) => { void toMain(selection); },
        toSide: (selection) => { void toSide(selection); },
        toChat: (selection) => { void toChat(selection); },
        toNewSide: (selection) => { void toNewSide(selection); },
        cancel: cancel,
      }));

      document.addEventListener('selectionchange', schedule);
      document.addEventListener('mouseup', schedule);
      document.addEventListener('keyup', schedule);
      document.addEventListener('mousedown', onNativeMouseDown, true);
      document.addEventListener('keydown', onKeyDown, true);
      recompute();

      return () => {
        document.removeEventListener('selectionchange', schedule);
        document.removeEventListener('mouseup', schedule);
        document.removeEventListener('keyup', schedule);
        document.removeEventListener('mousedown', onNativeMouseDown, true);
        document.removeEventListener('keydown', onKeyDown, true);
        if (debounce !== undefined) clearTimeout(debounce);
        setTimeout(() => { reactRoot.unmount(); });   // same-frame unmount warns in React
        host.remove();
        style.remove();
      };
    }

    /**
     * The menu anchored under the selection: two items in the main chat, one —
     * Send to chat — inside a sent side chat. When a quote would reach a side
     * chat forked before its turn, the card turns into a notice that asks first.
     */
    function Overlay(props) {
      const t = props.t;
      const state = React.useSyncExternalStore(
        props.store.subscribe,
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
      // One entry: its key chip, then its label; `primary` is the one the card leans toward.
      const entry = (name, label, primary, onClick) => h('button', {
        className: primary ? 'dsh-note-btn dsh-note-btn-primary' : 'dsh-note-btn', type: 'button',
        'aria-keyshortcuts': MENU_KEYS[name].aria,
        onClick: onClick,
      }, h('kbd', { className: 'dsh-note-key' }, MENU_KEYS[name].chip), label);
      const notice = state.notice;
      if (notice !== undefined) {
        return h('div', { className: 'dsh-note-card', ref: cardRef, [OURS]: '', role: 'alertdialog' },
          h('div', { className: 'dsh-note-notice' }, t('sideChat.staleQuote', notice)),
          h('div', { className: 'dsh-note-menu dsh-note-noticeActions' },
            entry('cancel', t('action.cancel'), false, () => props.cancel()),
            h('span', { className: 'dsh-note-sep' }),
            entry('new', t('action.toNewSide'), true, () => props.toNewSide(selection))));
      }
      const where = whereLabel(selection, t);
      return h('div', { className: 'dsh-note-card', ref: cardRef, [OURS]: '' },
        // The band never widens the card; cut short, it shows in full on hover.
        h('div', { className: 'dsh-note-where', title: where },
          icon('quote'), h('span', { className: 'dsh-note-whereText' }, where)),
        selection.side !== ''
          ? h('div', { className: 'dsh-note-menu' },
              entry('chat', t('action.toChat'), true, () => props.toChat(selection)))
          : h('div', { className: 'dsh-note-menu' },
              entry('main', t('action.toMain'), false, () => props.toMain(selection)),
              h('span', { className: 'dsh-note-sep' }),
              entry('side', t('action.toSide'), true, () => props.toSide(selection))),
        state.error === '' ? null : h('div', { className: 'dsh-note-error' }, state.error),
      );
    }

    // ── the side-chat page ──────────────────────────────────────────────────

    /**
     * One side-chat page body. Before the page is sent it is a plain composer —
     * holding a quote when the menu opened it, empty when the sidebar's guide
     * opened it, since a side chat needs no quote. Once sent it declares its own
     * `CONVERSATION_SLOT` child slot and wraps it in the framework
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
      // Where this page's identity comes from, best first: the navigation params
      // it was opened with, the record this plugin kept for the tab (which is
      // all a reloaded page has, since the sidebar persists layouts but not
      // params), or a fresh side chat for a guide-opened page.
      const fromParams = typeof bag.id === 'string' && bag.id !== '';
      const stored = fromParams ? null : readPage(tabId);
      const id = fromParams ? bag.id : (stored === null ? props.sideChatForTab(tabId, parentId) : stored.id);
      const source = fromParams ? bag : stored;
      props.chats.ensure(id, {
        parentId: source !== null && typeof source.parentId === 'string' && source.parentId !== ''
          ? source.parentId : parentId,
        index: source !== null && Number.isSafeInteger(source.index) ? source.index : 1,
        childId: source !== null && typeof source.childId === 'string' ? source.childId : null,
        boundaryTurn: source !== null && Number.isSafeInteger(source.boundaryTurn) ? source.boundaryTurn : null,
        first: source !== null && typeof source.first === 'string' ? source.first : '',
        inherited: source !== null && source.inherited !== null && typeof source.inherited === 'object'
          ? source.inherited : null,
        draft: source !== null && typeof source.draft === 'string' ? source.draft : '',
      });
      props.chats.bindTab(tabId, id);
      const entry = React.useSyncExternalStore(
        props.chats.subscribe,
        () => props.chats.get(id),
      );
      const childId = entry.childId;
      const hasChild = typeof childId === 'string' && childId !== '';
      // A child archived or deleted elsewhere is never rendered or held again:
      // its page closes once its chat is on screen and says so until then.
      const gone = React.useSyncExternalStore(props.subscribeChildLists,
        () => hasChild && props.childGone(childId));
      // A pending page belongs to the chat its pane shows: if the column moved to
      // another session while this page was up, take that session's history
      // rather than leaving the page bound to the one it was born in.
      React.useEffect(() => {
        if (hasChild || paneSessionId === '' || entry.parentId === '' || entry.parentId === paneSessionId) return;
        props.chats.patch(id, {
          parentId: paneSessionId,
          inherited: captureInherited(props.sessions, paneSessionId),
        });
      }, [hasChild, paneSessionId, entry.parentId, id]);
      const boundaryTurn = entry.boundaryTurn;
      const first = entry.first;
      const origin = entry.inherited;
      const originHtml = origin === null ? '' : origin.html;
      const shownHtml = React.useMemo(() => inertMarkup(originHtml), [originHtml]);
      const cwd = typeof bag.cwd === 'string' ? bag.cwd : undefined;
      const [reference, setReference] = React.useState(null);
      const [failed, setFailed] = React.useState(false);
      const [inherited, setInherited] = React.useState(0);
      const composerRef = React.useRef(null);
      const bodyRef = React.useRef(null);
      const rowsRef = React.useRef(null);

      // The reference outlives this body: the page holds it until it closes or
      // resets, so a session switch never drops the side chat's last one.
      React.useEffect(() => {
        if (typeof childId !== 'string' || childId === '' || gone) { setReference(null); setFailed(false); return; }
        try {
          setReference(props.chats.hold(childId));
          setFailed(false);
        } catch (error) {
          setFailed(true);
        }
      }, [childId, gone]);

      React.useEffect(() => {
        if (reference !== null) void props.recheckBoundary(id, reference);
      }, [reference]);

      // The inherited history opens at its end, the way a sent chat's transcript
      // does: the newest turns sit right above the composer instead of the page
      // showing the oldest ones with the rest hidden below the fold.
      React.useEffect(() => {
        const node = rowsRef.current;
        if (node === null) return undefined;
        const toEnd = () => { node.scrollTop = node.scrollHeight; };
        toEnd();
        const frame = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(toEnd) : null;
        return () => { if (frame !== null) cancelAnimationFrame(frame); };
      }, [hasChild, originHtml]);

      // The pending composer takes the keyboard when the panel appears and each
      // time an outside action (the quote menu) puts text in it, with the caret
      // after that text. Keyed on the token, so typing never moves the caret.
      React.useEffect(() => {
        const node = composerRef.current;
        if (node === null || entry.busy) return;
        node.focus({ preventScroll: true });
        const end = node.value.length;
        try { node.setSelectionRange(end, end); } catch (error) { /* not selectable */ }
        // A long quote reaches past the fold; show its end, where the caret is.
        node.scrollTop = node.scrollHeight;
      }, [entry.focusToken, entry.busy]);

      // Mark the fork's inherited flow items, and keep marking them as older
      // history pages arrive. `inherited` is what the toolbar toggles. Keyed on
      // `reference` too: the body only renders once the retain lands, after
      // this effect first ran against no body at all.
      React.useEffect(() => {
        const node = bodyRef.current;
        if (node === null) { setInherited(0); return undefined; }
        let frame = null;
        const mark = () => {
          frame = null;
          const items = Array.from(node.querySelectorAll('[data-chat-flow-key]'));
          const cut = ownMessageIndex(items, first, boundaryTurn);
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
      }, [boundaryTurn, childId, first, reference]);

      // Reset (destructive, caution-toned label) sits left of New (additive):
      // same outlined shape, different icon, colour and tooltip.
      const tools = h('div', { className: 'dsh-note-tools' },
        h('button', {
          className: 'dsh-note-tool dsh-note-tool-warn', type: 'button',
          title: t('sideChat.resetHint'),
          onClick: () => { void props.resetSideChat(id); },
        }, icon('refresh'), t('sideChat.reset')),
        h('button', {
          className: 'dsh-note-tool dsh-note-tool-primary', type: 'button',
          title: t('sideChat.newHint'),
          onClick: () => props.newSideChat(id),
        }, icon('plus'), t('sideChat.new')),
        hasChild && inherited > 0
          ? h('button', {
              className: 'dsh-note-tool dsh-note-tool-toggle', type: 'button',
              'data-active': entry.collapsed ? undefined : true,
              title: entry.collapsed ? t('sideChat.showInherited') : t('sideChat.hideInherited'),
              onClick: () => props.chats.patch(id, { collapsed: !entry.collapsed }),
            }, icon(entry.collapsed ? 'chevronRight' : 'chevronDown'),
              t(inherited === 1 ? 'sideChat.inheritedOne' : 'sideChat.inherited', { turns: inherited }))
          : (!hasChild && entry.inherited !== null && entry.inherited.turns > 0
              ? h('span', { className: 'dsh-note-toolNote' }, t(entry.inherited.turns === 1 ? 'sideChat.inheritedOne' : 'sideChat.inherited', { turns: entry.inherited.turns }))
              : null),
      );

      if (hasChild) {
        if (gone) return h('div', { className: 'dsh-note-panel', [OURS]: '' }, h('div', { className: 'dsh-note-empty' }, t('sideChat.gone')));
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
            [SIDE_CHILD]: childId,
            ...entry.collapsed ? { [COLLAPSED]: '' } : {},
          }, h(props.SessionProvider, { session: reference },
            props.renderSlot(CONVERSATION_SLOT, {}))),
        );
      }

      const send = () => props.sendSideChat(id);
      // Before the chat exists the panel already looks like one that has been
      // sent to: the same toolbar, the main chat's own rows inside the main
      // chat's own scroll container, and a composer card below them.
      const transcript = h('div', { className: 'dsh-note-transcript' },
        h('div', { className: 'dsh-note-transcriptRows', ref: rowsRef },
          origin === null || origin.html === ''
            ? h('div', { className: 'dsh-note-empty' }, t('sideChat.inheritEmpty'))
            : [
                origin.hidden === 0
                  ? null
                  : h('div', { className: 'dsh-note-empty' }, t('sideChat.inheritMore', { messages: origin.hidden })),
                h('div', {
                  key: 'rows',
                  className: origin.columnClass || '',
                  dangerouslySetInnerHTML: { __html: shownHtml },
                }),
              ],
        ),
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
              title: t('sideChat.send'),
              'aria-label': t('sideChat.send'),
              disabled: entry.busy || entry.draft.trim() === '',
              onClick: send,
            },
              h('svg', { viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': true },
                h('path', {
                  fill: 'currentColor',
                    d: 'M8.3125 0.980183C8.66767 1.0531 8.97902 1.20418 9.2627 1.43233C9.48724 1.61297 9.73029 1.85793 9.97949 2.10714L14.707 6.83468L13.293 8.24874L9 3.95577V15.0417H7V3.95577L2.70703 8.24874L1.29297 6.83468L6.02051 2.10714C6.26971 1.85793 6.51277 1.61297 6.7373 1.43233C6.97662 1.23986 7.28445 1.04402 7.6875 0.980183C7.8973 0.947006 8.1031 0.95516 8.3125 0.980183Z',
                })),
              t('sideChat.send')),
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
      const id = typeof bound === 'string' ? bound : (typeof bag.id === 'string' && bag.id !== '' ? bag.id : '');
      const entry = React.useSyncExternalStore(
        props.chats.subscribe,
        () => props.chats.get(id),
      );
      const stored = id === '' ? readPage(tabId) : null;
      const index = entry.index > 0 ? entry.index
        : (Number.isSafeInteger(bag.index) ? bag.index
          : (stored !== null && Number.isSafeInteger(stored.index) ? stored.index : 1));
      return h('span', null, props.t('sideChat.chip', { index: index }));
    }

    /** The embedded conversation's one view, fixed to Chat. Module-level, so the
     *  factory keeps the same component across renders instead of remounting it. */
    function ChatView(viewProps) {
      return viewProps.renderSlot('conversation.session', { view: 'chat' });
    }

    /**
     * The panel registered into this page's `CONVERSATION_SLOT`: the standard
     * session kit supplies `sessionId` and the factory renderer the shipped
     * conversation content needs. A fork always carries its inherited turns and
     * its first message, so it is never blank and the phase is always active.
     */
    function SideChatPanel(props) {
      if (typeof props.sessionId !== 'string' || props.sessionId === '') {
        return h('div', { style: { padding: '16px' } }, props.t('sideChat.empty'));
      }
      return props.renderFactorySlot('conversation.content',
        { variant: 'embedded', phase: 'active', hero: false },
        { slots: { views: ChatView } });
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
        nextDraft: nextDraft,
        ownMessageIndex: ownMessageIndex,
        inheritedTurnBoundary: inheritedTurnBoundary,
        recheckBoundary: recheckBoundary,
        stepOf: stepOf,
        staleQuote: staleQuote,
        whereLabel: whereLabel,
        menuKey: menuKey,
        childGone: childGone,
        closeGoneSideChats: closeGoneSideChats,
        Overlay: Overlay,
        selectionText: selectionText,
        capture: capture,
        sideChatTitle: sideChatTitle,
        nextSideChatIndex: nextSideChatIndex,
      },
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh: zh, en: en }), 'dsh-annotate-sidechat: dictionaries');
        const t = ctx.locale.bind(NS);
        const chats = createSideChats(ctx);
        ctx.effect(() => () => chats.dropAll(), 'dsh-annotate-sidechat: side chat references');

        // Side chats archived or deleted elsewhere are cleaned up whenever either
        // list changes and whenever a chat comes on screen, where its pages can close.
        let sweep;
        const scheduleSweep = () => {
          if (sweep !== undefined) return;
          sweep = setTimeout(() => { sweep = undefined; closeGoneSideChats(ctx, chats); }, 0);
        };
        ctx.effect(() => ctx.inject(['sidebarRight', 'workspaces'], (scope) => {
          const sidebar = scope.get('sidebarRight');
          const off = [subscribeChildLists(ctx, scheduleSweep)];
          if (sidebar !== undefined && sidebar !== null && sidebar.mounted !== undefined
            && typeof sidebar.mounted.subscribe === 'function') off.push(sidebar.mounted.subscribe(scheduleSweep));
          scheduleSweep();
          return () => {
            for (const dispose of off) dispose();
            if (sweep !== undefined) { clearTimeout(sweep); sweep = undefined; }
          };
        }), 'dsh-annotate-sidechat: archived or deleted side chats');

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
            sendSideChat: (id) => { void submitSideChat(ctx, chats, id, t); },
            recheckBoundary: (id, reference) => recheckBoundary(ctx, chats, id, reference),
            // One stable pair, so a page's subscription never churns.
            childGone: (childId) => !chats.isResetting(childId) && childGone(ctx, childId),
            subscribeChildLists: (fn) => subscribeChildLists(ctx, fn),
          };
          const disposeBody = ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
            name: 'sidebar.right.pane.tab',
            key: TAB_ID,
            children: { [CONVERSATION_SLOT]: { kind: 'single', scope: 'session' } },
            locale: NS,
            // Session-scoped slots hand the injector the pane's own session id.
            inject: (sessionId) => ({
              ...shared,
              sessions: ctx.sessions,
              sessionId: sessionId,
              sideChatForTab: (tabId, parentId) => chats.forTab(tabId, parentId),
            }),
          }, SideChatTab));
          // A closed page is remembered no longer, and lets its side chat go;
          // nothing would restore it.
          const disposeClose = ctx.inject(['sidebarRight'], (scope) => {
            const sidebar = scope.get('sidebarRight');
            if (sidebar === undefined || sidebar === null || typeof sidebar.registerCloseHandler !== 'function') return;
            // The inventory reads every saved layout before the service is
            // published, so it already knows each tab a record could belong to.
            const inventory = sidebar.openTabs;
            if (inventory !== undefined && inventory !== null && typeof inventory.getSnapshot === 'function') {
              try { sweepPages(inventory.getSnapshot()); } catch (error) { /* keep every record */ }
            }
            const dispose = sidebar.registerCloseHandler(TAB_KIND, (sessionId, tab) => {
              const tabId = tab === undefined || tab === null ? '' : tab.id;
              const entry = chats.get(chats.idOfTab(tabId));
              chats.unbindTab(tabId);
              if (entry.childId !== null) chats.drop(entry.childId);
              forgetPage(tabId);
            });
            return () => { try { dispose(); } catch (error) { /* already released */ } };
          });
          const disposeTitle = ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
            name: 'sidebar.right.pane.tab.title',
            key: TAB_ID,
            locale: NS,
            inject: () => ({ chats: chats }),
          }, SideChatChip));
          const disposeChat = ctx.slots.inject(CONVERSATION_SLOT, () => ctx.slots.register({
            name: CONVERSATION_SLOT,
            locale: NS,
          }, SideChatPanel));
          return () => { disposeChat(); disposeTitle(); disposeBody(); disposeClose(); disposeType(); };
        }), 'dsh-annotate-sidechat: side chat tab');
      },
    };
  },
});

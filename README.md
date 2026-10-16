# dsh-annotate-sidechat

A DeepSeek Harness (DSH) Web plugin: **select text in an assistant reply, then
send the located quote to the main chat or to a side chat**.

```
划选 assistant 回复  →  两个选项：Send to main chat / Send to side chat
                        ├─ 主对话：引用内容追加到输入框（空一行，末尾换行，光标到位）
                        └─ 侧边对话：引用进入当前打开的 sidechat，没有就新建一个
```

> **Status: 0.1.0 — checked headlessly (`node check.mjs`), not yet verified in a
> browser.** See [Checks](#checks).

## What it does

1. **Select** text inside an assistant reply of the main chat. A two-item menu
   opens right below the selection. Nothing inside the right sidebar, and no
   control or code-block chrome, is treated as quotable.
2. **Send to main chat** appends the quote to the main composer draft: the text
   already there, one blank line, then the quote. Either destination ends the
   draft with a blank line and hands the composer the keyboard, so the caret
   waits on a fresh line with room to write. A quote that outgrows the box also
   scrolls it to the end, in the panel's own composer and in the host composer
   alike (the host's focus takes `preventScroll`, so the plugin scrolls it). (The primary menu entry keeps its brand
   fill while hovered — it never flashes the light layer colour.)
3. **The quote is English-located** — which spot of the transcript is being
   quoted, then the passage as a block quote:

   ```
   Quoted from the assistant's reply (turn 3, paragraph 2):
   > the selected passage
   > continues here
   <a blank line stays under the quote, for your own words>
   ```
4. **Send to side chat** goes to the side chat the right sidebar is showing. With
   none open it opens a new page; with several open, the one you are looking at
   gets the quote. When that page is still a draft the quote joins its composer;
   once the chat exists the quote joins that chat's own composer.
5. **A side chat needs no quote.** The page is also offered in the right
   sidebar's guide (the strip's add control / the empty column), and a side chat
   opened that way starts with an empty composer you simply type into *and looks
   like a side chat that has already been sent to*: the same toolbar (with the
   inherited-turn count where the sent panel shows its fold toggle), a scrolling
   transcript of the main chat's own rows, and — pinned under it, only as tall as
   its own content — a composer card that copies the host composer (`InputBar`):
   its panel radius, input fill and soft elevation, the conversation's font size
   and line height, and its primary fill for a labelled rectangular send button
   (arrow glyph + text), right-aligned in the card. Both side-panel composers —
   this one and the host composer a side chat gets once it exists — stand twice
   the host's one-line height, so a quote plus a reply has room. The rows scroll inside the
   transcript's own box, so the composer never covers the history. What the transcript shows is what the new chat
   is about to inherit — the completed turns of the chat **on screen**, captured
   once when the side chat is created (the reader is session-addressed, so a chat
   switch cannot hand a new side chat the previous project's history) and
   rendered in the main chat's own markup (markdown, code, layout) rather than as
   a flattened summary.
6. **The chat is created on send, not on click.** Until a composer is sent, the
   page is a plain editable draft and **no chat exists** in the session list.
   Sending forks the main chat (`sessions.fork` with no explicit boundary, so the
   host cuts at the main chat's **last completed turn** — a turn still being
   written is never inherited), titles the child
   `sidechat-<n>-<main chat title>`, and sends the draft as its first message.
7. **The inherited transcript is folded away.** A fork carries a copy of the main
   chat; everything in the panel *before this side chat's own first message* is
   collapsed and only shown when you ask for it. (When that message is not on the
   page — an older side chat, say — the boundary the fork's event windows give is
   used instead.) Each side chat page has its own toolbar, left to right:

   | Button | What it does |
   |---|---|
   | `↺ Reset` | Archives the current chat and returns this page to an empty composer; the next send forks a fresh chat. Carries the theme's caution tone (amber), with a tooltip |
   | `＋ New` | Opens another side-chat page for the same main chat (several can be open at once). Brand-tinted, so the additive action reads apart from the cautionary one at a glance |
   | `▸/▾ 继承自主对话 N 轮` | Shows or hides the fork's inherited turns; pinned to the right, tooltip names the action |

   Either action also *reveals* the page it targets: a collapsed column expands
   and the page is focused, so sending a quote is never invisible. When the
   sidebar cannot place a page yet (its surface mounts a moment after a session
   switch) the open is retried for ~1.5 s, and a sidebar that never mounts
   reports it in the menu instead of doing nothing.

The side-chat panel is not a reimplementation: once the child exists, the panel
declares the host's own `sidebar.chat.conversation` child slot and wraps it in
the framework `SessionProvider`, so it renders the shipped conversation —
message stream and composer included. Text inside that panel is the host's DOM:
it stays selectable and copyable, and the sidebar is never quoted.

Nothing is written back into the annotated reply, and the plugin keeps no store
of its own: each page carries its state (side-chat id, number, child, boundary,
draft) in its own navigation params, which the host persists with the layout.

## Install

This is a **profile bundle**: installing it affects every session in the
profile. Nothing is published to npm — install it from this repository.

Ask your DSH agent:

```
install the DSH bundle at /absolute/path/to/dsh-annotate-sidechat
```

or, from a git URL:

```
install the DSH bundle github:baicaihenxiao/dsh-annotate-sidechat
```

The agent runs `plugin_manager` `install_bundle`. Then reload the Web page;
client-only changes need no `dsh web` restart.

## Files

| File | Role |
|---|---|
| `client.js` | Everything: selection capture, the quote, the menu, the sidebar page type, its toolbar, and the inherited-prefix folding |
| `index.js` | Host half — intentionally empty; the feature is entirely Client-side |
| `cordis.patch.yml` | Inserts the plugin row so the Client module loads |
| `package.json` | Bundle manifest, `dsh.client` declaration, peer packages |
| `check.mjs` | Headless check: registration, quote and naming seams, page type, tab chip, pending panel (`node check.mjs`) |

## How it fits the host

| Host seam | Used for |
|---|---|
| `[data-chat-flow-kind="assistant-step"]` | Deciding what is quotable: selection endpoints must sit in one assistant reply |
| `[data-chat-turn]`, `[data-chat-group-part]` | The location line (turn number, reasoning vs. reply) |
| `[data-conversation-session]` | Reading the session id when the list snapshot has no `current`, and picking the on-screen session's own transcript for the snapshot |
| `[data-sidebar-right-*]` | Keeping sidebar selections out of the quote menu |
| `ctx.sessions.fork` / `retain` / `binding.session` | Creating the child on send, renaming it, sending its first prompt |
| `[data-chat-flow-key]` / `[data-chat-flow-kind="user"]` | Cutting the transcript at this side chat's own first message (the turn boundary from the event windows is the fallback) |
| `ctx.sessions.binding().eventSource` | Which turns a fresh fork inherited (the child's window ∩ its parent's), for folding them away |
| `ctx.sessions.list` | Numbering side chats and reading the main chat's title |
| `ctx.sidebarRight.openTab` (`replaceTab`) + `active` / `mounted` / `isExpanded` / `focus` | Opening a page per side chat (retried while the surface mounts), rewriting its params in place, finding the open one, and bringing it into view |
| `ctx.sidebarRightTabs` + `sidebar.right.pane.tab(.title)` | The page type, its body, and a chip naming each side chat |
| `sidebar.chat.conversation` | Rendering the shipped conversation inside the panel |
| `ctx.get('uiWorkspace').archiveSession` | `Reset side chat` archiving the chat it replaces |
| `ctx.conversation.input.for(scope).setDraft` / `focus` | Writing the quote into a composer and handing it the keyboard |

These are internal seams, not a public contract: if the host renames one, the
affected leg degrades (no menu, or an error line in the panel) rather than
crashing the page.

## Checks

```
node check.mjs
```

Covers the bundle registration, the quote and composer-draft seams, the naming
rule (`sidechat-<n>-<title>`, with the directory fallback), side-chat numbering,
zh/en key parity, the page-type registration (`multiple: true`, its guide entry,
its tab chip), the pending panel for both a menu-opened and a guide-opened page
(Reset left of New, each with its own glyph, class and tooltip — caution tone
for Reset, brand tone for New — and a transcript that takes the room above a
content-sized composer card whose rows scroll inside it), the primary hover
fill, and the inherited-prefix collapse rule.

The DOM layer was additionally driven through headless Chrome with a scratch
harness (not committed — it needs a local Chrome plus `puppeteer-core`): the
two-item menu, a sidebar selection yielding none, a sidebar mousedown not being
cancelled, `Send to main chat` appending after one blank line plus a blank line
under the quote, focusing the composer and scrolling a composer the quote
outgrows to its end, the new-chat panel carrying the same
toolbar as a sent one, its composer card sized to its content under a
transcript that scrolls inside itself and is the main chat's own markup, its
send button a rectangle pinned right, counting only the completed turns
(`继承自主对话 N 轮`, the turn still being written excluded), that snapshot then
holding still while the main chat grows (with a later side chat capturing the
newer state instead), `Send to side chat` opening a page when
none is up, sending that page forking once and titling the child
`sidechat-1-Main chat title` with no explicit boundary (the host's last completed
turn) — including after the main chat moved on, the Reset and New buttons each
carrying their own colour class, the inherited items being marked and folded
(both by position and by the turn fallback) with a working toggle, a further
quote
routing into the open side chat's composer instead of opening another page and
revealing it (expand + focus), `Reset side chat` archiving the child and
returning the page to a focused empty composer, `New side chat` opening a second
page with its own id and number, an open refused once being retried to exactly
one page, and a sidebar that never mounts surfacing an error in the menu. The
real host's fork/rename/prompt and archive RPCs and the live sidebar markers
were read from the host sources, not exercised against a running GUI — a manual
pass on the real page is still worth doing.

## License

MIT

# dsh-annotate-sidechat

A DeepSeek Harness (DSH) Web plugin: **select text in an assistant reply,
send it to the main chat or to a side chat**.

```
划选 assistant 回复  →  两个选项：Send to main chat / Send to side chat
                        ├─ 主对话：引用内容追加到输入框（空一行）
                        └─ 侧边对话：引用内容进入侧边面板，发送后才新建 sidechat-N
```

> **Status: 0.1.0 — checked headlessly (`node check.mjs`), not yet verified in a
> browser.** See [Checks](#checks).

## What it does

1. **Select** text inside an assistant reply of the main chat. A two-item menu
   opens right below the selection. Nothing inside the right sidebar, and no
   control or code-block chrome, is treated as quotable.
2. **Send to main chat** appends the quote to the main composer draft: the text
   already there, one blank line, then the quote. `Send to side chat` puts the
   same quote in a side chat. Either destination ends the draft with a newline,
   so the caret waits on a fresh line for your own words, and either destination
   takes the keyboard: the menu hands focus to the composer it just filled —
   the main composer, the existing side chat's composer, or the pending side
   chat's own composer. (The primary menu entry keeps its brand fill while
   hovered — it never flashes the light layer colour.)
3. **The quote is English-located** — which spot of the transcript is being
   quoted, then the passage as a block quote:

   ```
   Quoted from the assistant's reply (turn 3, paragraph 2):
   > the selected passage
   > continues here
   ```
4. **A side chat needs no quote.** The page is also offered in the right
   sidebar's guide (the strip's add control / the empty column), and a side chat
   opened that way starts with an empty composer you simply type into.
5. **The side chat is created on send, not on click.** `Send to side chat`
   reveals (or opens) the side-chat page in the right sidebar; until its composer
   is sent, that page is a plain editable draft and **no chat exists** in the
   session list. Sending then forks the session on screen (`sessions.fork`),
   titles the child `sidechat-1`, `sidechat-2`, … (counting that parent's
   existing side chats), and sends the draft as the child's first message.

The side-chat panel is not a reimplementation: once the child exists, the panel
declares the host's own `sidebar.chat.conversation` child slot and wraps it in
the framework `SessionProvider`, so it renders the shipped conversation —
message stream and composer included. Text inside that panel is the host's DOM:
it stays selectable and copyable, and the sidebar is never quoted.

Nothing is persisted and the quoted reply is never modified.

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
| `client.js` | Everything: selection capture, the quote, the two-item menu, the sidebar page type and its pending/created panel |
| `index.js` | Host half — intentionally empty; the feature is entirely Client-side |
| `cordis.patch.yml` | Inserts the plugin row so the Client module loads |
| `package.json` | Bundle manifest, `dsh.client` declaration, peer packages |
| `check.mjs` | Headless check: bundle registration, quote formatting, page-type and panel wiring (`node check.mjs`) |

## How it fits the host

| Host seam | Used for |
|---|---|
| `[data-chat-flow-kind="assistant-step"]` | Deciding what is quotable: selection endpoints must sit in one assistant reply |
| `[data-chat-turn]`, `[data-chat-group-part]` | The location line (turn number, reasoning vs. reply) |
| `[data-conversation-session]` | Reading the session id when the list snapshot has no `current` |
| `[data-sidebar-right-*]` | Keeping sidebar selections out of the quote menu |
| `ctx.sessions.fork` / `retain` / `binding.session` | Creating the child on send, renaming it, sending its first prompt |
| `ctx.sessions.list` | Counting a parent's existing `sidechat-*` children for the next title |
| `ctx.sidebarRight.openTab` + `ctx.sidebarRightTabs` | Opening the side-chat page (`multiple: false`, so reopening reveals it and refreshes its params); the type's `guide` entry is how the page opens with no quote |
| `sidebar.right.pane.tab` + `sidebar.chat.conversation` | Rendering the panel: pending composer, then the shipped conversation |
| `sessionId` (injected into a session-scoped slot) | The parent of a page opened from the guide, which carries no navigation params |
| `ctx.conversation.input.for(scope).setDraft` | Writing the quote into the main chat's or the existing side chat's composer |

These are internal seams, not a public contract: if the host renames one, the
affected leg degrades (no menu, or an error line in the panel) rather than
crashing the page.

## Checks

```
node check.mjs
```

Covers the bundle registration, the quote, composer-draft and draft-append
seams, zh/en key parity, the page-type registration (`multiple: false` and its
guide entry), the primary hover fill, and the panel rendered both from a restored
tab's navigation params and from a guide opening that carries none.

The DOM layer was additionally driven once through headless Chrome with a
scratch harness (not committed — it needs a local Chrome plus `puppeteer-core`):
selection in the main chat yields exactly the two options, a sidebar selection
yields none, a sidebar mousedown is not cancelled, `Send to main chat` appends
the quote after one blank line and a trailing newline and then focuses the
composer (in that order), `Send to side chat` appends the same, focuses the
pending composer with the caret after the quote, and forks nothing, sending the
pending panel forks once, titles the child `sidechat-N`, and prompts it, a quote
for an already-created side chat refocuses that conversation's composer, and a
guide-opened empty composer typed into forks the pane's session and creates
`sidechat-1`. The real host's fork/rename/prompt RPCs and the live sidebar
markers were read from the host sources, not exercised against a running GUI — a
manual pass on the real page is still worth doing.

## License

MIT

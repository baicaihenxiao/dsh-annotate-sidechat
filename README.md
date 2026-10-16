# dsh-annotate-sidechat

A DeepSeek Harness (DSH) Web plugin: **select text in an assistant reply, then
send the located quote to the main chat or to a side chat**.

[中文说明](README.zh.md)

This plugin takes [dsh-sidenote](https://github.com/g-yixuan/dsh-sidenote) as a
reference; it is a simplified and modified version of it.

```
select an assistant reply  →  two options: Send to main chat / Send to side chat
                              ├─ main chat: the quote is appended to the composer
                              │  (one blank line before, a blank line after, caret in place)
                              └─ side chat: the quote goes to the open side chat, or a new one

select a reply inside a sent side chat  →  Send to chat: the quote goes to that side chat's composer
```

On the left, the main chat with the quote menu open on a selected word. On the
right, side chat `sidechat-1`: its two inherited turns shown, the quote it was
created with and the reply, and the next quote waiting in its composer.

![The main chat with the quote menu open, and a side chat in the right sidebar](docs/sidechat.webp)

> **Status: 1.0.1 — tested in a browser on DeepSeek Harness `0.2.0-rc.2`, and
> checked headlessly (`node check.mjs`, including a replay of its slot
> registrations against the host's real slot registry).** See [Checks](#checks).

## What it does

1. **Select** text inside an assistant reply of the main chat. A two-item menu
   opens right below the selection. In the right sidebar only a side chat that
   has been sent is quotable (see 8), and no control or code-block chrome ever
   is.
2. **Send to main chat** appends the quote to the main composer draft: the text
   already there, one blank line, then the quote. Either destination ends the
   draft with a blank line and hands the composer the keyboard, so the caret
   waits on a fresh line with room to write. A quote that outgrows the box also
   scrolls it to the end, in the panel's own composer and in the host composer
   alike (the host's focus takes `preventScroll`, so the plugin scrolls it). (The
   primary menu entry keeps its brand fill while hovered — it never flashes the
   light layer colour.)
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
   once the chat exists the quote joins that chat's own composer. If that chat
   was forked before the quoted turn — it inherited the main chat up to turn 2,
   say, and the quote is from turn 4 — it would get the passage without its
   context, so the menu turns into a notice that says so and asks first:
   `Send to a new side chat` opens a new side-chat page holding the quote (it
   forks from the main chat's latest completed turn when sent), and `Cancel`
   sends nothing. A click anywhere else dismisses it like Cancel.
5. **A side chat needs no quote.** The page is also offered in the right
   sidebar's guide (the strip's add control / the empty column), and a side chat
   opened that way starts with an empty composer you simply type into *and looks
   like a side chat that has already been sent to*: the same toolbar (with the
   inherited-turn count where the sent panel shows its fold toggle), a scrolling
   transcript of the main chat's own rows, and — pinned under it, only as tall as
   its own content — a composer card that copies the host composer (`InputBar`):
   its panel radius, input fill and soft elevation, the conversation's font size
   and line height, and its primary fill for a labelled rectangular send button
   (arrow glyph + text), right-aligned in the card. The card itself stands twice
   its earlier height (172 px minimum, capped at 45% of the panel), so a quote
   plus a reply has room; a side chat that already exists keeps the host composer
   exactly as the host draws it. The rows scroll inside the transcript's own box,
   so the composer never covers the history. What the transcript shows is what
   the new chat is about to inherit — the completed turns of the chat **on
   screen**, captured once when the side chat is created (the reader is
   session-addressed, so a chat switch cannot hand a new side chat the previous
   project's history) and rendered in the main chat's own markup (markdown, code,
   layout) rather than as a flattened summary. That markup is made inert before
   it is shown again — scripts, embeds, event handlers and `javascript:` links
   are dropped, and so are the host's turn and anchor markers, which must stay
   unique to the live transcript. The area opens at the end of that history, the
   way a sent chat's transcript does, so the newest turns sit right above the
   composer.
6. **The chat is created on send, not on click.** Until a composer is sent, the
   page is a plain editable draft and **no chat exists** in the session list.
   Sending forks the main chat (`sessions.fork` with no explicit boundary, so the
   host cuts at the main chat's **last completed turn** — a turn still being
   written is never inherited), titles the child
   `sidechat-<n>-<main chat title>`, and sends the draft as its first message.
   If the title or the first message fails, the fork is archived again, so a
   failed send never leaves an unlinked copy of the main chat in the list; a
   quote sent to the page while the chat was being created moves on to the new
   chat's own composer.
7. **The inherited transcript is folded away.** A fork carries a copy of the main
   chat; everything in the panel *before this side chat's own first message* is
   collapsed and only shown when you ask for it. (An inherited message that quoted
   the same spot is never taken for it: the match runs past the shared location
   line and skips the turns the fork inherited. When that message is not on the
   page — an older side chat, say — the boundary the fork's event windows give is
   used instead.) Each side chat page has its own toolbar, left to right:

   | Button | What it does |
   |---|---|
   | `↺ Reset` | Archives the current chat and returns this page to an empty composer; the next send forks a fresh chat. Carries the theme's caution tone (amber), with a tooltip |
   | `＋ New` | Opens another side-chat page for the same main chat (several can be open at once). Brand-tinted, so the additive action reads apart from the cautionary one at a glance |
   | `▸/▾ N turns inherited from the main chat` | Shows or hides the fork's inherited turns; pinned to the right, tooltip names the action |

   Either action also *reveals* the page it targets: a collapsed column expands
   and the page is focused, so sending a quote is never invisible. When the
   sidebar cannot place a page yet (its surface mounts a moment after a session
   switch) the open is retried for ~1.5 s, and a sidebar that never mounts
   reports it in the menu instead of doing nothing. A quote aimed at a side chat
   whose composer does not come up within ~5 s brings the menu back with an
   error instead of disappearing.
8. **Quote inside a side chat.** Selecting text in a reply of a side chat that
   has been sent opens a one-item menu, `Send to chat`, which appends the
   located quote to that side chat's own composer — the same format, blank
   lines and focus as the other two. A page that has not been sent yet, and any
   other sidebar chat, offers no menu.
9. **Archived or deleted elsewhere.** A side chat is also an ordinary session,
   so it can be archived or deleted from the session list — after opening it
   in the main column, say. Its page is then cleaned up: it closes as soon as
   its main chat is on screen (until then it shows only a note and holds
   nothing of the gone chat), its record is forgotten, and Send to side chat
   no longer aims at it. Reset's own archive is not mistaken for this; that
   page starts over as before.

The side-chat panel is not a reimplementation: once the child exists, the panel
declares its own `annotateSidechat.conversation` child slot, wraps it in the
framework `SessionProvider`, and renders the host's `conversation.content`
factory there — the shipped conversation, message stream and composer included.
(It does not use the host's `sidebar.chat.conversation`: the built-in subagent
chat owns that single slot, and the slot registry refuses a second declaration.)
Text inside that panel is the host's DOM: it stays selectable and copyable, and
a selection in one of its replies offers `Send to chat` (item 8); nothing else
in the sidebar is quoted.

Nothing is written back into the annotated reply. A page carries its state
(side-chat id, number, child, boundary, draft, snapshot) in its navigation
params while it lives, and the plugin also keeps a small per-tab record in
`localStorage` (`dsh-annotate-sidechat:page:<tabId>`, dropped when the tab
closes, and on load when no saved layout holds that tab any more — never by
age, so a side chat in a chat left alone for weeks still knows itself): the
sidebar persists its layouts but not those params, so without it a reload would
turn every side chat back into an empty new one. On mount a page takes its
identity from its params, else from that record, else mints a fresh side chat
(the guide-opened case).

## Install

This is a **profile bundle**: installing it affects every session in the profile
you install it into. Nothing is published to npm — install it from this
repository.

Ask your DSH agent to install it:

```
install the DSH bundle github:baicaihenxiao/dsh-annotate-sidechat
```

The agent runs the `plugin_manager` `install_bundle` action, which adds the
package to your profile and selects the bundle. Then reload the Web page;
client-only changes need no `dsh web` restart.

From a checkout instead:

```sh
git clone https://github.com/baicaihenxiao/dsh-annotate-sidechat
```

```
install the DSH bundle at /absolute/path/to/dsh-annotate-sidechat
```

To remove it again, ask the agent to remove the bundle `dsh-annotate-sidechat`,
or disable it on DSH's Plugins page.

- Plugin `1.0.1` is tested with DeepSeek Harness `0.2.0-rc.2`. That version is
  what `peerDependencies` pins, so DSH refuses to install or activate this bundle
  on a host it has not been verified against — see [Requirements](#requirements)
  for the exact packages.

## Updating

Installing from GitHub pins the commit resolved at install time in your
profile's `pnpm-lock.yaml`, so **a new commit upstream does not arrive by
itself**. How you update depends on how you installed it:

| Installed as | Update with |
|---|---|
| `github:baicaihenxiao/dsh-annotate-sidechat` | `dsh plugin --profile <profile> update dsh-annotate-sidechat`, or remove the bundle and install it again |
| a local checkout | `git pull` in the checkout — the profile links the directory |
| a tag or commit | install the revision you want: `github:baicaihenxiao/dsh-annotate-sidechat#v1.0.1` |

Points worth knowing:

- Re-running the install with the **same** spec keeps the pinned commit;
  `pnpm update` is what re-resolves it to the branch head.
- `plugin_manager`'s `install_bundle` both installs the package and selects the
  bundle. The `dsh plugin` CLI path only installs the package, so re-select the
  bundle afterwards if you use it.
- Reload the Web page (or restart `dsh web`) after updating.
- Pin a release by tag — `#v1.0.1`. A branch name works too. A commit SHA must
  be the full 40 characters: pnpm cannot resolve an abbreviated one.
- To see what you have installed, read the version in your profile:

  ```sh
  cat ~/.dsh/profiles/<profile>/node_modules/dsh-annotate-sidechat/package.json
  ```

## Requirements

| Plugin | DeepSeek Harness | Node |
|---|---|---|
| `1.0.0`, `1.0.1` | `0.2.0-rc.2` | `^22.19.0 \|\| >=24.0.0` |

- A DSH Web profile. Everything the bundle builds on ships with DSH: the right
  sidebar's page registry and `sidebar.right.pane.tab` seat
  (`@deepseek-ai/dsh-client-ui-sidebar-right`), the `conversation.content`
  factory and the composer input machine
  (`@deepseek-ai/dsh-client-ui-conversation`), session archiving
  (`@deepseek-ai/dsh-client-ui-workspace`) and the locale registry
  (`@deepseek-ai/dsh-client-locale`) — so the bundle declares no dependencies of
  its own.
- A DSH version this bundle was verified against. `peerDependencies` pins those
  four host packages to `0.2.0-rc.2`, and `engines` matches the host's Node range
  (`^22.19.0 || >=24.0.0`). DSH's plugin manager evaluates every
  `@deepseek-ai/dsh*` peer range **against the DSH runtime version** and rejects
  installation or activation when one does not match (an `incompatible-version`
  refusal), so an untested host fails loudly instead of rendering a broken side
  chat. The plugin leans on internal seams (see
  [How it fits the host](#how-it-fits-the-host)), which is why the pin is exact.
  A newer host version is added here once it has been verified; anyone who needs
  to run ahead of that can grant an exact-version exemption, which accepts the
  risk explicitly:

  ```sh
  dsh plugin --profile <profile> allow-version dsh-annotate-sidechat@1.0.1 --dsh-version <runtime> --accept-risk
  ```
- The browser module table provides `react` and `react-dom/client`; this bundle
  imports nothing else.

## Files

| File | Role |
|---|---|
| `client.js` | Everything: selection capture, the quote, the menu, the sidebar page type, its toolbar, and the inherited-prefix folding |
| `index.js` | Host half — intentionally empty; the feature is entirely Client-side |
| `cordis.patch.yml` | Inserts the plugin row so the Client module loads |
| `package.json` | Bundle manifest, `dsh.client` declaration, peer packages |
| `check.mjs` | Headless check: registration, quote and naming seams, fold boundary, page type, tab chip, pending panel, and a replay against the host's real slot registry (`node check.mjs`) |

## How it fits the host

| Host seam | Used for |
|---|---|
| `[data-chat-flow-kind="assistant-step"]` | Deciding what is quotable: selection endpoints must sit in one assistant reply |
| `[data-chat-turn]`, `[data-chat-group-part]` | The location line (turn number, reasoning vs. reply) |
| `[data-conversation-session]` | Reading the session id when the list snapshot has no `current`, and picking the on-screen session's own transcript for the snapshot |
| `[data-sidebar-right-*]` | Keeping sidebar selections out of the quote menu, except in a sent side chat's body (marked by the plugin with its child session) |
| `ctx.sessions.fork` / `retain` / `binding.session` | Creating the child on send, renaming it, sending its first prompt, and holding it for as long as its page is open — like the host's own sidebar chat, not only while the page is on screen, so opening the side chat in the main column and coming back never reopens it under the panel |
| `[data-chat-flow-key]` / `[data-chat-flow-kind="user"]` | Cutting the transcript at this side chat's own first message (the turn boundary from the event windows is the fallback) |
| `ctx.sessions.binding().eventSource` | Which turns a fresh fork inherited (the child's window ∩ its parent's), for folding them away |
| `ctx.sessions.list` | Numbering side chats and reading the main chat's title |
| `ctx.sidebarRight.openTab` (`replaceTab`) + `active` / `mounted` / `isExpanded` / `focus` / `registerCloseHandler` | Opening a page per side chat (retried while the surface mounts), rewriting its params in place, finding the open one, bringing it into view, and forgetting a closed page |
| `ctx.sidebarRightTabs` + `sidebar.right.pane.tab(.title)` | The page type, its body, and a chip naming each side chat |
| `annotateSidechat.conversation` (own child slot) + `conversation.content` factory | Rendering the shipped conversation inside the panel |
| `ctx.sidebarRight.openTabs` + `close` | Dropping the per-tab records of pages no saved layout holds, and closing the on-screen chat's pages of side chats archived or deleted elsewhere |
| `ctx.get('workspaces').list` (`archivedSessionIds`) + `ctx.sessions.list` (`ids`, `phase`) | Telling a side chat archived or deleted elsewhere — only once each list is ready |
| `ctx.get('uiWorkspace').archiveSession` | `Reset side chat` archiving the chat it replaces, and a failed send archiving its fork |
| `ctx.conversation.input.for(scope).setDraft` / `focus` | Writing the quote into a composer and handing it the keyboard |

These are internal seams, not a public contract: if the host renames one, the
affected leg degrades (no menu, or an error line in the panel) rather than
crashing the page.

## Checks

```sh
node check.mjs
```

Covers the bundle registration, the quote and composer-draft seams, the naming
rule (`sidechat-<n>-<title>`, with the directory fallback), side-chat numbering,
zh/en key parity, the page-type registration (`multiple: true`, its guide entry,
its tab chip), the pending panel for both a menu-opened and a guide-opened page
(Reset left of New, each with its own glyph, class and tooltip — caution tone
for Reset, brand tone for New — and a transcript that takes the room above a
content-sized composer card whose rows scroll inside it), the primary hover
fill, the inherited-prefix collapse rule, a fold boundary that an inherited
quote of the same spot cannot capture, where a selected reply quotes to (the
main chat, a sent side chat, or nowhere for a pending page's copied rows, other
sidebar chats and replies still being written), and the one-item `Send to chat`
menu that hands its quote to that side chat, the notice for a quote newer
than the open side chat's fork point (which turns count as newer, its Cancel
and new-side-chat answers, and that a selection event never replaces it),
a page holding its side chat until it closes, and the cleanup of side chats
archived or deleted elsewhere (archived or missing only once a list is ready,
the on-screen chat's pages closing — from memory or their record — another
chat's page letting its child go, Reset left alone, and a gone page rendering
nothing of its chat).

With a local `dsh` install the check also replays every slot registration this
plugin makes against the host's real `SlotCore`
(`@deepseek-ai/dsh-client-ui-slots`, found next to the `dsh` binary), beside the
built-in subagent chat's, in both load orders — the stubs above would accept a
second declaration that the real registry refuses. Without `dsh` on the `PATH`
that step is skipped and the check says so.

The DOM layer was additionally driven through headless Chrome with a scratch
harness (not committed — it needs a local Chrome plus `puppeteer-core`): the
two-item menu, a sidebar selection yielding none, a sidebar mousedown not being
cancelled, `Send to main chat` appending after one blank line plus a blank line
under the quote, focusing the composer and scrolling a composer the quote
outgrows to its end, the new-chat panel carrying the same toolbar as a sent one,
its composer card sized to its content under a transcript that scrolls inside
itself and is the main chat's own markup, its send button a rectangle pinned
right, counting only the completed turns (the turn still being written
excluded), that snapshot then holding still while the main chat grows (with a
later side chat capturing the newer state instead), `Send to side chat` opening
a page when none is up, sending that page forking once and titling the child
`sidechat-1-Main chat title` with no explicit boundary (the host's last completed
turn) — including after the main chat moved on, the Reset and New buttons each
carrying their own colour class, the inherited items being marked and folded
(both by position and by the turn fallback) with a working toggle, a further
quote routing into the open side chat's composer instead of opening another page
and revealing it (expand + focus), `Reset side chat` archiving the child and
returning the page to a focused empty composer, `New side chat` opening a second
page with its own id and number, an open refused once being retried to exactly
one page, and a sidebar that never mounts surfacing an error in the menu. That
harness did not reproduce the real host's timing everywhere: the fold marking
used to run before the conversation body had mounted, which would keep the
toggle from ever appearing on the real page (fixed since).

For 1.0.0 the plugin was also checked by hand on a real DSH `0.2.0-rc.2` Web
page: a side chat sent from a quote and one opened from the guide both render
the shipped conversation, the console shows no slot-registry error and the
built-in subagent sidebar chat still works, the inherited-turns toggle appears
and folds the right rows, a reloaded page keeps its side chat, and a further
quote lands in an existing side chat's composer.

## License

[MIT](LICENSE)

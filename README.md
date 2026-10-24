# dsh-annotate-sidechat

A DeepSeek Harness (DSH) Web plugin: **select text in an assistant reply, then
send the located quote to the main chat or to a side chat**.

[中文说明](README.zh.md)

A simplified and modified version of
[dsh-sidenote](https://github.com/g-yixuan/dsh-sidenote).

```
select an assistant reply  →  Send to main chat / Send to side chat
                              ├─ main chat: the quote is appended to the composer
                              └─ side chat: the quote goes to the open side chat, or a new one

select a reply inside a sent side chat  →  Send to chat: the quote goes to that side chat's composer
```

![The main chat with the quote menu open, and a side chat in the right sidebar](docs/sidechat.webp)

> **Status: 1.6.0**, checked headlessly (`node check.mjs`) on DeepSeek Harness
> `0.2.1-rc.2`, the only host it supports. 1.6.0's quote location line was seen
> in a browser; 1.5.0's additions have not been tried there yet. See
> [Requirements](#requirements) for the versions that were.

## Usage

- **Select** text in an assistant reply. A menu opens below it, headed by the
  location (`turn 3 · para 2 · 4 chars`). Press `M` for the main chat, `S` for a
  side chat, `Esc` to close. Keys are left alone while you type in a field or
  hold a modifier.
- **The quote** says where it came from (in English, whatever the UI language),
  block-quotes the passage, and leaves a blank line under it for your own words.
  The passage itself is what the model searches for, so the location is just
  the turn. Only when the same passage appears more than once in that reply
  are words added to tell the copies apart: the opening words of its block,
  or, for a table cell, its row and column header. Blocks are never counted,
  because the model sees Markdown, not the page:

  ```
  Quoted from the assistant's reply (turn 3):
  > the selected passage

  Quoted from the assistant's reply (turn 3, in table row "Node", column "Minimum"):
  > 18
  ```

- **Send to main chat** appends the quote to the main composer after a blank line.
- **Send to side chat** goes to the side chat open in the right sidebar, or opens
  a new one. If that side chat was forked before the quoted turn, the menu asks
  first: send to a new side chat, or cancel.
- **Send to chat** (`Enter`): text selected in a sent side chat's reply is quoted
  into that side chat's composer.
- **`New side chat`** in the main chat header (or the right sidebar's add
  control) opens a side chat without a quote. `Delete all`, left of it, deletes
  this chat's side chats without asking.

## Side chats

- **Created on send.** Until you send, the page is a draft and no chat exists.
  It previews the completed turns it will inherit (a message over 4 KB, and
  anything past 24 KB in total, is left out of the preview). Sending forks the
  main chat at its last completed turn, titles the fork `↳S<n>·<main chat title>`
  (`↳侧<n>·…` in a Chinese UI) and sends the draft as its first message. If that
  fails, the fork is archived again.
- **Inherited turns are folded away.** Each page has a toolbar:

  | Button | What it does |
  |---|---|
  | `Reset` | Archives the side chat; the next send forks a fresh one from the main chat as it is now |
  | `Delete` | Archives the side chat, if it was sent, and closes the page |
  | `New` | Opens another side chat for the same main chat |
  | `N turns inherited` | Shows or hides the inherited turns |

- **Archived or deleted elsewhere** (say, from the session list), a side chat's
  page closes itself.
- **Survives a reload.** Each page keeps a small record in `localStorage`
  (`dsh-annotate-sidechat:page:<tabId>`), dropped when the page closes.
- A sent side chat is the host's own conversation (`conversation.content`),
  rendered in the plugin's `annotateSidechat.conversation` slot.

## Install

Ask your DSH agent:

```
install the DSH bundle github:baicaihenxiao/dsh-annotate-sidechat
```

From a local checkout, give the path instead:
`install the DSH bundle at /absolute/path/to/dsh-annotate-sidechat`. Then reload
the Web page.

This is a profile bundle: it applies to every session in that profile. To remove
it, ask the agent to remove the bundle `dsh-annotate-sidechat`, or disable it on
DSH's Plugins page.

## Updating

A GitHub install is pinned to the commit resolved at install time, so new
commits do not arrive by themselves:

| Installed as | Update with |
|---|---|
| `github:baicaihenxiao/dsh-annotate-sidechat` | `dsh plugin --profile <profile> update dsh-annotate-sidechat`, or remove the bundle and install it again |
| a local checkout | `git pull` in the checkout |
| a tag or commit | install that revision, e.g. `github:baicaihenxiao/dsh-annotate-sidechat#v1.6.0` (a commit SHA must be the full 40 characters) |

The `dsh plugin` CLI only installs the package, so re-select the bundle after
using it. Reload the Web page afterwards.

## Requirements

| Plugin | DeepSeek Harness | Checked in a browser |
|---|---|---|
| `1.0.0` – `1.1.0` | `0.2.0-rc.2` | `1.0.0` |
| `1.2.0` – `1.4.1` | `0.2.0-rc.2`, `0.2.1-rc.2` | `1.2.0` on both; `1.2.1`, `1.3.0`, `1.3.1`, `1.4.1` on `0.2.1-rc.2` |
| `1.5.0` – `1.6.0` | `0.2.1-rc.2` | `1.6.0`'s quote location line only |

Node `^22.19.0 || >=24.0.0`. Everything else ships with DSH, so the bundle has
no dependencies of its own. Because it relies on internal host seams (below),
`peerDependencies` pins the host packages to the exact DSH version, and DSH
refuses to install it on any other. On `0.2.0-rc.2`, install `#v1.4.1`. To run it
on an unverified host anyway, accepting the risk:

```sh
dsh plugin --profile <profile> allow-version dsh-annotate-sidechat@1.6.0 --dsh-version <runtime> --accept-risk
```

## Files

| File | Role |
|---|---|
| `client.js` | Everything: selection, quote, menu, side-chat page, toolbar, folding |
| `index.js` | Host half, intentionally empty |
| `cordis.patch.yml` | Inserts the plugin row so the client module loads |
| `package.json` | Bundle manifest and peer packages |
| `check.mjs` | Headless checks |

## How it fits the host

| Host seam | Used for |
|---|---|
| `[data-chat-flow-kind="assistant-step"]`, `[data-chat-turn]`, `[data-chat-group-part]` | What is quotable, and the location line |
| `[data-conversation-session]`, `[data-sidebar-right-*]` | Which chat a selection is in; sidebar text is quotable only in a sent side chat |
| `[data-chat-flow-key]`, `[data-chat-flow-kind="user"]`, `ctx.sessions.binding().eventSource` | Where the inherited turns end, for folding |
| `ctx.sessions.fork` / `retain` / `binding.session` / `list` | Creating, titling, holding and numbering side chats |
| `ctx.sidebarRight`, `ctx.sidebarRightTabs`, `sidebar.right.pane.tab(.title)` | The side-chat page type and its tab chip; opening, revealing and closing pages |
| `conversation.session.header.utilities` | `New side chat` and `Delete all` in the header |
| `annotateSidechat.conversation` + `conversation.content` | Rendering the host's conversation in the panel |
| `ctx.get('workspaces').list`, `ctx.get('uiWorkspace').archiveSession` | Spotting side chats archived elsewhere; archiving on Reset, Delete and a failed send |
| `ctx.conversation.input.for(scope).setDraft` / `focus` | Writing the quote into a composer |

If the host renames one, that part degrades (no menu, or an error line in the
panel) rather than crashing the page.

## Checks

```sh
node check.mjs
```

It also replays the plugin's slot registrations against the host's real
`SlotCore`. On `0.2.1-rc.2` that needs the package installed separately and
`DSH_SLOTS_MODULE` pointing at it; without it, that step is skipped:

```sh
npm install --prefix /tmp/dsh-slots @deepseek-ai/dsh-client-ui-slots@0.2.1-rc.2
DSH_SLOTS_MODULE=/tmp/dsh-slots/node_modules/@deepseek-ai/dsh-client-ui-slots/lib/index.js node check.mjs
```

## License

[MIT](LICENSE)

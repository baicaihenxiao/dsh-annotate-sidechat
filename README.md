# dsh-annotate-sidechat

A DeepSeek Harness (DSH) Web plugin: **select text in an assistant reply,
annotate it in a popover, and continue the thought in a side chat**.

```
划选 assistant 回复  →  「注解」浮层  →  注解编辑器  →  fork 出的侧边对话
```

> **Status: 0.0.1 — not yet verified in a browser.** This version has known
> defects, listed under [Known issues](#known-issues). It is a starting point,
> not a working feature.

## What it does

1. **Select** text inside an assistant reply. A small 「Annotate」 popover
   appears below the selection.
2. **Annotate.** The popover opens an editor showing the quoted passage and a
   text box. `Enter` sends, `Shift+Enter` breaks the line, `Esc` cancels.
3. **Continue in a side chat.** Sending forks the session on screen
   (`sessions.fork`) and opens the child in the right sidebar, with the
   annotation waiting in that panel's composer as a draft.

The side-chat panel is not a reimplementation: it declares the host's own
`sidebar.chat.conversation` child slot and wraps it in the framework
`SessionProvider`, so the panel renders the shipped conversation — message
stream and composer included.

Nothing is persisted and the annotated reply is never modified: closing the
editor leaves no trace.

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
| `client.js` | Everything: selection capture, the popover and editor, the sidebar tab type and panel, the draft seed |
| `index.js` | Host half — intentionally empty; the feature is entirely Client-side |
| `cordis.patch.yml` | Inserts the plugin row so the Client module loads |
| `package.json` | Bundle manifest, `dsh.client` declaration, peer packages |

## How it fits the host

| Host seam | Used for |
|---|---|
| `[data-chat-flow-kind="assistant-step"]` | Deciding what is quotable: both selection endpoints must sit in the same assistant reply |
| `[data-conversation-session]` | Reading the session id when the list snapshot has no `current` |
| `ctx.sessions.fork` / `retain` / `scope` | Creating the child session and reaching its input machine |
| `ctx.sidebarRight.openTab` + `ctx.sidebarRightTabs` | Opening the child as a right-sidebar page |
| `sidebar.right.pane.tab` + `sidebar.chat.conversation` | Rendering the panel as the shipped conversation |
| `ctx.conversation.input.for(scope).setDraft` | Seeding the annotation into the child's composer |

These are internal seams, not a public contract: if the host renames one, the
affected leg degrades (no popover, or the annotation stays in the editor)
rather than crashing the page.

## Known issues

- **Submitting the editor throws.** `capture()` returns the selected text as
  `text`, while `toDraft()` reads `quote`, so the send path fails with
  `Cannot read properties of undefined (reading 'length')`.
- **Text selection inside the panel is blocked.** The panel wrapper shares the
  overlay's `data-dsh-annotate-sidechat` marker, and the overlay cancels
  mousedown on that marker to keep its own selection alive, so a press inside
  the panel never starts a selection.
- **The first message uses Chinese scaffolding** (`针对这段回复` / `我的注解`),
  and the side chat is named from the inherited title rather than a
  `sidechat-<n>` label.
- No automated checks and no browser-level verification yet.

## License

MIT

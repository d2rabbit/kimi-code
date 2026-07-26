---
"@moonshot-ai/kimi-desktop-tauri": minor
---

Redesign the chat transcript rendering with typed card identities: thinking blocks now render as collapsible amber think cards, tool calls get type-tinted avatars with mono labels and right-aligned status badges (with a purple variant for MCP tools), bash calls render as terminal cards with a mac-style header and copy button, JSON tool params/results render in an interactive tree card (tree/raw toggle, collapsible nodes, one-click copy), approval requests show the command in a framed box with allow/deny buttons and inline resolved state, and question options become a grid with hover affordances. Also fixes parallel tool results lost when the daemon persisted them before the tool_use record.

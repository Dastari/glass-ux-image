---
name: glass-ux-image-adopt
description: Choose and integrate public Glass UX Image parts in a React host or headless processor.
---

Read the installed docs/getting-started.md, docs/choosing-a-level.md and docs/host-control.md.
Choose a session-free control before a PhotoEditor, or ImageEditor when a workspace is needed.
Import public entries only; kits are plain tool lists. Mount Glass UX providers once and import
both stylesheets. The host owns all delivery, authentication, storage and source lifetimes.
Use onAction for policy; previews are transient and commits pass through it. Do not mutate recipes.
Read docs/files.md before handling untrusted files or persistence. Read the generated API for
callback payloads. Verify keyboard use, both modes, RTL and a narrow viewport. Translations are
unreviewed. Do not claim browser or GPU results that were not measured.

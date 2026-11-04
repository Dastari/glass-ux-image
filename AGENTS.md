# glass-ux-image contributor guidance

Read PROPOSAL.md first: it is the design of record, including settled decisions and stage results.
This package is a component library for Glass UX, not an application. The full editor is one
composition of public parts, and `apps/demo` is one consumer of them.

- Follow Glass UX's rules (`../glass-ux/AGENTS.md`, `docs/ui-rules.md`) for anything with a UI: tokens,
  message packs, logical CSS, accessible names, controlled and uncontrolled state.
- Glass UX cannot depend on this package. If a component makes sense in an application that never
  edits an image, it belongs in Glass UX. Requests live in one shared brief,
  `../glass-ux-ide/docs/glass-ux-request.md`; do not keep a second list here.
- The library never saves, uploads or persists by itself. The host decides, through hooks. Security,
  authentication and transport belong to the host.
- `core`, `filters`, `render`, `io` and `session` import no React and no Glass UX. `core` and `filters`
  also touch no DOM, so they run in workers and tests. The demo imports public entries only.
- Every committed change goes through a session action, so `onAction` can see and refuse it. Previews
  do not, because a drag would call it once a frame.
- Words live in `src/react/messages.ts`. A new message needs all 11 packs in `src/i18n/`, which
  `src/i18n/packs.test.ts` and the pack type both enforce.

## Engine rules

- All pixels are linear, premultiplied RGBA. Convert only at the edges: decoding and display.
- A filter is defined once, with a GLSL pass and a TypeScript pass. Change one and you must change
  the other, and `e2e/conformance.spec.ts` must pass.
- Do not raise a conformance tolerance to make a test pass. Find out why it moved first.
- Frames must not block: long work goes through the renderer's budget or a worker. Check timing in
  `e2e/demo.spec.ts` when touching the frame loop.

## Working here

- `pnpm check` runs lint, types, unit tests and the build. `pnpm test:e2e` builds the demo and runs
  the browser suites. `pnpm dev` serves the demo on the LAN at port 4330.
- The demo reads the built `dist`, so run `pnpm build` after changing `src`.
- This box lacks Chromium's system libraries. Before browser tests:
  `export LD_LIBRARY_PATH=$HOME/.cache/glass-ux-browser-libs/root/usr/lib/x86_64-linux-gnu`
- Browser tests use SwiftShader, which runs WebGL2 on the CPU. Their timings find stalls. They say
  nothing about real GPU speed, so never report them as if they did.
- Frame-time and stall limits go through `expectTiming` (`e2e/fixtures/speed.ts`). They gate on the reference
  machine, this development server. Under CI they are logged and annotated, marked when over, without failing,
  because shared runners vary several-fold between runs. Check the timings here before a release, and never
  change a limit to make a test pass.
- `mockups/` is a separate design fixture with its own install: `pnpm install --ignore-workspace`.

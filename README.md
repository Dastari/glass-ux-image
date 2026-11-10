# glass-ux-image

Image editing components and a tiled image engine for [Glass UX](https://github.com/Dastari/glass-ux).
Use a plain control, a photo editor, a workspace, public hooks or the headless engine. The host
owns saving, transport and persistence.

Install Glass UX and this package from their GitHub releases. glass-ux-image 0.3.0 needs glass-ux 0.19:

```sh
pnpm add https://github.com/Dastari/glass-ux/releases/download/v0.19.8/glass-ux-0.19.8.tgz
pnpm add https://github.com/Dastari/glass-ux-image/releases/download/v0.3.0/glass-ux-image-0.3.0.tgz
```

Glass UX, React and React DOM are peer dependencies, so a project that uses both packages carries one copy of
each. Every part is its own entry, and decoders, workers and the AVIF encoder load only when used.

```tsx
import { PhotoEditor } from 'glass-ux-image/photo-editor';
import { basic } from 'glass-ux-image/kits/basic';
import type { EditResult } from 'glass-ux-image/session';
import 'glass-ux/styles.css';
import 'glass-ux-image/styles.css';

// Mount the Glass UX providers once in the host. Give the editor a bounded height.
export function Photo({file,save}: {file:Blob;save:(result:EditResult)=>Promise<void>}) {
  return <PhotoEditor src={file} tools={basic} onSave={save}/>;
}
```

The [documentation site](https://dastari.github.io/glass-ux-image/) includes the component catalogue,
standalone controls, tools, filter comparisons, kits, guides, copyable templates and the browser
photo editing application.

- [Getting started](docs/getting-started.md), [choosing a level](docs/choosing-a-level.md) and [host control](docs/host-control.md).
- [Hooks](docs/hooks.md), [headless processing](docs/headless.md) and [extensions](docs/extensions.md).
- [Files and security](docs/files.md), [import formats](docs/import-formats.md), [workspace slots](docs/workspace.md), [accessibility](docs/accessibility.md), [performance](docs/performance.md) and [theming](docs/theming.md).
- [Generated component API](docs/api/README.md), [llms.txt](llms.txt) and adoption/extension skills in `skills/`.
- [Proposal](PROPOSAL.md) is the design record; [stage brief](docs/stage-3-brief.md) and [gaps brief](docs/gaps-brief.md) record scope.

```sh
pnpm check          # library lint, types, unit tests and build; excludes gallery generation
pnpm size:check     # complete JavaScript/worker budgets and basic-kit exclusions
pnpm docs:build     # API, checked examples, static docs and demo, at /glass-ux-image/
pnpm docs:check     # docs kit checks and sample typechecking
node scripts/serve-docs.mjs
# http://localhost:4332/glass-ux-image/ (also available on the LAN)

pnpm docs:dev       # Vite development site; run docs:api and build first
pnpm dev            # existing demo development server on port 4330
```

Before Chromium checks on this machine:

```sh
export LD_LIBRARY_PATH=$HOME/.cache/glass-ux-browser-libs/root/usr/lib/x86_64-linux-gnu
pnpm docs:test      # built site, real deployment path, deep links, modes, RTL and axe
pnpm test:e2e       # engine conformance and demo suites
```

GitHub Pages builds `apps/docs/dist`, including the application under `demo/`, TypeDoc under
`api/`, route index files, `llms.txt` and agent skills. CI also checks docs and bundle budgets.
Only Chromium with SwiftShader is exercised here. It emulates WebGL2 on the CPU and does not
establish real GPU performance. Firefox and Safari have not been tested. Translations are unreviewed.
The published package excludes `src/gallery` and the docs application.

## Licence

[MIT](LICENSE).

# Changelog

All notable changes to **ccw** are documented in this file. ccw is a fork of
[musistudio/claude-code-router](https://github.com/musistudio/claude-code-router).

> **Upgrading from v1.x?** v2.x is a major rewrite — the project moved from
> a single CLI wrapper to a `packages/{core,server,ui,cli,shared}` workspace
> with a web UI. A v1.x install at `~/.local/share/ccw` will not pick up v2.x
> features via the installer's update path because v1.x does not have a
> `package.json` declaring the new scripts. To upgrade: back up `~/.ccw/`
> (your config + presets), delete `~/.local/share/ccw`, then re-run
> `install.ps1` (Windows) or `install.sh` (macOS / Linux). The config format
> itself is backwards compatible — v1.x configs load in v2.x without
> changes.

## [2.3.0] - 2026-06-19

### Added

- **Animated in-place installer progress.** Both `install.sh` (macOS / Linux) and `install.ps1` (Windows) now render a single-line animated spinner (`⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`) with the current step label, updated in place via carriage return. When a step finishes, the line is replaced with a `✓ <label> — <elapsed>s` summary. No more scrolling, no more guessing what step is currently running. In non-interactive (piped) runs the spinner is skipped and a plain `[..] <label>` line is emitted so logs stay readable.
- **Structured error diagnostic on failure.** When any install step fails, the installer now prints a Diagnostic Card containing: the failing step, a likely cause matched against a catalog of known failure patterns, concrete remediation steps, and the path to the full per-run log. Catalog covers: esbuild native binary missing, lockfile drift, permission denied (incl. antivirus), disk full, network / DNS failure, TypeScript errors, peer-dep conflicts, and `pnpm` / `git` / `node` not on PATH.
- **Bahasa Indonesia (`id`) locale for the web UI.** The web UI is now available in English and Bahasa Indonesia. The Chinese (`zh`) locale has been removed.
- **Per-run install log.** Every step's combined stdout + stderr is written to `~/.ccw/logs/install-<timestamp>-<pid>.log`. The Diagnostic Card prints the path so a post-mortem is always one click away.
- **Pre-check on install parent directory.** Both installers now verify the parent of `$CCW_HOME` (or the default `~/.local/share/ccw` / `%LOCALAPPDATA%\Programs\ccw`) is writable *before* attempting the clone. On Windows we write + delete a sentinel file (the only reliable write-probe given inherited ACLs); on POSIX we test the parent. A clear remediation message points users at the `CCW_HOME` env var when the path is read-only.

### Fixed

- **`pnpm build` no longer false-fails on Windows.** The Windows installer used to run `pnpm build 2>&1 | Tee-Object ...` under `$ErrorActionPreference='Stop'`. esbuild and vite write progress text to stderr; PowerShell turned every stderr line into a `NativeCommandError` record, the first one triggered a terminating error, and the build was reported as failed even though it had actually succeeded. The installer now redirects at the shell layer (`cmd /c <cmd> > out 2> err`) and decides success purely from `$LASTEXITCODE`. The real exit code and the full output are now reported via the Diagnostic Card.
- **`pnpm build` no longer runs twice on Linux.** Previously the first run's output was silently discarded and a second run was triggered only on failure. Build now runs exactly once; its combined output is captured to the install log.
- **Single definition of `say` / `ok` / `step` / `fail`.** The Linux installer previously defined these helpers twice (a copy-paste leftover). The second definition silently shadowed the first; the installer now has a single source of truth.
- **Robust `Get-RemoteCommit`.** The previous implementation's `$out[0].Substring(0,7)` silently failed when `git ls-remote` returned a single-line (collapsed) result, always yielding an empty commit. The function now normalizes to an array, takes the first line, and guards the length.
- **PS 5.1 + .NET Framework 4.x compatibility.** Switched the wrapped-process construction from `new Process(ProcessStartInfo)` (not available on .NET Fx 4.x) to `new Process() { StartInfo = $psi }` (the documented cross-version pattern). Format strings containing `{0}` are now single-quoted to avoid the 5.1 parser trap on `{}` in double-quoted strings. The script is saved with a UTF-8 BOM so PowerShell 5.1 reads the em-dash characters correctly.
- **Service UI terminal is gated on a successful service start.** Previously a new terminal with `ccw ui` was opened even when the service had failed to come up.
- **`$env:LOCALAPPDATA` null-safety.** On a stripped-down PowerShell session the env var can be unset, in which case `Join-Path $env:LOCALAPPDATA 'Programs\ccw'` silently produces a relative path. The installer now falls back to `$env:USERPROFILE\AppData\Local`, or throws with a clear message if both are missing.

### Changed

- **Branding: lowercase `ccw` → `CCW` (Claude Code Wrapper) in user-facing surfaces.** The installer banner, CLI version output, CLI help text, web UI title bar, logo wordmark, top bar, and README now use the proper-noun form `CCW` (with the full name "Claude Code Wrapper" as a subtitle). Lowercase `ccw` is preserved where it is an identifier: the `ccw` binary, `ccw` command, `~/.ccw/` config dir, the `@ccw/*` npm scope, the `ccw-theme` localStorage key, and `ccw update` subcommand. These are load-bearing and renaming them would break existing user setups.

### Notes

- No breaking changes. The public CLI surface, the server API, and the config schema are unchanged. All v2.2.0 and v2.1.0 configs continue to load.
- No new external runtime dependencies.

## [2.2.0] - 2026-06-14

### Added

- **Chain fallback.** `Router` values accept a `string[]` of
  `provider,model` refs. On a recoverable error (401, 429, 5xx,
  quota, mid-stream 400), ccw advances to the next entry. The
  single-string form is still accepted.
- **Account pool.** Providers accept an `accounts[]` field. Multiple
  API keys are tried in order when one fails, before advancing the
  chain. The legacy `api_key` field is still accepted.
- **Token saver.** A new transformer compresses large `tool_result`
  blocks (git diffs, log dumps, file listings) before they reach the
  model. On by default; toggle with `tokenSaver: false` at the
  config root.
- **Terse mode.** A new transformer appends a terse-output
  instruction to the system prompt. Off by default; toggle with
  `terseMode: true`.

### Notes

- No breaking changes. Old configs load unchanged.

## [2.1.0] - 2026-06-14

### Added

- **Explicit Save buttons on every edit page.** Settings and Router now keep
  drafts in component state and show a sticky save bar whenever the draft
  diverges from the persisted config. The bar exposes Reset (discard) and
  Save (commit). Save disables itself while the request is in flight and
  re-enables on completion. Providers and Transformers, which already had
  an in-dialog Save affordance, now actually persist: `setConfig` is
  followed by `await save()`, with a green toast on success and a red toast
  carrying the server's error message on failure.
- **Server-side validation for provider uniqueness.** `POST /api/config`
  refuses to write a config with duplicate provider names. The check is
  case-insensitive and ignores whitespace, so `"openai"` and `"OpenAI"`
  collide. On rejection the server returns 400 with
  `{ "error": "duplicate_provider_names", "duplicates": [...] }`, and the
  UI toasts the message verbatim.
- **Real-time duplicate-name check on the Provider name field.** The inline
  error appears the moment the user types a name that already exists
  (case-insensitive), preventing most collisions client-side before the
  server has to.
- **Provider model picker.** `Fetch available models` no longer dumps the
  entire provider catalog into the selected list. It populates a selector;
  the user picks which models to add, and previously-selected ones are
  filtered out. Manual entry (`type a name, press Enter`) still works for
  models that don't appear in the fetched list.

### Changed

- **Dashboard: real request count.** The hero stat used to render a
  hardcoded `142 req/s`. It now counts the non-empty lines in
  `~/.ccw/logs/app.log` and shows something honest like
  `1,284 requests served`, with loading, error, empty, and refresh states.
- **Log viewer: real download, real button.** The refresh button now reads
  `Refresh` / `刷新` instead of leaking the raw i18n key. The download
  button writes the actual log lines, one per line. The previous code
  tried to destructure each line into `{ timestamp, level, message }` and
  produced `[undefined] [undefined] undefined` spam.
- **ConfigProvider contract.** The `useConfig()` hook now exposes
  `save()`, `isSaving`, and `saveError` in addition to the existing
  `config` and `setConfig`. `setConfig` is pure local-state mutation;
  `save()` is the only path that hits `POST /api/config`. Pages that want
  to persist must call `await save()` explicitly.

### Fixed

- **Settings page silently dropped changes.** Without an explicit Save
  button, edits to the gateway config were kept in component state but
  never written to disk. A page refresh reverted them. Fixed by the new
  draft + sticky save bar pattern.
- **Router page silently dropped changes.** Same root cause and fix as
  Settings.
- **Log download produced `[undefined]` spam.** The viewer assumed
  log lines were pre-parsed objects, but the server returns raw strings.
  Replaced the broken destructuring with `entries.join("\n")`.
- **Debug page history modal had a duplicate X icon.** The custom close
  button in the header was layered on top of the one Radix's
  `DialogContent` already renders. Removed the duplicate; the Radix one
  stays.
- **Log refresh button showed the i18n key.** The translation key
  `log_viewer.refresh` was missing from the locale files, so the raw key
  was rendered. Added it to both `en.json` and `zh.json`.

## [1.1.0] - 2026-06-13

### Features

- **`ccw update`**: pull the latest source from
  [arsasatria/ccw](https://github.com/arsasatria/ccw), rebuild, and restart
  the running service without re-running the installer. Detects the install
  directory from `$CCW_HOME` (highest priority), then
  `~/.local/share/ccw` on macOS/Linux, then
  `%LOCALAPPDATA%\Programs\ccw` on Windows. Exits with a clear message when
  the install directory is not a git checkout (so users know to re-run the
  installer instead). No-op when the local commit already matches `origin/main`.
  When `git pull --ff-only` fails (the installer uses `git clone --depth 1`,
  so a shallow history can refuse to fast-forward past a commit it doesn't
  have), falls back to `git fetch --depth 1` + `git reset --hard
  origin/main` instead of asking the user to re-run the installer.

### Bug fixes

- **Fix: `Service not running, starting service...` followed by
  `Service startup timeout` even after `ccw start/restart`**. Three
  related bugs combined to make the next command (`ccw code`,
  `ccw <preset>`, `ccw ui`) hang for 10 seconds and then give up:
  1. `run()` in `packages/cli/src/utils/index.ts` wrote the PID file
     *before* `await server.start()`. The `llms` start() calls
     `process.exit(1)` on failure (EADDRINUSE, misconfigured plugin, ...),
     so a crash during startup left a PID pointing at a dead process.
     Every subsequent `isServiceRunning()` then hit the stale PID,
     cleaned it up, and the auto-spawn never had anything to detect.
     The PID is now written only after `server.start()` resolves
     successfully, using an atomic temp-file + rename to close the
     half-written-file window.
  2. `isServiceRunning()` in
     `packages/cli/src/utils/processCheck.ts` treated every error from
     `process.kill(pid, 0)` the same (`cleanupPidFile()` + return false).
     On macOS, `EPERM` means the process IS alive but owned by another
     user — the previous user session's detached process, for example.
     `isServiceRunning()` now distinguishes `EPERM` (return true, leave
     the PID file alone) from `ESRCH` (truly stale, safe to clean up).
  3. `waitForService()` in `packages/cli/src/cli.ts` had a 10-second
     ceiling that could be eaten silently by `getServer()`'s
     transformer/plugin load on first run. Bumped to 30 seconds with a
     5-second heartbeat so the user sees the poll is still alive. Added
     a port-fallback to `isServiceAliveAsync()` so the helper accepts
     "port is open" as a secondary liveness signal when the PID file is
     missing or points at a recycled PID.

  The auto-spawn in `ccw code` / `ccw ui` / preset launches now also
  captures the child's stdout and stderr to a per-attempt log under
  `~/.ccw/logs/ccw-startup-<timestamp>-<pid>.log` and prints the path
  to the user. The previous `stdio: "ignore"` made startup failures
  (most commonly EADDRINUSE from a stale process or a manually-launched
  server on a different shell) completely invisible.

- **Fix: `400 function name or parameters is empty (2013)` from
  TokenRouter / MiniMax-M3 (and similar strict OpenAI-spec providers like
  Together, OpenRouter, NVIDIA NIM) causing
  `API Error: Content block is not a text block` to surface on the
  *next* Claude Code call.** Two related gaps in
  `AnthropicTransformer.transformRequestOut` allowed malformed tool
  shapes to leak into the OpenAI-format request body. The provider
  400'd mid-stream; the Anthropic SDK then reframed the error event
  as a content-block type mismatch.
  1. The assistant `tool_use` filter at line 155-156 only required
     `c.id` — a `tool_use` block with no `name` (server-tool
     recovery, partial history) slipped through and got serialized as
     `{ function: { name: undefined, arguments: "{}" } }`. Now also
     requires `c.name`.
  2. `convertAnthropicToolsToUnified` (line 253-263) used
     `tool.input_schema ?? emptySchema`, which only catches
     `null`/`undefined`. An upstream `input_schema: {}` (no fields
     declared) still passed through, and providers reject an empty
     parameters object. Switched to a key-count check that also
     catches `{}`. Added an `unknown_tool` name backfill to match
     the streaming-side default in `convertOpenAIStreamToAnthropic`.

### Regression test

- `packages/core/src/transformer/__tests__/anthropic.transformer.test.ts`
  now also asserts the request-side invariants: an assistant
  `tool_use` block without a `name` is dropped from the outgoing
  `tool_calls`; every tool definition ends up with a non-empty
  `function.name` and a non-empty `function.parameters` object (so
  strict providers stop 400'ing with `function name or parameters is
  empty (2013)`). Run with
  `cd packages/core && npx tsx --test src/transformer/__tests__/anthropic.transformer.test.ts`.

## [1.0.0] - 2026-06-13

Initial release of the standalone fork. All upstream code is inherited from
musistudio/claude-code-router at the time of forking; the project is renamed
to **ccw**, retargeted to its own GitHub repository, and re-licensed under
MIT (Copyright (c) 2026 arsasatria).

### Bug fixes

- **Fix: `API Error: Content block is not a text block` on interleaved
  text + `tool_use` streams** (issues [#1356](https://github.com/musistudio/claude-code-router/issues/1356),
  [#1371](https://github.com/musistudio/claude-code-router/issues/1371)).
  `AnthropicTransformer.convertOpenAIStreamToAnthropic` previously used
  `hasTextContentStarted` as a proxy for "is the current open content block
  a text block?", but the flag was only ever set to `true` and never reset
  when a `tool_use` block took over. This caused a later `delta.content`
  chunk to emit a `text_delta` event on the `tool_use` block's index, which
  the Anthropic SDK rejects.
  Replaced the flag with `currentContentBlockType: "text" | "tool_use" |
  "thinking" | "web_search_tool_result" | null`, set whenever a
  `content_block_start` is emitted and cleared whenever `content_block_stop`
  is emitted. Models that stream text before, between, and after tool calls
  (DeepSeek V4 Pro, Kimi K2.5, Qwen 3) now work without crashes.

- **Fix: `tools[0].function: missing field parameters` from strict
  OpenAI-spec providers** (issue [#1371](https://github.com/musistudio/claude-code-router/issues/1371)).
  `AnthropicTransformer.convertAnthropicToolsToUnified` passed
  `tool.input_schema` straight through to `function.parameters`. When a tool
  omitted `input_schema` (server tools, no-arg tools), the field became
  `undefined` and was dropped during JSON serialization, causing Together,
  OpenRouter, NVIDIA NIM, and other strict providers to reject the request.
  Backfilled with `{ type: "object", properties: {} }` when missing.

### Infrastructure

- New one-line installers (`install.ps1` for Windows, `install.sh` for
  macOS/Linux) inspired by the [deepclaude](https://github.com/RafiulM/deepclaude)
  installer pattern: verify Node.js >= 20, ensure pnpm via corepack, clone
  the source, build, drop a shim, and add the install directory to the user
  PATH. Idempotent — re-running acts as an updater.
- The installer also drops a second shim in a directory that is ALREADY on
  PATH for the current user (`%APPDATA%\npm` or `WindowsApps` on Windows,
  `/usr/local/bin` or `~/.local/bin` on Unix). This makes `ccw` callable
  from any newly-opened terminal with no PATH refresh and no waiting for
  environment propagation. The PATH-addition step is kept as a fallback for
  users whose standard PATH doesn't include the picked directory.
- Rebrand from `claude-code-router` to `ccw` (Claude Code Wrapper) across
  README, install scripts, and shim directory. Binaries renamed from `ccr`
  to `ccw`. Workspace packages renamed to `@ccw/{cli,server,ui,core,shared}`.

[2.1.0]: https://github.com/arsasatria/ccw/releases/tag/v2.1.0
[1.1.0]: https://github.com/arsasatria/ccw/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/arsasatria/ccw/releases/tag/v1.0.0

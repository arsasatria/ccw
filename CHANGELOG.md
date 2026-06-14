# Changelog

All notable changes to ccw are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

## [2.0.0] - 2026-05-22

### Notes

- Initial ccw release as a fork of claude-code-router.
- Rebrand from `claude-code-router` to `ccw` (Claude Code Wrapper).
- Binaries renamed from `ccr` to `ccw`.
- Workspace packages renamed to `@ccw/{cli,server,ui,core,shared}`.

[2.1.0]: https://github.com/arsasatria/ccw/releases/tag/v2.1.0
[2.0.0]: https://github.com/arsasatria/ccw/releases/tag/v2.0.0

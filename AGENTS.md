# Repository Guidelines

## Project Structure & Module Organization

LazyTabs is a WXT-powered Chrome extension written in TypeScript and React.
`entrypoints/` contains browser entry points: `background.ts` handles extension
events, while `popup/` and `options/` contain the React UIs and their HTML
hosts. Put reusable extension logic in `src/lib/`; `rules.ts` owns domain-rule
matching and validation, and `settings.ts` owns persisted settings. Global
Tailwind and component styles live in `src/styles.css`. Keep unit tests in
`tests/`, mirroring the module they exercise (for example, `tests/rules.test.ts`).

## Build, Test, and Development Commands

- `npm run dev` starts WXT's development build for loading the extension locally.
- `npm run build` creates a production extension bundle in `.output/`.
- `npm test` runs the Vitest suite once.
- `npm run typecheck` runs strict TypeScript checking without generating files.

Run `npm test` and `npm run typecheck` before opening a pull request. Run
`npm run build` when changes affect entry points, manifest configuration, or
extension integration.

## Coding Style & Naming Conventions

Use TypeScript with strict types; do not introduce `any` to sidestep a type
error. Follow the existing style: two-space indentation, single-quoted imports
and strings, semicolons, and trailing commas in multiline expressions. Use
PascalCase for React components (`PopupApp`), camelCase for functions and
variables (`matchesHost`), and descriptive domain types (`RuleInput`). Keep
pure rule and storage behavior in `src/lib/` rather than UI components. Use
Tailwind utilities for component layout and add shared CSS only to
`src/styles.css`.

## UI Framework

All plugin UI must use HeroUI V3.

## Testing Guidelines

Tests use Vitest's `describe`, `it`, and `expect`. Name test files
`*.test.ts` and state observable behavior in present tense, such as
`it('matches exact domains and one-level subdomain wildcards', ...)`. Add or
update focused unit coverage whenever changing rule normalization, matching,
conflict detection, or validation. There is no configured coverage threshold;
preserve coverage for affected branches.

## Commit & Pull Request Guidelines

Use concise Conventional Commit-style subjects, as in `feat: add domain-based
tab grouping extension`, `fix: restrict domain wildcard matching`, and
`test: specify domain rule semantics`. Keep each commit scoped to one change.
Pull requests should explain the user-visible behavior, link the relevant
issue when available, list validation commands run, and include screenshots
for popup or options UI changes.

## Extension Boundaries

The manifest grants `storage`, `tabs`, and `tabGroups` permissions. Treat
permission changes and new Chrome API usage as security-sensitive: document
why they are necessary and test the extension in Chrome before merging.

# Repository Guidelines

## Project Structure & Module Organization
Use the root directory for workspace-level metadata (`package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`). Keep all runtime code under `src/`, organized by feature (`src/reader`, `src/library`, `src/sync`). Shared utilities belong in `src/shared`, and UI primitives in `src/components`. Place EPUB fixtures and mock OPF files under `fixtures/` so automated tests and preview data stay versioned. End-to-end test suites live in `tests/e2e`, while unit and integration specs sit beside their modules (`src/**/__tests__`).

## Build, Test, and Development Commands
- `pnpm install`: installs dependencies using the locked Node 20 toolchain.
- `pnpm dev`: launches the local reader preview with hot reload and fixture auto-loading.
- `pnpm build`: produces the optimized web bundle and exportable worker scripts in `dist/`.
- `pnpm test`: runs the Vitest suite; append `--watch` when iterating.
- `pnpm lint`: runs ESLint + TypeScript checks; required before any PR.

## Coding Style & Naming Conventions
Write TypeScript with 2-space indentation and trailing commas enabled. Favor functional React components and hooks; class components are reserved for bridge layers only. Name files in kebab-case (`epub-toc.ts`), React components in PascalCase, and hooks/helpers in camelCase. Run `pnpm lint --fix` before committing so ESLint, Prettier, and Stylelint keep the codebase consistent. Typed enums and schema definitions should live in `src/shared/types`. Avoid default exports except for React components.

## Testing Guidelines
Unit tests rely on Vitest plus React Testing Library; mock network calls with MSW handlers stored in `tests/mocks`. Name specs `<module>.spec.ts` and mirror the folder path. Every feature PR must cover new business logic with tests and keep coverage >= 85% (`pnpm test --coverage`). Use Playwright for smoke-level EPUB import/export checks inside `tests/e2e`; these run in CI nightly, but you can trigger locally with `pnpm test:e2e`.

## Commit & Pull Request Guidelines
Follow Conventional Commits (`feat: add pagination controls`, `fix: guard spine parsing`). Write focused commits and include rationale in the body when touching parser internals. PR descriptions must summarize behavior, list test evidence (`pnpm test`, `pnpm lint`), and link related issues. Attach screenshots or GIFs for UI tweaks (reader pane, bookshelf, typography settings). Request review from at least one maintainer familiar with the touched module and wait for CI to pass before merging.

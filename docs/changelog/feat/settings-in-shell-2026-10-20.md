# Settings inside the shell

## Summary

Phase 5 of the frontend rebuild (`docs/architecture/frontend.md`). Owner
settings now live inside the app shell at `/settings/:section`, with a
section nav, instead of one long page:

- **Basic setup:** the GitHub App connection with a link to it on GitHub;
  repositories per installation with each one's review scope ("All files"
  or its paths) and an inline scope editor; Add repositories; Disconnect.
  Notices for GitHub's callbacks: App created (with Install on
  repositories), installed, and setup errors.
- **Models:** a model picker showing name and id, and effort as a
  five-level control. Levels a model doesn't support are disabled, and a
  model without an effort setting disables the control and says so.
  Reset to defaults appears once a row is customized.
- **Users:** a table with avatar, sign-in count, Owner or Member, and last
  seen; a menu per row makes someone an owner or a member. The last owner
  can't be removed.

## Design

- `/settings` stays outside the shell and is still where GitHub's App
  callbacks land. It runs first-time setup (`SetupFlow`) and the ownership
  claim, sends owners on to `/settings/basic` with the callback's query
  string, and sends non-owners home.
- The 1,027-line `SettingsPage` is split into `features/settings/`: the
  entry, the layout, one file per section, the scope editor, and
  onboarding. Data goes through TanStack Query (`features/settings/queries.ts`);
  setup calls moved to `api/setup.ts`.
- "Add path" in the scope editor focuses the new row.
- The mock API now serves an installation with two repos, per-repo scope,
  and four users with role changes.

## Copy

Roles read "Owner" and "Member" (the API's `user` role).

# Review page: compact bar, verdict card, finding cards

## Summary

Phase 4 of the frontend rebuild (`docs/architecture/frontend.md`). The PR
page inside the shell gets the redesign:

- **Compact bar:** author avatar, title, and a details line (author, repo
  and number, branch, +/− lines, files, Open). Beside the view switcher, a
  state pill when there's something to say:
  - **Reviewing · 1m 12s**, with a progress line along the bar's edge;
    click for the activity log.
  - **Review failed**; click for the error and Try again.
  - **2 new commits** (or **New commits** when GitHub can't count them),
    with Rerun.
  - **Merged yesterday** or **Closed**.
- **View switcher:** Analysis, Architecture, Chat with icons. The view is
  in the URL (`/pull/316/chat`), so it can be linked to and the back
  button works.
- **Verdict card** above the findings, then **finding cards**, expanded by
  default and collapsible, most severe first. Each has its severity, title,
  and location (which opens the file) in the header, and the category and
  actions in the footer. Post as comment is the primary action on critical
  and high findings.
- The "⋯" menu has Open on GitHub, Rerun review, and Review rules.

## Design

- `features/review/` holds the page (`ReviewPage`), `PrBar`,
  `BarStatePill`, `VerdictCard`, `FindingCard`, and `useFindingActions`
  (comment, fix prompt, file location, moved out of the old renderer).
- The bar's state comes from `domain/prStatus.barState`; it replaces the
  rerun banner and the stale banner.
- Inactive views are `inert`, so keyboard focus can't land in a hidden
  view.
- Removed: `WalkthroughPage`, `FindingRenderer`, `VerdictBanner`,
  `StaleIndicator`, `ReviewRunBanner`, the scroll `ProgressBar` (it read
  window scroll, which never moves inside the shell), `GenerateButton`,
  and `useAuth`.

## Copy

User-facing text says "review" instead of "walkthrough" (login, CLI
pages, Settings, an API error, README, CLAUDE.md, package description).
Internal names (the `walkthroughs` table, `/api/walkthroughs`, and the
`cruise-line pr walkthrough` CLI command) are unchanged.

# Mobile and narrow-window layout

## Summary

- **File panel**: below 768px it opens full screen (sliding in from the
  right) instead of a 700px column that pushed the review off screen. On
  wider screens it stays a resizable column, shrunk as needed so the review
  keeps at least 360px.
- **Sidebar steps aside while the panel is open**, at every width, as the
  shell design intended. `shell/ShellContext` carries the flag;
  `useShellPanel` sets it from the slideout.
- **PR bar follows its own width** (container queries), not the window's,
  so it fits beside an open panel: the avatar, repo, branch, stats, and
  view labels drop out as it narrows.
- **View switcher on phones**: it was hidden below 640px, leaving no way to
  reach Architecture or Chat. It collapses to icons instead
  (`SegmentedControl collapseLabels`), with the labels kept as accessible
  names.
- **Finding cards**: on a narrow card the file location moves under the
  title instead of squeezing it.
- **Settings on phones**: the shell showed the inbox on every page but a
  PR, so Settings was unreachable. Now only the inbox root shows the
  sidebar. Settings gets an Inbox back link and a row of sections.
- Smaller: the rules dialog keeps a margin on phones, the shell uses `dvh`,
  and the slideout's icon buttons have names.

## Testing

- Checked in the mock app at 390px (PR, file panel, chat, architecture,
  settings) and 900px (file panel open).
- `bun test`, `tsc --noEmit`, and `vite build`.

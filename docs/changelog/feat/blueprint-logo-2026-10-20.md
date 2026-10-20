# Blueprint avatar as the logo

## Summary

The Astropods blueprint avatar (a cruise ship at sea) is now the Cruise Line
logo everywhere the app shows one.

- `frontend/public/logo.jpg` (256px) is the avatar from
  `assets.astropods.ai/avatars/agents/astropods/cruise-line.jpg`;
  `favicon-32.png`, `favicon-192.png`, and `apple-touch-icon.png` are sized
  from the same 512px source. `favicon.svg` embeds a 64px copy clipped to
  rounded corners; browsers without SVG favicons use the PNGs. The old
  `logo.png` is gone.
- `shell/Logo` renders the image with a small corner radius (3px at 24px,
  growing slightly with size).
- **Where it shows up:**
  - The inbox sidebar and the setup flow (both already used `Logo`).
  - The home page hero.
  - Sign-in, CLI authorization, and claim ownership, which had no mark before.
  - The chat empty state and first-review progress, in place of the anchor icon.
- The CLI authorization card's border used `--border-subtle`, which no
  longer exists; it's `border-line` now.

The PR comment's ⚓ emoji and the README images are unchanged.

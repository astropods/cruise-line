# Opus 5.5 default and owner-picked models

## Summary

The default model moves to Claude Opus 5.5 (`claude-opus-5-5`, verified
against the live model docs). Owners can now choose the model and effort
level for reviews and for chat separately in Settings → Models, from
every model the deploy's Anthropic API key can use.

## Design

- **Model list:** only the sandbox holds Anthropic credentials, so it
  serves `GET /models` from the Models API (cached 10 minutes), reporting
  which effort levels each model supports.
- **Storage:** choices live in `app_config` (`claude.review.*`,
  `claude.chat.*`); no migration. Unset means the deploy's `CLAUDE_MODEL`
  and `high` effort.
- **Effort default:** Opus 5.5 defaults to `medium` when no effort is
  sent. Cruise Line sends `high` unless an owner picks otherwise, so
  reviews keep the depth they had on Opus 4.8.
- **Validation:** saves are checked against the model list. At query
  time an effort level the model doesn't support is dropped rather than
  failing the query.

## Migration

None. `CLAUDE_MODEL` remains the deploy-time default; the short-lived
`CLAUDE_EFFORT` input was removed in favor of the settings page.

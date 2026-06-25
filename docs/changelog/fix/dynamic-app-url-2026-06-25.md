# Use the platform-injected external URL for PR comments

## Summary

PR comments link viewers to the walkthrough on Cruise Line itself, and that
link is built from `config.appUrl`. The first time an instance ran setup we
stored the configured URL in the `app_config` table so it would survive
restarts. That cached value won an override race against the env-based default
on every boot, which was fine — until a redeployment moved the instance to a
new external URL. The GitHub App was reconfigured for the new host and started
posting comments again, but every comment still pointed at the old, dead URL
because the stale value in the DB kept clobbering the new environment.

This change makes the platform's external URL authoritative whenever it is
present, so a redeploy can't be silently shadowed by a stale setup record.

## Design

Astro injects `ASTRO_EXTERNAL_AGENT_URL` into the agent container, and that
variable always reflects the current external URL of the deployment. We treat
it as the source of truth:

```ts
appUrl: optionalEnv(
  'ASTRO_EXTERNAL_AGENT_URL',
  optionalEnv('APP_URL', 'http://localhost:80'),
),
```

The DB-cached value is still loaded on boot — local and non-Astro deployments
that go through the setup flow continue to work the same way — but the
override is now gated:

```ts
if (savedAppUrl && !process.env.ASTRO_EXTERNAL_AGENT_URL) {
  config.appUrl = savedAppUrl;
}
```

The precedence on Astro is now: platform env > DB cache > `APP_URL` >
localhost default. Off Astro, where the platform variable isn't set, the
behavior is unchanged.

A stale `app_url` row may still exist in `app_config` after a redeploy; it is
inert as long as the platform variable is exported and can be left in place
or cleared with a one-off `DELETE FROM app_config WHERE key = 'app_url'`.

## Migration

Nothing required. New PR comments posted after deploy will use the current
external URL automatically. Comments already posted on existing PRs keep their
old (now stale) links — re-trigger generation on any PR that needs an
updated link.

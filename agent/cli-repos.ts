/**
 * Thin re-export so the CLI /repos route can be mocked in tests without
 * clobbering the whole github/client.ts export surface. github/client.ts
 * also exports `verifyRepoAccess`, which the `requireRepoAccess` middleware
 * relies on — a full-module mock in one test file leaks across the process
 * and breaks the middleware tests in auth.test.ts.
 */
export { listInstallationsWithReposForUser } from './github/client.js';

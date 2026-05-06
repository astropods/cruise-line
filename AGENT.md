---
description: "AI-powered pull request analysis agent — reviews code for correctness, security, and quality with actionable findings, one-click commenting, and fix prompts for Claude Code."
tags:
  - "code-review"
  - "github"
  - "pull-requests"
  - "security"
authors: []
capabilities:
  - "pr-analysis"
  - "code-exploration"
  - "chat"
integrations:
  - "anthropic"
  - "github"
---

<p align="center">
  <img src="https://github.com/astropods/cruise-line/blob/main/cruise-line-logo.png?raw=true" width="200" alt="Cruise Line" />
</p>

<h1 align="center">Cruise Line</h1>

Cruise Line analyzes GitHub pull requests for correctness, security, maintainability, performance, and code quality. It produces structured findings with severity levels, concrete fix suggestions, and one-click actions to post comments or copy prompts for Claude Code.

## Setup

After deploying, visit your agent's URL to start the setup wizard.

### 1. Connect to GitHub

Click **Connect to GitHub** to create a GitHub App via the manifest flow. You'll be redirected to GitHub to authorize the app. For GitHub Enterprise, check the "I'm using GitHub Enterprise" box and enter your instance URL first.

To switch to a different GitHub connection later, return to `/setup` and click **Disconnect and reconnect**.

### 2. Install on repositories

After connecting, click **Install on repos** to choose which repositories Cruise Line can access. You can change this at any time from your GitHub App settings.

## Usage

### PR analysis

When you open a pull request on a connected repository, Cruise Line posts a comment with a link. Clicking it opens the analysis page, which automatically starts reviewing the PR.

The analysis produces:

- **Verdict** — Approve, request changes, or needs discussion, with a rationale
- **Findings** — Discrete issues ordered by severity (critical, high, medium, low, info), each with a category (correctness, security, maintainability, performance, style)
- **Suggested changes** — Before/after diffs you can post as GitHub review comments in one click
- **Fix prompts** — Copy a prompt to paste into Claude Code that gives it all the context to fix the issue

### Chat

Switch to the **Chat** tab to ask follow-up questions. Claude has full access to the codebase and can use the same interactive directives — suggestions, callouts, and structured findings — in its responses.

### Review rules

Open **Review rules** from the three-dot menu to configure per-repo rules. Rules are numbered and guide the analysis — for example:

- *Rule #1:* All API endpoints must validate input with Zod
- *Rule #2:* Never use string interpolation in SQL queries
- *Rule #3:* React components must not call hooks conditionally

The agent references rules by number when they're relevant (e.g., "This violates Rule #2"). Hovering a rule reference in the analysis shows the full rule text. You can also save findings as new rules directly from the analysis view.

### Commenting

Click the **Comment** button on any code block or suggestion to open the file viewer with the comment input pre-filled. Edit if needed, then submit — it posts directly as a GitHub review comment on the PR.

## Configuration

| Setting | Default | Description |
|---|---|---|
| Claude Model | `claude-opus-4-6` | Model used for analysis. Opus is most thorough, Haiku is fastest. |
| Max Concurrent Jobs | `3` | How many PRs can be analyzed simultaneously. |

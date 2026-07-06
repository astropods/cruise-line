// The cruise-line CLI. Local companion for the Cruise Line PR review service.
//
// Auth model: OAuth 2.0 Authorization Code + PKCE, loopback redirect. A single
// login exchanges browser identity for a bearer token that later commands send
// via Authorization: Bearer <token>. The token is stored in a config file
// under $XDG_CONFIG_HOME (or ~/.config on macOS/Linux).
//
// Coding-agent shape: agents open a PR, then poll `cruise-line pr status
// owner/repo#N --wait` until the walkthrough is ready, then fetch it with
// `cruise-line pr walkthrough owner/repo#N` and act on it locally.
package main

import (
	"fmt"
	"os"
)

// fallbackVersion is used only when the local config has no installed
// version recorded yet — e.g. a freshly-downloaded binary that has never
// hit /api/cli/latest, or a local `go build .` binary. The version the
// CLI actually reports and compares against the server lives in
// config.InstalledVersion, populated on install/upgrade and bootstrapped
// on the first successful update check. See resolvedVersion() below.
const fallbackVersion = "dev"

// resolvedVersion returns the version the CLI should report for itself.
// Prefer the config-tracked installed version; fall back to the constant
// when no config is available. Never blocks — a config-read error just
// falls through to the constant.
func resolvedVersion() string {
	cfg, err := LoadConfig()
	if err != nil || cfg == nil || cfg.InstalledVersion == "" {
		return fallbackVersion
	}
	return cfg.InstalledVersion
}

func main() {
	if len(os.Args) < 2 {
		printRootHelp(os.Stderr)
		os.Exit(1)
	}

	cmd := os.Args[1]
	args := os.Args[2:]

	// Lazy update check runs on any command that touches the server, unless
	// it's the update-related commands themselves. Fires at most once per
	// 24h (see updateCheckInterval) and hangs on to the result so we can
	// print the notice AFTER the command runs — never interleaved with
	// stdout output the caller is likely piping into another tool.
	var updateNotice *latestResponse
	var updateCfg *Config
	switch cmd {
	case "version", "--version", "-v", "help", "--help", "-h", "upgrade", "login":
		// skip — these commands don't touch the server, or would be self-referential.
	default:
		cfg, err := LoadConfig()
		if err == nil {
			updateNotice = maybeCheckForUpdate(cfg)
			updateCfg = cfg
		}
	}

	switch cmd {
	case "login":
		run(cmdLogin, args)
	case "logout":
		run(cmdLogout, args)
	case "whoami":
		run(cmdWhoami, args)
	case "pr":
		run(cmdPR, args)
	case "repos":
		run(cmdRepos, args)
	case "rules":
		run(cmdRules, args)
	case "review-prompt":
		run(cmdReviewPrompt, args)
	case "user-prompt":
		run(cmdUserPrompt, args)
	case "install-skills":
		run(cmdInstallSkills, args)
	case "api":
		run(cmdAPI, args)
	case "upgrade":
		run(cmdUpgrade, args)
	case "version", "--version", "-v":
		fmt.Println("cruise-line", resolvedVersion())
	case "help", "--help", "-h":
		printRootHelp(os.Stdout)
	default:
		fmt.Fprintf(os.Stderr, "unknown command %q\n\n", cmd)
		printRootHelp(os.Stderr)
		os.Exit(1)
	}

	notifyIfOutdated(updateCfg, updateNotice)
}

type commandFunc func(args []string) error

func run(fn commandFunc, args []string) {
	if err := fn(args); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func printRootHelp(w *os.File) {
	fmt.Fprintf(w, `cruise-line — Cruise Line CLI

usage: cruise-line <command> [args]

commands:
  login <host>                Authenticate against a Cruise Line host
  logout                      Revoke the local token and clear config
  whoami                      Print the identity the local token maps to
  repos                       List repositories the Cruise Line App is installed on
  rules <owner/repo>          Print review rules configured for a repository
  pr status <owner/repo>#<n>  Print the analysis status for a PR
  pr walkthrough <owner/repo>#<n>
                              Print the walkthrough JSON for a PR
  pr review <owner/repo>#<n>  Trigger a new analysis run on a PR
  user-prompt <owner/repo>    Assemble a review prompt for local changes vs base (pre-PR)
  review-prompt               Print the server's system prompt (for local skills)
  install-skills              Install the local-review skill + sub-agent definition
  api <method> <path>         Call an arbitrary Cruise Line API endpoint
  upgrade                     Upgrade the CLI to the version this host ships
  version                     Print CLI version
  help                        Show this help

flags:
  cruise-line pr status supports --wait, --timeout <duration>, --interval <duration>
  cruise-line user-prompt supports --base <ref> and --title <text>
  cruise-line api    supports --body <json> and --body-file <path|->
  cruise-line upgrade supports --force
  cruise-line install-skills supports --force and --dir <path>

durations accept Go syntax (10m, 30s, 1h). config lives at $CRUISE_LINE_HOME
or $XDG_CONFIG_HOME/cruise-line/config.json (falling back to
~/.config/cruise-line/config.json).
`)
}

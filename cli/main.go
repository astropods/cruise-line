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

const version = "0.1.0"

func main() {
	if len(os.Args) < 2 {
		printRootHelp(os.Stderr)
		os.Exit(1)
	}

	cmd := os.Args[1]
	args := os.Args[2:]

	switch cmd {
	case "login":
		run(cmdLogin, args)
	case "logout":
		run(cmdLogout, args)
	case "whoami":
		run(cmdWhoami, args)
	case "pr":
		run(cmdPR, args)
	case "api":
		run(cmdAPI, args)
	case "version", "--version", "-v":
		fmt.Println("cruise-line", version)
	case "help", "--help", "-h":
		printRootHelp(os.Stdout)
	default:
		fmt.Fprintf(os.Stderr, "unknown command %q\n\n", cmd)
		printRootHelp(os.Stderr)
		os.Exit(1)
	}
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
  pr status <owner/repo>#<n>  Print the analysis status for a PR
  pr walkthrough <owner/repo>#<n>
                              Print the walkthrough JSON for a PR
  api <method> <path>         Call an arbitrary Cruise Line API endpoint
  version                     Print CLI version
  help                        Show this help

flags:
  cruise-line login supports --label <text> and --host <url> as alternates
  cruise-line pr status supports --wait and --timeout <seconds>

config lives at $CRUISE_LINE_HOME or $XDG_CONFIG_HOME/cruise-line/config.json
(falling back to ~/.config/cruise-line/config.json).
`)
}

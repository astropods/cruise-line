package main

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"strings"
)

// cmdRepos implements `cruise-line repos`.
//
// Lists every repository the GitHub App is installed on so a coding agent
// can pick a target without hard-coding the list. Response is the raw
// installations array from the server — agents parse it with jq.
func cmdRepos(args []string) error {
	fs := flag.NewFlagSet("repos", flag.ContinueOnError)
	fs.Usage = func() {
		fmt.Fprintln(os.Stderr, "usage: cruise-line repos")
	}
	if err := fs.Parse(args); err != nil {
		return err
	}
	if fs.NArg() != 0 {
		fs.Usage()
		return errors.New("repos does not take positional arguments")
	}

	cfg, err := RequireLoggedIn()
	if err != nil {
		return err
	}
	client := NewClient(cfg)

	var out struct {
		Installations json.RawMessage `json:"installations"`
	}
	if err := client.GetJSON("/api/cli/repos", &out); err != nil {
		return err
	}
	// Pass the array through untouched so the JSON shape matches the
	// server's — agents can rely on it directly.
	return writeIndentedJSON(out.Installations)
}

// cmdRules implements `cruise-line rules <owner/repo>`.
//
// Fetches the review rules configured for a repo. Read-only for now; edits
// still require a browser session on /settings.
func cmdRules(args []string) error {
	fs := flag.NewFlagSet("rules", flag.ContinueOnError)
	fs.Usage = func() {
		fmt.Fprintln(os.Stderr, "usage: cruise-line rules <owner/repo>")
	}
	if err := fs.Parse(args); err != nil {
		return err
	}
	if fs.NArg() != 1 {
		fs.Usage()
		return errors.New("expected exactly one positional argument: owner/repo")
	}
	owner, repo, ok := strings.Cut(fs.Arg(0), "/")
	if !ok || owner == "" || repo == "" {
		return fmt.Errorf("expected owner/repo, got %q", fs.Arg(0))
	}

	cfg, err := RequireLoggedIn()
	if err != nil {
		return err
	}
	client := NewClient(cfg)

	var out struct {
		Rules json.RawMessage `json:"rules"`
	}
	path := fmt.Sprintf("/api/rules/%s/%s", owner, repo)
	if err := client.GetJSON(path, &out); err != nil {
		return err
	}
	return writeIndentedJSON(out.Rules)
}

// writeIndentedJSON pretty-prints a raw JSON message for humans. Passing a
// nil or empty value emits an empty array — better than "null" for scripting.
func writeIndentedJSON(raw json.RawMessage) error {
	if len(raw) == 0 {
		fmt.Println("[]")
		return nil
	}
	var v any
	if err := json.Unmarshal(raw, &v); err != nil {
		// Fall back to raw bytes if unmarshal fails — never worse than
		// silently dropping the response.
		_, err := os.Stdout.Write(raw)
		if err == nil {
			fmt.Println()
		}
		return err
	}
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	return enc.Encode(v)
}

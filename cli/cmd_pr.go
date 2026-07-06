package main

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

func cmdPR(args []string) error {
	if len(args) == 0 {
		return errors.New("usage: cruise-line pr <status|walkthrough|review|prompt> owner/repo#N")
	}
	sub := args[0]
	rest := args[1:]
	switch sub {
	case "status":
		return prStatus(rest)
	case "walkthrough":
		return prWalkthrough(rest)
	case "review":
		return prReview(rest)
	case "prompt":
		return prPrompt(rest)
	default:
		return fmt.Errorf("unknown pr subcommand %q (expected status, walkthrough, review, or prompt)", sub)
	}
}

// prRef is the owner/repo#N shape agents pass on the command line.
type prRef struct {
	Owner  string
	Repo   string
	Number int
}

// parsePRRef accepts owner/repo#N. #N can also be separated by a space or
// passed as a second positional arg, but keeping a single-token form makes
// scripting cleaner: `cruise-line pr status astropods/cruise-line#42`.
func parsePRRef(s string) (*prRef, error) {
	base, numStr, ok := strings.Cut(s, "#")
	if !ok {
		return nil, fmt.Errorf("expected owner/repo#N, got %q", s)
	}
	owner, repo, ok := strings.Cut(base, "/")
	if !ok || owner == "" || repo == "" {
		return nil, fmt.Errorf("expected owner/repo before #, got %q", base)
	}
	num, err := strconv.Atoi(numStr)
	if err != nil || num <= 0 {
		return nil, fmt.Errorf("expected positive PR number after #, got %q", numStr)
	}
	return &prRef{Owner: owner, Repo: repo, Number: num}, nil
}

type statusResponse struct {
	WalkthroughID int             `json:"walkthroughId,omitempty"`
	Status        string          `json:"status"`
	HeadSHA       string          `json:"headSha,omitempty"`
	Error         string          `json:"error,omitempty"`
	Progress      json.RawMessage `json:"progress,omitempty"`
}

func prStatus(args []string) error {
	fs := flag.NewFlagSet("pr status", flag.ContinueOnError)
	wait := fs.Bool("wait", false, "block until status is complete or failed")
	timeout := fs.Duration("timeout", 10*time.Minute, "max wait duration when --wait is set")
	interval := fs.Duration("interval", 3*time.Second, "poll interval when --wait is set")
	fs.Usage = func() {
		fmt.Fprintln(os.Stderr, "usage: cruise-line pr status <owner/repo#N> [--wait] [--timeout DURATION] [--interval DURATION]")
	}
	if err := fs.Parse(args); err != nil {
		return err
	}
	if fs.NArg() != 1 {
		fs.Usage()
		return errors.New("expected exactly one positional argument: owner/repo#N")
	}
	ref, err := parsePRRef(fs.Arg(0))
	if err != nil {
		return err
	}
	cfg, err := RequireLoggedIn()
	if err != nil {
		return err
	}
	client := NewClient(cfg)

	path := fmt.Sprintf("/api/walkthroughs/%s/%s/%d/status", ref.Owner, ref.Repo, ref.Number)

	if !*wait {
		var out statusResponse
		if err := client.GetJSON(path, &out); err != nil {
			return err
		}
		return jsonPrint(out)
	}

	deadline := time.Now().Add(*timeout)
	// Client-side polling. Long-poll on the server is a future upgrade; for
	// now the loop is cheap and predictable for agents.
	for {
		var out statusResponse
		if err := client.GetJSON(path, &out); err != nil {
			return err
		}
		if out.Status == "complete" || out.Status == "failed" {
			return jsonPrint(out)
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("timed out after %s waiting for status=complete (last status: %q)", *timeout, out.Status)
		}
		time.Sleep(*interval)
	}
}

func prWalkthrough(args []string) error {
	fs := flag.NewFlagSet("pr walkthrough", flag.ContinueOnError)
	fs.Usage = func() {
		fmt.Fprintln(os.Stderr, "usage: cruise-line pr walkthrough <owner/repo#N>")
	}
	if err := fs.Parse(args); err != nil {
		return err
	}
	if fs.NArg() != 1 {
		fs.Usage()
		return errors.New("expected exactly one positional argument: owner/repo#N")
	}
	ref, err := parsePRRef(fs.Arg(0))
	if err != nil {
		return err
	}
	cfg, err := RequireLoggedIn()
	if err != nil {
		return err
	}
	client := NewClient(cfg)

	path := fmt.Sprintf("/api/walkthroughs/%s/%s/%d", ref.Owner, ref.Repo, ref.Number)
	// The response is a large JSON object; forward it as-is so agents don't
	// need to track our schema. We use RawRequest so we don't need a struct
	// mirror of the whole walkthrough here.
	status, _, body, err := client.RawRequest("GET", path, nil)
	if err != nil {
		return err
	}
	if status < 200 || status >= 300 {
		// Try to surface the server's error field.
		var e struct {
			Error string `json:"error"`
		}
		_ = json.Unmarshal(body, &e)
		if e.Error != "" {
			return fmt.Errorf("HTTP %d: %s", status, e.Error)
		}
		return fmt.Errorf("HTTP %d: %s", status, strings.TrimSpace(string(body)))
	}
	_, err = os.Stdout.Write(body)
	if err == nil {
		fmt.Println()
	}
	return err
}

// prReview implements `cruise-line pr review owner/repo#N`.
//
// POSTs to /generate to kick off analysis. The server is idempotent for the
// non-force branch — if a completed walkthrough already exists at the PR's
// current head SHA, the same walkthrough is returned instantly. Push a new
// commit → new SHA → fresh analysis. Pair with `pr status --wait` to block
// until the walkthrough is ready.
//
// No --force flag: force=true would wipe an existing completed walkthrough,
// and the server rejects that from CLI tokens by design. If you actually
// want to re-run analysis on the same SHA, do it from the browser.
func prReview(args []string) error {
	fs := flag.NewFlagSet("pr review", flag.ContinueOnError)
	fs.Usage = func() {
		fmt.Fprintln(os.Stderr, "usage: cruise-line pr review <owner/repo#N>")
	}
	if err := fs.Parse(args); err != nil {
		return err
	}
	if fs.NArg() != 1 {
		fs.Usage()
		return errors.New("expected exactly one positional argument: owner/repo#N")
	}
	ref, err := parsePRRef(fs.Arg(0))
	if err != nil {
		return err
	}
	cfg, err := RequireLoggedIn()
	if err != nil {
		return err
	}
	client := NewClient(cfg)

	path := fmt.Sprintf("/api/walkthroughs/%s/%s/%d/generate", ref.Owner, ref.Repo, ref.Number)

	// POST body is intentionally empty — the endpoint reads everything from
	// the URL.
	var out struct {
		WalkthroughID int    `json:"walkthroughId"`
		Status        string `json:"status"`
	}
	if err := client.PostJSON(path, map[string]any{}, &out); err != nil {
		return err
	}
	return jsonPrint(out)
}

// prPrompt implements `cruise-line pr prompt owner/repo#N`.
//
// Fetches the exact user prompt the server would feed to its analysis job
// for this PR — assembled server-side via the same buildUserPrompt helper
// the analyzer uses, so a local review reads identical inputs. The
// cruise-line-review skill pipes this straight into a sub-agent's user
// slot; pairs with the SYSTEM_PROMPT that install-skills pins to the
// sub-agent definition.
func prPrompt(args []string) error {
	fs := flag.NewFlagSet("pr prompt", flag.ContinueOnError)
	fs.Usage = func() {
		fmt.Fprintln(os.Stderr, "usage: cruise-line pr prompt <owner/repo#N>")
	}
	if err := fs.Parse(args); err != nil {
		return err
	}
	if fs.NArg() != 1 {
		fs.Usage()
		return errors.New("expected exactly one positional argument: owner/repo#N")
	}
	ref, err := parsePRRef(fs.Arg(0))
	if err != nil {
		return err
	}
	cfg, err := RequireLoggedIn()
	if err != nil {
		return err
	}
	client := NewClient(cfg)

	var out struct {
		UserPrompt string `json:"userPrompt"`
	}
	path := fmt.Sprintf("/api/walkthroughs/%s/%s/%d/prompt", ref.Owner, ref.Repo, ref.Number)
	if err := client.GetJSON(path, &out); err != nil {
		return err
	}
	// Print with trailing newline so `!\`cruise-line pr prompt ...\``
	// inlining in a skill file terminates cleanly.
	fmt.Println(out.UserPrompt)
	return nil
}

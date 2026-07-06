package main

import (
	"errors"
	"flag"
	"fmt"
	"os"
)

// cmdReviewPrompt implements `cruise-line review-prompt`.
//
// Prints the server's SYSTEM_PROMPT to stdout. Skills feed this into
// Claude's system slot so a local review runs the same methodology,
// severity taxonomy, and output shape a server-driven Cruise Line
// review would produce.
//
// Fetches on every call rather than caching — the prompt is small
// (<200 lines) and pinning it in config would risk skills running
// against a stale prompt after a server upgrade.
func cmdReviewPrompt(args []string) error {
	fs := flag.NewFlagSet("review-prompt", flag.ContinueOnError)
	fs.Usage = func() {
		fmt.Fprintln(os.Stderr, "usage: cruise-line review-prompt")
	}
	if err := fs.Parse(args); err != nil {
		return err
	}
	if fs.NArg() != 0 {
		fs.Usage()
		return errors.New("review-prompt does not take positional arguments")
	}

	cfg, err := RequireLoggedIn()
	if err != nil {
		return err
	}
	client := NewClient(cfg)

	var out struct {
		Prompt string `json:"prompt"`
	}
	if err := client.GetJSON("/api/cli/review-prompt", &out); err != nil {
		return err
	}

	// Print to stdout with a trailing newline so shell interpolation
	// (e.g. Claude Code's !`cruise-line review-prompt` directive) sees
	// a clean end of output.
	fmt.Println(out.Prompt)
	return nil
}

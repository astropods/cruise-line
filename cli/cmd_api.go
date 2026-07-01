package main

import (
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"
)

// cmdAPI implements `cruise-line api <method> <path> [--body BODY | --body-file FILE]`.
//
// Behaves like `gh api` — escape hatch for agents that want to call an
// endpoint the CLI doesn't wrap yet. Non-2xx responses print the body to
// stderr and exit non-zero, so shell scripts can branch cleanly.
func cmdAPI(args []string) error {
	fs := flag.NewFlagSet("api", flag.ContinueOnError)
	bodyStr := fs.String("body", "", "JSON body string")
	bodyFile := fs.String("body-file", "", "path to a file containing the JSON body ('-' for stdin)")
	fs.Usage = func() {
		fmt.Fprintln(os.Stderr, "usage: cruise-line api <METHOD> <path> [--body BODY | --body-file FILE]")
		fmt.Fprintln(os.Stderr, "  path is server-relative, e.g. /api/cli/me")
	}
	if err := fs.Parse(args); err != nil {
		return err
	}
	if fs.NArg() != 2 {
		fs.Usage()
		return errors.New("expected two positional arguments: <method> <path>")
	}
	method := strings.ToUpper(fs.Arg(0))
	path := fs.Arg(1)
	if *bodyStr != "" && *bodyFile != "" {
		return errors.New("--body and --body-file are mutually exclusive")
	}
	var body []byte
	if *bodyStr != "" {
		body = []byte(*bodyStr)
	} else if *bodyFile != "" {
		var err error
		if *bodyFile == "-" {
			body, err = io.ReadAll(os.Stdin)
		} else {
			body, err = os.ReadFile(*bodyFile)
		}
		if err != nil {
			return fmt.Errorf("reading body: %w", err)
		}
	}

	cfg, err := RequireLoggedIn()
	if err != nil {
		return err
	}
	client := NewClient(cfg)

	status, _, respBody, err := client.RawRequest(method, path, body)
	if err != nil {
		return err
	}
	// Write body verbatim regardless of status so callers can inspect the
	// error shape. Non-2xx exits non-zero so shell scripts branch cleanly.
	_, _ = os.Stdout.Write(respBody)
	if len(respBody) > 0 && respBody[len(respBody)-1] != '\n' {
		fmt.Println()
	}
	if status < 200 || status >= 300 {
		return fmt.Errorf("HTTP %d", status)
	}
	return nil
}

package main

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"strings"
)

func cmdLogin(args []string) error {
	fs := flag.NewFlagSet("login", flag.ContinueOnError)
	fs.Usage = func() {
		fmt.Fprintln(os.Stderr, "usage: cruise-line login <host>")
		fmt.Fprintln(os.Stderr, "  <host> — e.g. https://cruise-line.your-org.dev")
	}
	if err := fs.Parse(args); err != nil {
		return err
	}
	if fs.NArg() != 1 {
		fs.Usage()
		return errors.New("expected exactly one positional argument: <host>")
	}
	host := strings.TrimSpace(fs.Arg(0))

	res, err := RunLogin(host)
	if err != nil {
		return err
	}

	cfg := &Config{
		Host:    res.Host,
		Token:   res.Token,
		TokenID: res.TokenID,
		User:    res.User,
	}
	if err := SaveConfig(cfg); err != nil {
		return fmt.Errorf("saving config: %w", err)
	}

	if res.User != nil {
		fmt.Printf("Signed in as %s (%s)\n", res.User.Login, res.Host)
	} else {
		fmt.Printf("Signed in (%s)\n", res.Host)
	}
	return nil
}

func cmdLogout(args []string) error {
	fs := flag.NewFlagSet("logout", flag.ContinueOnError)
	if err := fs.Parse(args); err != nil {
		return err
	}

	cfg, err := LoadConfig()
	if err != nil {
		return err
	}
	if cfg.Token == "" {
		fmt.Println("Already signed out.")
		return nil
	}

	// Best-effort server-side revoke. A network failure here still clears the
	// local config so the user isn't stuck with a dangling token file.
	client := NewClient(cfg)
	if cfg.TokenID != "" {
		var out struct{}
		if err := client.PostJSON("/api/cli/token/revoke", map[string]string{"token_id": cfg.TokenID}, &out); err != nil {
			fmt.Fprintf(os.Stderr, "warning: revoke on server failed (%v); clearing local config anyway\n", err)
		}
	}
	if err := ClearConfig(); err != nil {
		return fmt.Errorf("clearing config: %w", err)
	}
	fmt.Println("Signed out.")
	return nil
}

func cmdWhoami(args []string) error {
	fs := flag.NewFlagSet("whoami", flag.ContinueOnError)
	if err := fs.Parse(args); err != nil {
		return err
	}

	cfg, err := RequireLoggedIn()
	if err != nil {
		return err
	}
	client := NewClient(cfg)

	var me struct {
		UserID    int    `json:"userId"`
		Login     string `json:"login"`
		AvatarURL string `json:"avatarUrl"`
		Role      string `json:"role"`
	}
	if err := client.GetJSON("/api/cli/me", &me); err != nil {
		return err
	}

	// Emit JSON so agents can parse without regex. Humans reading terminal
	// output can still tell what's going on at a glance.
	return jsonPrint(map[string]any{
		"host":  cfg.Host,
		"login": me.Login,
		"user_id": me.UserID,
		"role":  me.Role,
	})
}

func jsonPrint(v any) error {
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	return enc.Encode(v)
}

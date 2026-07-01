package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

// Config is the on-disk shape at $CRUISE_LINE_HOME/config.json.
//
// The token itself carries all authority — Host is stored so the CLI knows
// where to send requests after login. TokenID is kept so `logout` can revoke
// by id without the server needing to re-derive it from the plaintext.
type Config struct {
	Host    string     `json:"host,omitempty"`
	Token   string     `json:"token,omitempty"`
	TokenID string     `json:"token_id,omitempty"`
	User    *UserBlock `json:"user,omitempty"`
}

type UserBlock struct {
	UserID    int    `json:"user_id"`
	Login     string `json:"login"`
	AvatarURL string `json:"avatar_url,omitempty"`
}

// configDir returns the directory where the config file lives.
//   1. $CRUISE_LINE_HOME overrides everything (tests + power users)
//   2. $XDG_CONFIG_HOME/cruise-line if set
//   3. ~/.config/cruise-line otherwise
func configDir() (string, error) {
	if home := os.Getenv("CRUISE_LINE_HOME"); home != "" {
		return home, nil
	}
	if xdg := os.Getenv("XDG_CONFIG_HOME"); xdg != "" {
		return filepath.Join(xdg, "cruise-line"), nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolving home dir: %w", err)
	}
	return filepath.Join(home, ".config", "cruise-line"), nil
}

func configPath() (string, error) {
	dir, err := configDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "config.json"), nil
}

// LoadConfig returns the current config. A missing file yields an empty
// Config rather than an error — the caller decides whether emptiness is fatal.
func LoadConfig() (*Config, error) {
	path, err := configPath()
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return &Config{}, nil
		}
		return nil, fmt.Errorf("reading %s: %w", path, err)
	}
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parsing %s: %w", path, err)
	}
	return &cfg, nil
}

// SaveConfig writes the config file with 0600 perms so other users on the
// same machine can't read the token.
func SaveConfig(cfg *Config) error {
	path, err := configPath()
	if err != nil {
		return err
	}
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return fmt.Errorf("creating %s: %w", dir, err)
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("encoding config: %w", err)
	}
	// Write to a tempfile in the same dir and rename atomically — a crash
	// mid-write can't corrupt the on-disk config.
	tmp, err := os.CreateTemp(dir, "config-*.json")
	if err != nil {
		return fmt.Errorf("creating tempfile: %w", err)
	}
	tmpPath := tmp.Name()
	// Best-effort cleanup: if rename succeeds this is a no-op.
	defer os.Remove(tmpPath)

	if err := tmp.Chmod(0o600); err != nil {
		tmp.Close()
		return fmt.Errorf("chmod tempfile: %w", err)
	}
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return fmt.Errorf("writing tempfile: %w", err)
	}
	if err := tmp.Close(); err != nil {
		return fmt.Errorf("closing tempfile: %w", err)
	}
	if err := os.Rename(tmpPath, path); err != nil {
		return fmt.Errorf("renaming into place: %w", err)
	}
	return nil
}

// ClearConfig removes the config file. Missing file is not an error.
func ClearConfig() error {
	path, err := configPath()
	if err != nil {
		return err
	}
	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("removing %s: %w", path, err)
	}
	return nil
}

// RequireLoggedIn loads the config and returns it if a token is present,
// otherwise errors with a helpful message. Use this at the start of any
// authenticated command.
func RequireLoggedIn() (*Config, error) {
	cfg, err := LoadConfig()
	if err != nil {
		return nil, err
	}
	if cfg.Token == "" || cfg.Host == "" {
		return nil, errors.New("not logged in — run `cruise-line login <host>` first")
	}
	return cfg, nil
}

package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

// updateCheckInterval is how long to trust a cached /api/cli/latest response
// before hitting the server again. Set to 24h so the lazy check imposes at
// most one extra HTTP call per user per day.
const updateCheckInterval = 24 * time.Hour

// updateCheckTimeout bounds the sync fetch inside the lazy check. Users
// running commands offline shouldn't wait more than this before the command
// they actually asked for proceeds.
const updateCheckTimeout = 800 * time.Millisecond

type latestResponse struct {
	Version      string            `json:"version"`
	DownloadURLs map[string]string `json:"downloadUrls"`
}

// fetchLatest returns the CLI version and download URL map advertised by
// the configured host. Uses the passed-in timeout so both the fast lazy
// check and the slower upgrade path can share the code.
func fetchLatest(host string, timeout time.Duration) (*latestResponse, error) {
	client := &http.Client{Timeout: timeout}
	url := strings.TrimRight(host, "/") + "/api/cli/latest"
	res, err := client.Get(url)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %d from %s", res.StatusCode, url)
	}
	var out latestResponse
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
		return nil, fmt.Errorf("decoding /api/cli/latest: %w", err)
	}
	if out.Version == "" {
		return nil, errors.New("server returned no version")
	}
	return &out, nil
}

// maybeCheckForUpdate runs once per updateCheckInterval. It hits
// /api/cli/latest with a short timeout, updates the cached version in the
// config, and returns the fetched response. Errors are non-fatal — an
// offline user shouldn't see failures from a background check.
//
// Bootstraps cfg.InstalledVersion on the first successful check. Fresh
// installs (curl|sh) don't record a version anywhere — the binary is
// downloaded and dropped in place with no config touch. The first update
// check that succeeds is a reasonable place to assume "the current
// server version is what I was just installed as," so we adopt it. From
// then on, upgrades update InstalledVersion, and comparisons compare
// InstalledVersion to whatever /api/cli/latest currently returns.
//
// Only fires when the user has a Host in config. Pre-login users don't
// know which deployment to check against.
func maybeCheckForUpdate(cfg *Config) *latestResponse {
	if cfg == nil || cfg.Host == "" {
		return nil
	}
	if cfg.UpdateCheck != nil && cfg.UpdateCheck.LastCheckedAt != "" {
		if last, err := time.Parse(time.RFC3339, cfg.UpdateCheck.LastCheckedAt); err == nil {
			if time.Since(last) < updateCheckInterval {
				// Cache is fresh — surface the cached version rather than
				// hitting the server again.
				return &latestResponse{Version: cfg.UpdateCheck.LatestVersion}
			}
		}
	}

	latest, err := fetchLatest(cfg.Host, updateCheckTimeout)
	if err != nil {
		return nil
	}

	cfg.UpdateCheck = &UpdateCheckState{
		LastCheckedAt: time.Now().UTC().Format(time.RFC3339),
		LatestVersion: latest.Version,
	}
	// Bootstrap for freshly-installed binaries that never went through
	// `cruise-line upgrade`. Without this, the first check would see
	// InstalledVersion="" and immediately nag — annoying and wrong on
	// day 1.
	if cfg.InstalledVersion == "" {
		cfg.InstalledVersion = latest.Version
	}
	// Save is best-effort — failing to persist just means we'll check again
	// on the next command, which is harmless.
	_ = SaveConfig(cfg)
	return latest
}

// notifyIfOutdated prints a one-line upgrade notice to stderr when the
// server's version differs from what the CLI installed. Called after the
// main command completes so it never interleaves with the command's own
// output.
//
// Compares cfg.InstalledVersion (set on upgrade, bootstrapped on first
// check) against the freshly-fetched /api/cli/latest. Both come from the
// server's ASTRO_AGENT_BUILD env var, which changes exactly when a new
// deploy actually ships — no timestamp drift, no cache-invalidation
// churn.
//
// Escape hatches:
//   - CRUISE_LINE_NO_UPDATE_CHECK=1 suppresses the nag entirely, for
//     developers hacking on the CLI itself who don't want to be told
//     to `cruise-line upgrade` (which would replace their locally-
//     modified binary with a downloaded one).
//   - No cfg.InstalledVersion means the first check hasn't happened
//     yet OR the config is corrupt; silence is right — the check
//     will bootstrap on its next run.
func notifyIfOutdated(cfg *Config, latest *latestResponse) {
	if os.Getenv("CRUISE_LINE_NO_UPDATE_CHECK") != "" {
		return
	}
	if latest == nil || latest.Version == "" {
		return
	}
	if cfg == nil || cfg.InstalledVersion == "" {
		return
	}
	if cfg.InstalledVersion == latest.Version {
		return
	}
	fmt.Fprintf(os.Stderr,
		"\n(cruise-line %s is available; you're on %s. Run `cruise-line upgrade` to update.)\n",
		latest.Version, cfg.InstalledVersion,
	)
}

// cmdUpgrade implements `cruise-line upgrade`.
//
// Fetches /api/cli/latest, compares versions, downloads the platform-matched
// binary, verifies its SHA-256 against the server-published sidecar, and
// atomically renames it over the running binary. Rename works while the
// binary is executing because Unix file handles reference the inode, not
// the path.
func cmdUpgrade(args []string) error {
	fs := flag.NewFlagSet("upgrade", flag.ContinueOnError)
	force := fs.Bool("force", false, "reinstall even if the current version matches upstream")
	if err := fs.Parse(args); err != nil {
		return err
	}

	cfg, err := LoadConfig()
	if err != nil {
		return err
	}
	if cfg.Host == "" {
		return errors.New("no host configured — run `cruise-line login <host>` first")
	}

	fmt.Printf("Checking %s for updates...\n", cfg.Host)
	latest, err := fetchLatest(cfg.Host, 10*time.Second)
	if err != nil {
		return fmt.Errorf("checking for updates: %w", err)
	}

	if !*force && latest.Version == cfg.InstalledVersion {
		fmt.Printf("Already on latest version (%s)\n", cfg.InstalledVersion)
		return nil
	}

	target := fmt.Sprintf("%s-%s", runtime.GOOS, runtime.GOARCH)
	url, ok := latest.DownloadURLs[target]
	if !ok {
		return fmt.Errorf("no binary available for %s", target)
	}

	fmt.Printf("Downloading %s...\n", url)
	binPath, err := downloadBinaryWithVerify(url)
	if err != nil {
		return err
	}
	defer os.Remove(binPath)

	self, err := os.Executable()
	if err != nil {
		return fmt.Errorf("locating current binary: %w", err)
	}
	// Resolve symlinks so we replace the real file, not a Homebrew-style
	// symlink into /usr/local/Cellar/... etc.
	resolvedSelf, err := filepath.EvalSymlinks(self)
	if err == nil {
		self = resolvedSelf
	}

	if err := os.Chmod(binPath, 0o755); err != nil {
		return fmt.Errorf("chmod new binary: %w", err)
	}
	if err := os.Rename(binPath, self); err != nil {
		return fmt.Errorf("replacing %s: %w (try running with sudo if the file is owned by root)", self, err)
	}

	// Record what we just installed so subsequent update checks can
	// compare against it. This is the ONLY source of truth for "what
	// version is the running binary"; nothing is baked into the file
	// itself.
	cfg.InstalledVersion = latest.Version
	if err := SaveConfig(cfg); err != nil {
		// The binary is already swapped; a config-write failure isn't
		// worth rolling back, but do surface it so the user knows the
		// next update check won't know they upgraded.
		fmt.Fprintf(os.Stderr, "warning: upgrade succeeded but couldn't persist installed version: %v\n", err)
	}

	fmt.Printf("Upgraded to %s\n", latest.Version)
	return nil
}

// downloadBinaryWithVerify downloads url + url.sha256 in parallel and
// verifies the binary matches. Returns the path to a tempfile the caller is
// responsible for removing (or renaming). Non-2xx responses on either URL
// abort the upgrade before any file is written.
func downloadBinaryWithVerify(url string) (string, error) {
	client := &http.Client{Timeout: 60 * time.Second}

	// Fetch expected checksum first — a bad sha URL should abort before we
	// spend time streaming the binary.
	shaRes, err := client.Get(url + ".sha256")
	if err != nil {
		return "", fmt.Errorf("fetching checksum: %w", err)
	}
	defer shaRes.Body.Close()
	if shaRes.StatusCode != http.StatusOK {
		return "", fmt.Errorf("checksum HTTP %d", shaRes.StatusCode)
	}
	expectedBytes, err := io.ReadAll(shaRes.Body)
	if err != nil {
		return "", fmt.Errorf("reading checksum: %w", err)
	}
	expected := strings.TrimSpace(string(expectedBytes))
	if len(expected) != 64 {
		return "", fmt.Errorf("checksum sidecar returned %d chars, expected 64 hex", len(expected))
	}

	// Now stream the binary through sha256 as we write it, so a bad file
	// gets caught without a second read pass.
	binRes, err := client.Get(url)
	if err != nil {
		return "", fmt.Errorf("fetching binary: %w", err)
	}
	defer binRes.Body.Close()
	if binRes.StatusCode != http.StatusOK {
		return "", fmt.Errorf("binary HTTP %d", binRes.StatusCode)
	}

	tmp, err := os.CreateTemp("", "cruise-line-*")
	if err != nil {
		return "", fmt.Errorf("creating tempfile: %w", err)
	}
	tmpPath := tmp.Name()

	h := sha256.New()
	writer := io.MultiWriter(tmp, h)
	if _, err := io.Copy(writer, binRes.Body); err != nil {
		tmp.Close()
		os.Remove(tmpPath)
		return "", fmt.Errorf("downloading binary: %w", err)
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpPath)
		return "", fmt.Errorf("closing tempfile: %w", err)
	}

	actual := hex.EncodeToString(h.Sum(nil))
	if actual != expected {
		os.Remove(tmpPath)
		return "", fmt.Errorf("checksum mismatch: expected %s, got %s", expected, actual)
	}
	return tmpPath, nil
}

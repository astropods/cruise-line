package main

import "testing"

func TestParsePRRef(t *testing.T) {
	t.Run("happy path", func(t *testing.T) {
		got, err := parsePRRef("astropods/cruise-line#42")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got.Owner != "astropods" || got.Repo != "cruise-line" || got.Number != 42 {
			t.Fatalf("wrong parse: %+v", got)
		}
	})

	t.Run("owner and repo with hyphens", func(t *testing.T) {
		got, err := parsePRRef("my-org/my-repo#1")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got.Owner != "my-org" || got.Repo != "my-repo" {
			t.Fatalf("wrong parse: %+v", got)
		}
	})

	t.Run("missing hash separator", func(t *testing.T) {
		if _, err := parsePRRef("astropods/cruise-line"); err == nil {
			t.Fatal("expected error for missing #N")
		}
	})

	t.Run("missing slash", func(t *testing.T) {
		if _, err := parsePRRef("cruise-line#42"); err == nil {
			t.Fatal("expected error for missing owner/")
		}
	})

	t.Run("empty owner", func(t *testing.T) {
		if _, err := parsePRRef("/cruise-line#42"); err == nil {
			t.Fatal("expected error for empty owner")
		}
	})

	t.Run("empty repo", func(t *testing.T) {
		if _, err := parsePRRef("astropods/#42"); err == nil {
			t.Fatal("expected error for empty repo")
		}
	})

	t.Run("non-numeric PR number", func(t *testing.T) {
		if _, err := parsePRRef("astropods/cruise-line#abc"); err == nil {
			t.Fatal("expected error for non-numeric PR")
		}
	})

	t.Run("zero PR number", func(t *testing.T) {
		if _, err := parsePRRef("astropods/cruise-line#0"); err == nil {
			t.Fatal("expected error for PR #0")
		}
	})

	t.Run("negative PR number", func(t *testing.T) {
		if _, err := parsePRRef("astropods/cruise-line#-1"); err == nil {
			t.Fatal("expected error for negative PR")
		}
	})
}

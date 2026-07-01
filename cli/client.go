package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// Client is a minimal HTTP wrapper that attaches the CLI bearer token to
// every request and decodes JSON error bodies into a useful message.
type Client struct {
	Host  string
	Token string
	http  *http.Client
}

func NewClient(cfg *Config) *Client {
	return &Client{
		Host:  cfg.Host,
		Token: cfg.Token,
		http:  &http.Client{Timeout: 30 * time.Second},
	}
}

// requestOptions carries per-call knobs that we didn't want to duplicate as
// method variants. Timeout=0 means "use the client default."
type requestOptions struct {
	Timeout time.Duration
	Body    []byte
	Header  http.Header
}

func (c *Client) do(method, path string, opts requestOptions) (*http.Response, error) {
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	var body io.Reader
	if opts.Body != nil {
		body = bytes.NewReader(opts.Body)
	}
	req, err := http.NewRequest(method, c.Host+path, body)
	if err != nil {
		return nil, err
	}
	if c.Token != "" {
		req.Header.Set("Authorization", "Bearer "+c.Token)
	}
	if opts.Body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	for k, vs := range opts.Header {
		for _, v := range vs {
			req.Header.Add(k, v)
		}
	}

	client := c.http
	if opts.Timeout > 0 {
		// A one-off timeout — clone the client rather than mutate it.
		clientCopy := *c.http
		clientCopy.Timeout = opts.Timeout
		client = &clientCopy
	}
	return client.Do(req)
}

// GetJSON does a GET and decodes the response body into out.
func (c *Client) GetJSON(path string, out any) error {
	res, err := c.do("GET", path, requestOptions{})
	if err != nil {
		return err
	}
	defer res.Body.Close()
	return decodeOrError(res, out)
}

// PostJSON does a POST with a JSON body and decodes the response.
func (c *Client) PostJSON(path string, in any, out any) error {
	body, err := json.Marshal(in)
	if err != nil {
		return fmt.Errorf("encoding request body: %w", err)
	}
	res, err := c.do("POST", path, requestOptions{Body: body})
	if err != nil {
		return err
	}
	defer res.Body.Close()
	return decodeOrError(res, out)
}

// RawRequest is used by the `api` command. Returns method+path+body straight
// through, no envelope. Uses the Bearer token if one is configured.
func (c *Client) RawRequest(method, path string, body []byte) (int, http.Header, []byte, error) {
	res, err := c.do(method, path, requestOptions{Body: body})
	if err != nil {
		return 0, nil, nil, err
	}
	defer res.Body.Close()
	data, err := io.ReadAll(res.Body)
	if err != nil {
		return res.StatusCode, res.Header, nil, err
	}
	return res.StatusCode, res.Header, data, nil
}

type apiError struct {
	Message string
	Status  int
}

func (e *apiError) Error() string {
	return fmt.Sprintf("HTTP %d: %s", e.Status, e.Message)
}

// decodeOrError turns a non-2xx response into a friendly error message that
// preserves the server's `error` field when present. Successful responses
// are decoded into out (which may be nil to skip decoding).
func decodeOrError(res *http.Response, out any) error {
	if res.StatusCode >= 200 && res.StatusCode < 300 {
		if out == nil {
			return nil
		}
		return json.NewDecoder(res.Body).Decode(out)
	}
	data, _ := io.ReadAll(res.Body)
	var body struct {
		Error string `json:"error"`
	}
	_ = json.Unmarshal(data, &body)
	msg := body.Error
	if msg == "" {
		msg = strings.TrimSpace(string(data))
		if msg == "" {
			msg = res.Status
		}
	}
	return &apiError{Message: msg, Status: res.StatusCode}
}

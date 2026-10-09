package services

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"
)

var (
	ErrInvalidCredentials = errors.New("invalid password")
	ErrInvalidToken       = errors.New("invalid or expired token")
	ErrRateLimited        = errors.New("too many attempts, try again later")
)

type AuthService struct {
	password string
	secret   []byte
	ttl      time.Duration

	mu       sync.Mutex
	attempts map[string][]time.Time // ip -> attempt timestamps
}

func NewAuthService(password, secret string, ttl time.Duration) *AuthService {
	return &AuthService{
		password: password,
		secret:   []byte(secret),
		ttl:      ttl,
		attempts: map[string][]time.Time{},
	}
}

// Login validates the password and returns a signed token.
func (a *AuthService) Login(ip, password string) (string, time.Time, error) {
	if !a.allowAttempt(ip) {
		return "", time.Time{}, ErrRateLimited
	}
	a.recordAttempt(ip)

	// Constant-time compare to avoid timing leaks
	if subtle.ConstantTimeCompare([]byte(password), []byte(a.password)) != 1 {
		return "", time.Time{}, ErrInvalidCredentials
	}

	expires := time.Now().UTC().Add(a.ttl)
	token := a.sign(expires.Unix())
	return token, expires, nil
}

// Verify checks the token signature and expiry.
func (a *AuthService) Verify(token string) error {
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return ErrInvalidToken
	}
	expUnix, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return ErrInvalidToken
	}
	if time.Now().UTC().Unix() > expUnix {
		return ErrInvalidToken
	}
	expected := a.sign(expUnix)
	if subtle.ConstantTimeCompare([]byte(expected), []byte(token)) != 1 {
		return ErrInvalidToken
	}
	return nil
}

func (a *AuthService) sign(expUnix int64) string {
	mac := hmac.New(sha256.New, a.secret)
	fmt.Fprintf(mac, "%d", expUnix)
	sum := mac.Sum(nil)
	return strconv.FormatInt(expUnix, 10) + "." + hex.EncodeToString(sum)
}

// --- very small in-memory rate limiter: max 10 attempts per 15 minutes per IP ---

const (
	rateWindow   = 15 * time.Minute
	rateMaxCalls = 10
)

func (a *AuthService) allowAttempt(ip string) bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	cutoff := time.Now().Add(-rateWindow)
	kept := a.attempts[ip][:0]
	for _, t := range a.attempts[ip] {
		if t.After(cutoff) {
			kept = append(kept, t)
		}
	}
	a.attempts[ip] = kept
	return len(kept) < rateMaxCalls
}

func (a *AuthService) recordAttempt(ip string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.attempts[ip] = append(a.attempts[ip], time.Now())
}

// helper used by tests
func b64(s string) string { return base64.StdEncoding.EncodeToString([]byte(s)) }

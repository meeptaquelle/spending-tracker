package services

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"time"
)

func NewID() string {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		// crypto/rand failing is unrecoverable in practice; fall back to nanos.
		return time.Now().UTC().Format("20060102150405.000000000") + "-fallback"
	}
	return time.Now().UTC().Format("20060102150405") + "-" + hex.EncodeToString(b)
}

func NowISO() string {
	return time.Now().UTC().Format(time.RFC3339)
}

var ErrNotFound = errors.New("not found")

package services

import (
	"errors"
	"time"
)

func NewID() string {
	return time.Now().UTC().Format("20060102150405") + "-" + randHex(8)
}

func NowISO() string {
	return time.Now().UTC().Format(time.RFC3339)
}

func randHex(n int) string {
	const hex = "0123456789abcdef"
	b := make([]byte, n)
	for i := range b {
		b[i] = hex[time.Now().UnixNano()%int64(len(hex))]
		time.Sleep(time.Nanosecond)
	}
	return string(b)
}

var ErrNotFound = errors.New("not found")

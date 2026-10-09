package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Port            string
	SpreadsheetID   string
	CredentialsPath string
	AllowedOrigins  []string
	RequestTimeout  time.Duration

	AuthPassword string
	AuthSecret   string
	AuthTTL      time.Duration
}

func Load() (*Config, error) {
	loadDotEnv(".env")

	cfg := &Config{
		Port:            getEnv("PORT", "8080"),
		SpreadsheetID:   os.Getenv("SPREADSHEET_ID"),
		CredentialsPath: getEnv("GOOGLE_APPLICATION_CREDENTIALS", "./service-account.json"),
		AuthPassword:    os.Getenv("AUTH_PASSWORD"),
		AuthSecret:      os.Getenv("AUTH_SECRET"),
	}
	if cfg.SpreadsheetID == "" {
		return nil, fmt.Errorf("SPREADSHEET_ID is required")
	}
	if cfg.AuthPassword == "" {
		return nil, fmt.Errorf("AUTH_PASSWORD is required")
	}
	if len(cfg.AuthSecret) < 16 {
		return nil, fmt.Errorf("AUTH_SECRET must be at least 16 chars (32+ recommended)")
	}

	for _, o := range strings.Split(getEnv("ALLOWED_ORIGINS", "http://localhost:3000"), ",") {
		o = strings.TrimSpace(o)
		if o != "" {
			cfg.AllowedOrigins = append(cfg.AllowedOrigins, o)
		}
	}

	sec, err := strconv.Atoi(getEnv("REQUEST_TIMEOUT_SECONDS", "15"))
	if err != nil || sec <= 0 {
		sec = 15
	}
	cfg.RequestTimeout = time.Duration(sec) * time.Second

	ttlHours, err := strconv.Atoi(getEnv("AUTH_TTL_HOURS", "720"))
	if err != nil || ttlHours <= 0 {
		ttlHours = 720
	}
	cfg.AuthTTL = time.Duration(ttlHours) * time.Hour

	return cfg, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func loadDotEnv(path string) {
	data, err := os.ReadFile(path)
	if err != nil {
		return
	}
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue
		}
		key := strings.TrimSpace(parts[0])
		val := strings.Trim(strings.TrimSpace(parts[1]), `"'`)
		if os.Getenv(key) == "" {
			os.Setenv(key, val)
		}
	}
}
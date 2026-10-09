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
}

func Load() (*Config, error) {
	loadDotEnv(".env")

	cfg := &Config{
		Port:            getEnv("PORT", "8080"),
		SpreadsheetID:   os.Getenv("SPREADSHEET_ID"),
		CredentialsPath: getEnv("GOOGLE_APPLICATION_CREDENTIALS", "./service-account.json"),
	}
	if cfg.SpreadsheetID == "" {
		return nil, fmt.Errorf("SPREADSHEET_ID is required")
	}

	for _, o := range strings.Split(getEnv("ALLOWED_ORIGINS", "http://localhost:5500"), ",") {
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
	return cfg, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// loadDotEnv parses a minimal .env file. Existing env vars take precedence.
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

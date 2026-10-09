package handlers

import (
	"errors"
	"net"
	"net/http"
	"strings"

	"github.com/meeptaquelle/spending-tracker/backend/services"
)

type AuthHandler struct {
	svc *services.AuthService
}

func NewAuthHandler(svc *services.AuthService) *AuthHandler {
	return &AuthHandler{svc: svc}
}

type loginReq struct {
	Password string `json:"password"`
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req loginReq
	if err := decode(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_JSON", err.Error(), "")
		return
	}

	ip := clientIP(r)
	token, expires, err := h.svc.Login(ip, req.Password)
	switch {
	case errors.Is(err, services.ErrRateLimited):
		writeError(w, http.StatusTooManyRequests, "RATE_LIMITED", "too many attempts, try again later", "")
		return
	case errors.Is(err, services.ErrInvalidCredentials):
		writeError(w, http.StatusUnauthorized, "INVALID_CREDENTIALS", "wrong password", "")
		return
	case err != nil:
		writeError(w, http.StatusInternalServerError, "INTERNAL", err.Error(), "")
		return
	}
	writeData(w, http.StatusOK, map[string]any{
		"token":      token,
		"expires_at": expires.Format("2006-01-02T15:04:05Z07:00"),
	})
}

// RequireAuth is a middleware. Wrap any handler you want protected.
func RequireAuth(svc *services.AuthService, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := bearerToken(r)
		if token == "" {
			writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing token", "")
			return
		}
		if err := svc.Verify(token); err != nil {
			writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid or expired token", "")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func bearerToken(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if h == "" {
		return ""
	}
	parts := strings.SplitN(h, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return ""
	}
	return strings.TrimSpace(parts[1])
}

func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		// first entry is the original client
		parts := strings.Split(xff, ",")
		return strings.TrimSpace(parts[0])
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

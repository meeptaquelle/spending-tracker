package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/meeptaquelle/spending-tracker/backend/config"
	"github.com/meeptaquelle/spending-tracker/backend/handlers"
	"github.com/meeptaquelle/spending-tracker/backend/services"
	"github.com/meeptaquelle/spending-tracker/backend/storage"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	store, err := storage.NewGoogleSheetsStore(ctx, cfg.SpreadsheetID, cfg.CredentialsPath)
	if err != nil {
		log.Fatalf("storage: %v", err)
	}

	authSvc := services.NewAuthService(cfg.AuthPassword, cfg.AuthSecret, cfg.AuthTTL)
	authH := handlers.NewAuthHandler(authSvc)

	txSvc := services.NewTransactionService(store)
	txH := handlers.NewTransactionHandler(txSvc)
	catH := handlers.NewCategoryHandler(store)
	setH := handlers.NewSettingsHandler(store)

	// --- public routes (no auth) ---
	public := http.NewServeMux()

	// --- protected routes ---
	protected := http.NewServeMux()
	protected.HandleFunc("GET /api/transactions", txH.List)
	protected.HandleFunc("GET /api/transactions/{id}", txH.Get)
	protected.HandleFunc("POST /api/transactions", txH.Create)
	protected.HandleFunc("PUT /api/transactions/{id}", txH.Update)
	protected.HandleFunc("DELETE /api/transactions/{id}", txH.Delete)
	protected.HandleFunc("POST /api/transactions/{id}/complete", txH.Complete)
	protected.HandleFunc("GET /api/categories", catH.List)
	protected.HandleFunc("POST /api/categories", catH.Create)
	protected.HandleFunc("PUT /api/categories/{id}", catH.Update)
	protected.HandleFunc("POST /api/categories/{id}/archive", catH.Archive)
	protected.HandleFunc("GET /api/settings", setH.Get)
	protected.HandleFunc("PUT /api/settings", setH.Put)

	// combine: try protected first (which enforces auth), fall back to public
	root := http.NewServeMux()
	root.HandleFunc("GET /api/health", handlers.Health)
	root.HandleFunc("POST /api/auth/login", authH.Login)
	root.Handle("/api/", handlers.RequireAuth(authSvc, protected))
	root.Handle("/", public)

	var handler http.Handler = root
	handler = withTimeout(handler, cfg.RequestTimeout)
	handler = withLogging(handler)
	handler = withCORS(handler, cfg.AllowedOrigins)

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	go func() {
		log.Printf("listening on %s", srv.Addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("server: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("shutdown: %v", err)
	}
}

func withCORS(next http.Handler, allowed []string) http.Handler {
	set := map[string]bool{}
	for _, o := range allowed {
		set[o] = true
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && set[origin] {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			w.Header().Set("Access-Control-Max-Age", "86400")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func withTimeout(next http.Handler, d time.Duration) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), d)
		defer cancel()
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func withLogging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s %s", r.Method, r.URL.Path, time.Since(start))
	})
}

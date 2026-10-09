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

	"github.com/joho/godotenv"
	"github.com/meeptaquelle/spending-tracker/backend/config"
	"github.com/meeptaquelle/spending-tracker/backend/handlers"
	"github.com/meeptaquelle/spending-tracker/backend/services"
	"github.com/meeptaquelle/spending-tracker/backend/storage"
)

func main() {
	if err := godotenv.Load(); err != nil {
		log.Printf("Warning: .env file not loaded: %v", err)
	}
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

	txSvc := services.NewTransactionService(store)
	txH := handlers.NewTransactionHandler(txSvc)
	catH := handlers.NewCategoryHandler(store)
	setH := handlers.NewSettingsHandler(store)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", handlers.Health)
	mux.HandleFunc("GET /api/transactions", txH.List)
	mux.HandleFunc("GET /api/transactions/{id}", txH.Get)
	mux.HandleFunc("POST /api/transactions", txH.Create)
	mux.HandleFunc("PUT /api/transactions/{id}", txH.Update)
	mux.HandleFunc("DELETE /api/transactions/{id}", txH.Delete)
	mux.HandleFunc("POST /api/transactions/{id}/complete", txH.Complete)
	mux.HandleFunc("GET /api/categories", catH.List)
	mux.HandleFunc("POST /api/categories", catH.Create)
	mux.HandleFunc("PUT /api/categories/{id}", catH.Update)
	mux.HandleFunc("POST /api/categories/{id}/archive", catH.Archive)
	mux.HandleFunc("GET /api/settings", setH.Get)
	mux.HandleFunc("PUT /api/settings", setH.Put)

	var handler http.Handler = mux
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
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
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

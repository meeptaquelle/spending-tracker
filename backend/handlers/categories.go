package handlers

import (
	"errors"
	"net/http"
	"time"

	"github.com/meeptaquelle/spending-tracker/backend/models"
	"github.com/meeptaquelle/spending-tracker/backend/services"
	"github.com/meeptaquelle/spending-tracker/backend/storage"
)

type CategoryHandler struct {
	store storage.Store
}

func NewCategoryHandler(store storage.Store) *CategoryHandler {
	return &CategoryHandler{store: store}
}

func (h *CategoryHandler) List(w http.ResponseWriter, r *http.Request) {
	includeArchived := r.URL.Query().Get("include_archived") == "true"
	cats, err := h.store.ListCategories(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", err.Error(), "")
		return
	}
	if !includeArchived {
		out := cats[:0]
		for _, c := range cats {
			if !c.IsArchived {
				out = append(out, c)
			}
		}
		cats = out
	}
	writeData(w, http.StatusOK, cats)
}

func (h *CategoryHandler) Create(w http.ResponseWriter, r *http.Request) {
	var in models.Category
	if err := decode(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_JSON", err.Error(), "")
		return
	}
	if err := in.Validate(); err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION_ERROR", err.Error(), "")
		return
	}
	in.ID = services.NewID()
	in.CreatedAt = services.NowISO()
	in.UpdatedAt = in.CreatedAt
	in.IsArchived = false

	// uniqueness (case-insensitive)
	existing, _ := h.store.ListCategories(r.Context())
	for _, c := range existing {
		if equalFoldTrim(c.Name, in.Name) {
			writeError(w, http.StatusConflict, "DUPLICATE", "category name already exists", "name")
			return
		}
	}

	if err := h.store.CreateCategory(r.Context(), in); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", err.Error(), "")
		return
	}
	writeData(w, http.StatusCreated, in)
}

func (h *CategoryHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var in models.Category
	if err := decode(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_JSON", err.Error(), "")
		return
	}
	existing, err := h.store.GetCategory(r.Context(), id)
	if err != nil {
		if errors.Is(err, storage.ErrNotFound) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "category not found", "")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL", err.Error(), "")
		return
	}
	in.ID = id
	in.CreatedAt = existing.CreatedAt
	in.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	in.IsArchived = existing.IsArchived

	if err := in.Validate(); err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION_ERROR", err.Error(), "")
		return
	}

	// uniqueness check
	all, _ := h.store.ListCategories(r.Context())
	for _, c := range all {
		if c.ID != id && equalFoldTrim(c.Name, in.Name) {
			writeError(w, http.StatusConflict, "DUPLICATE", "category name already exists", "name")
			return
		}
	}

	if err := h.store.UpdateCategory(r.Context(), in); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", err.Error(), "")
		return
	}
	writeData(w, http.StatusOK, in)
}

func (h *CategoryHandler) Archive(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	c, err := h.store.GetCategory(r.Context(), id)
	if err != nil {
		if errors.Is(err, storage.ErrNotFound) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "category not found", "")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL", err.Error(), "")
		return
	}
	c.IsArchived = true
	c.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	if err := h.store.UpdateCategory(r.Context(), *c); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", err.Error(), "")
		return
	}
	writeData(w, http.StatusOK, c)
}

func equalFoldTrim(a, b string) bool {
	return trimLower(a) == trimLower(b)
}

func trimLower(s string) string {
	// small helper to avoid importing strings twice
	b := []byte(s)
	// trim ASCII spaces
	start, end := 0, len(b)
	for start < end && (b[start] == ' ' || b[start] == '\t') {
		start++
	}
	for end > start && (b[end-1] == ' ' || b[end-1] == '\t') {
		end--
	}
	out := make([]byte, 0, end-start)
	for _, c := range b[start:end] {
		if c >= 'A' && c <= 'Z' {
			c += 'a' - 'A'
		}
		out = append(out, c)
	}
	return string(out)
}

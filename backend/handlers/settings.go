package handlers

import (
	"net/http"

	"github.com/meeptaquelle/spending-tracker/backend/storage"
)

type SettingsHandler struct {
	store storage.Store
}

func NewSettingsHandler(store storage.Store) *SettingsHandler {
	return &SettingsHandler{store: store}
}

func (h *SettingsHandler) Get(w http.ResponseWriter, r *http.Request) {
	kv, err := h.store.GetSettings(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", err.Error(), "")
		return
	}
	writeData(w, http.StatusOK, kv)
}

func (h *SettingsHandler) Put(w http.ResponseWriter, r *http.Request) {
	var in map[string]string
	if err := decode(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_JSON", err.Error(), "")
		return
	}
	if err := h.store.PutSettings(r.Context(), in); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", err.Error(), "")
		return
	}
	kv, _ := h.store.GetSettings(r.Context())
	writeData(w, http.StatusOK, kv)
}

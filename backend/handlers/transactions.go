package handlers

import (
	"errors"
	"net/http"
	"strings"

	"github.com/meeptaquelle/spending-tracker/backend/models"
	"github.com/meeptaquelle/spending-tracker/backend/services"
	"github.com/meeptaquelle/spending-tracker/backend/storage"
)

type TransactionHandler struct {
	svc *services.TransactionService
}

func NewTransactionHandler(svc *services.TransactionService) *TransactionHandler {
	return &TransactionHandler{svc: svc}
}

func (h *TransactionHandler) List(w http.ResponseWriter, r *http.Request) {
	txs, err := h.svc.List(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", err.Error(), "")
		return
	}

	month := r.URL.Query().Get("month")
	if month != "" {
		filtered := txs[:0]
		for _, t := range txs {
			d := t.Date
			if t.Status == models.StatusPlanned && t.PlannedDate != "" {
				d = t.PlannedDate
			}
			if strings.HasPrefix(d, month) {
				filtered = append(filtered, t)
			}
		}
		txs = filtered
	}
	writeData(w, http.StatusOK, txs)
}

func (h *TransactionHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	t, err := h.svc.Get(r.Context(), id)
	if err != nil {
		if errors.Is(err, storage.ErrNotFound) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "transaction not found", "")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL", err.Error(), "")
		return
	}
	writeData(w, http.StatusOK, t)
}

func (h *TransactionHandler) Create(w http.ResponseWriter, r *http.Request) {
	var in models.Transaction
	if err := decode(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_JSON", err.Error(), "")
		return
	}
	out, err := h.svc.Create(r.Context(), in)
	if err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION_ERROR", err.Error(), "")
		return
	}
	writeData(w, http.StatusCreated, out)
}

func (h *TransactionHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var in models.Transaction
	if err := decode(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_JSON", err.Error(), "")
		return
	}
	out, err := h.svc.Update(r.Context(), id, in)
	if err != nil {
		if errors.Is(err, storage.ErrNotFound) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "transaction not found", "")
			return
		}
		writeError(w, http.StatusBadRequest, "VALIDATION_ERROR", err.Error(), "")
		return
	}
	writeData(w, http.StatusOK, out)
}

func (h *TransactionHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := h.svc.Delete(r.Context(), id); err != nil {
		if errors.Is(err, storage.ErrNotFound) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "transaction not found", "")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL", err.Error(), "")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type completeReq struct {
	ActualDate string `json:"actual_date"`
	Amount     *int64 `json:"amount,omitempty"`
}

func (h *TransactionHandler) Complete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var req completeReq
	if err := decode(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_JSON", err.Error(), "")
		return
	}
	out, err := h.svc.Complete(r.Context(), id, req.ActualDate, req.Amount)
	if err != nil {
		if errors.Is(err, storage.ErrNotFound) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "transaction not found", "")
			return
		}
		writeError(w, http.StatusBadRequest, "VALIDATION_ERROR", err.Error(), "")
		return
	}
	writeData(w, http.StatusOK, out)
}

package handlers

import (
	"encoding/json"
	"net/http"
)

type errBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Field   string `json:"field,omitempty"`
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeData(w http.ResponseWriter, status int, v any) {
	writeJSON(w, status, map[string]any{"data": v})
}

func writeError(w http.ResponseWriter, status int, code, msg, field string) {
	writeJSON(w, status, map[string]any{"error": errBody{Code: code, Message: msg, Field: field}})
}

func decode(r *http.Request, v any) error {
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	return dec.Decode(v)
}

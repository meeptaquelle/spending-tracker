package handlers

import "net/http"

func Health(w http.ResponseWriter, r *http.Request) {
	writeData(w, http.StatusOK, map[string]string{"status": "ok"})
}

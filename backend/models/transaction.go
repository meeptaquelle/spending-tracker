package models

import (
	"errors"
	"fmt"
	"strings"
	"time"
)

type TransactionType string
type TransactionStatus string

const (
	TypeIncome  TransactionType = "income"
	TypeExpense TransactionType = "expense"

	StatusCompleted TransactionStatus = "completed"
	StatusPlanned   TransactionStatus = "planned"
)

type Transaction struct {
	ID          string            `json:"id"`
	Description string            `json:"description"`
	Type        TransactionType   `json:"type"`
	Amount      int64             `json:"amount"`
	Status      TransactionStatus `json:"status"`
	Date        string            `json:"date"`
	PlannedDate string            `json:"planned_date,omitempty"`
	ActualDate  string            `json:"actual_date,omitempty"`
	CategoryID  string            `json:"category_id,omitempty"`
	Notes       string            `json:"notes,omitempty"`
	CreatedAt   string            `json:"created_at"`
	UpdatedAt   string            `json:"updated_at"`
}

func (t *Transaction) Validate() error {
	t.Description = strings.TrimSpace(t.Description)
	if t.Description == "" {
		return errors.New("description is required")
	}
	if len(t.Description) > 200 {
		return errors.New("description too long (max 200)")
	}
	if t.Type != TypeIncome && t.Type != TypeExpense {
		return fmt.Errorf("invalid type: %s", t.Type)
	}
	if t.Status != StatusCompleted && t.Status != StatusPlanned {
		return fmt.Errorf("invalid status: %s", t.Status)
	}
	if t.Type == TypeIncome && t.Status != StatusCompleted {
		return errors.New("income transactions must be completed")
	}
	if t.Amount <= 0 {
		return errors.New("amount must be greater than zero")
	}
	if t.Date != "" && !isValidDate(t.Date) {
		return fmt.Errorf("invalid date: %s (expected YYYY-MM-DD)", t.Date)
	}
	if t.PlannedDate != "" && !isValidDate(t.PlannedDate) {
		return fmt.Errorf("invalid planned_date: %s", t.PlannedDate)
	}
	if t.ActualDate != "" && !isValidDate(t.ActualDate) {
		return fmt.Errorf("invalid actual_date: %s", t.ActualDate)
	}
	if t.Status == StatusPlanned && t.PlannedDate == "" {
		return errors.New("planned transaction requires planned_date")
	}
	if t.Status == StatusCompleted && t.Date == "" {
		return errors.New("completed transaction requires date")
	}
	return nil
}

func isValidDate(s string) bool {
	if len(s) != 10 {
		return false
	}
	_, err := time.Parse("2006-01-02", s)
	return err == nil
}

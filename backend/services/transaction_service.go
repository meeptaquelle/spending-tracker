package services

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/meeptaquelle/spending-tracker/backend/models"
	"github.com/meeptaquelle/spending-tracker/backend/storage"
)

type TransactionService struct {
	store storage.Store
}

func NewTransactionService(store storage.Store) *TransactionService {
	return &TransactionService{store: store}
}

func (s *TransactionService) List(ctx context.Context) ([]models.Transaction, error) {
	return s.store.ListTransactions(ctx)
}

func (s *TransactionService) Get(ctx context.Context, id string) (*models.Transaction, error) {
	return s.store.GetTransaction(ctx, id)
}

func (s *TransactionService) Create(ctx context.Context, t models.Transaction) (*models.Transaction, error) {
	t.ID = NewID()
	t.CreatedAt = NowISO()
	t.UpdatedAt = t.CreatedAt

	// Normalize date semantics
	if t.Status == models.StatusPlanned {
		if t.PlannedDate == "" {
			t.PlannedDate = t.Date
		}
		if t.Date == "" {
			t.Date = t.PlannedDate
		}
	} else {
		if t.Date == "" {
			t.Date = t.ActualDate
		}
		if t.ActualDate == "" {
			t.ActualDate = t.Date
		}
	}

	if err := t.Validate(); err != nil {
		return nil, err
	}
	if err := s.store.CreateTransaction(ctx, t); err != nil {
		return nil, err
	}
	return &t, nil
}

func (s *TransactionService) Update(ctx context.Context, id string, in models.Transaction) (*models.Transaction, error) {
	existing, err := s.store.GetTransaction(ctx, id)
	if err != nil {
		return nil, err
	}
	in.ID = id
	in.CreatedAt = existing.CreatedAt
	in.UpdatedAt = NowISO()

	// Same normalization as create
	if in.Status == models.StatusPlanned {
		if in.PlannedDate == "" {
			in.PlannedDate = in.Date
		}
		if in.Date == "" {
			in.Date = in.PlannedDate
		}
	} else {
		if in.Date == "" {
			in.Date = in.ActualDate
		}
		if in.ActualDate == "" {
			in.ActualDate = in.Date
		}
	}

	if err := in.Validate(); err != nil {
		return nil, err
	}
	if err := s.store.UpdateTransaction(ctx, in); err != nil {
		return nil, err
	}
	return &in, nil
}

// Complete transitions a planned expense to completed, preserving ID and planned_date.
func (s *TransactionService) Complete(ctx context.Context, id, actualDate string, amount *int64) (*models.Transaction, error) {
	t, err := s.store.GetTransaction(ctx, id)
	if err != nil {
		return nil, err
	}
	if t.Status != models.StatusPlanned {
		return nil, fmt.Errorf("transaction %s is not planned", id)
	}
	if t.Type != models.TypeExpense {
		return nil, fmt.Errorf("only planned expenses can be completed")
	}
	if actualDate == "" {
		actualDate = strings.TrimSpace(actualDate)
	}
	if actualDate == "" {
		return nil, errors.New("actual_date is required")
	}

	t.Status = models.StatusCompleted
	t.ActualDate = actualDate
	t.Date = actualDate
	if amount != nil {
		if *amount <= 0 {
			return nil, errors.New("amount must be greater than zero")
		}
		t.Amount = *amount
	}
	t.UpdatedAt = NowISO()

	if err := t.Validate(); err != nil {
		return nil, err
	}
	if err := s.store.UpdateTransaction(ctx, *t); err != nil {
		return nil, err
	}
	return t, nil
}

func (s *TransactionService) Delete(ctx context.Context, id string) error {
	return s.store.DeleteTransaction(ctx, id)
}

package storage

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"google.golang.org/api/option"
	"google.golang.org/api/sheets/v4"

	"github.com/meeptaquelle/spending-tracker/backend/models"
)

var ErrNotFound = errors.New("not found")

const (
	tabTransactions = "Transactions"
	tabCategories   = "Categories"
	tabSettings     = "Settings"
)

type Store interface {
	ListTransactions(ctx context.Context) ([]models.Transaction, error)
	GetTransaction(ctx context.Context, id string) (*models.Transaction, error)
	CreateTransaction(ctx context.Context, t models.Transaction) error
	UpdateTransaction(ctx context.Context, t models.Transaction) error
	DeleteTransaction(ctx context.Context, id string) error

	ListCategories(ctx context.Context) ([]models.Category, error)
	GetCategory(ctx context.Context, id string) (*models.Category, error)
	CreateCategory(ctx context.Context, c models.Category) error
	UpdateCategory(ctx context.Context, c models.Category) error

	GetSettings(ctx context.Context) (map[string]string, error)
	PutSettings(ctx context.Context, kv map[string]string) error
}

type GoogleSheetsStore struct {
	svc           *sheets.Service
	spreadsheetID string
}

func NewGoogleSheetsStore(ctx context.Context, spreadsheetID, credentialsPath string) (*GoogleSheetsStore, error) {
	svc, err := sheets.NewService(ctx,
		option.WithCredentialsFile(credentialsPath),
		option.WithScopes(sheets.SpreadsheetsScope),
	)
	if err != nil {
		return nil, fmt.Errorf("sheets: create service: %w", err)
	}
	return &GoogleSheetsStore{svc: svc, spreadsheetID: spreadsheetID}, nil
}

// ---------- Transactions ----------

func (s *GoogleSheetsStore) ListTransactions(ctx context.Context) ([]models.Transaction, error) {
	resp, err := s.svc.Spreadsheets.Values.Get(s.spreadsheetID, tabTransactions+"!A2:L").Context(ctx).Do()
	if err != nil {
		return nil, fmt.Errorf("sheets: list transactions: %w", err)
	}
	out := make([]models.Transaction, 0, len(resp.Values))
	for _, row := range resp.Values {
		out = append(out, rowToTransaction(row))
	}
	return out, nil
}

func rowToTransaction(row []any) models.Transaction {
	get := func(i int) string {
		if i >= len(row) {
			return ""
		}
		return strings.TrimSpace(fmt.Sprint(row[i]))
	}
	var amount int64
	fmt.Sscanf(get(3), "%d", &amount)
	return models.Transaction{
		ID: get(0), Description: get(1),
		Type: models.TransactionType(get(2)), Amount: amount,
		Status: models.TransactionStatus(get(4)),
		Date:   get(5), PlannedDate: get(6), ActualDate: get(7),
		CategoryID: get(8), Notes: get(9),
		CreatedAt: get(10), UpdatedAt: get(11),
	}
}

func transactionToRow(t models.Transaction) []any {
	return []any{
		t.ID, t.Description, string(t.Type), t.Amount, string(t.Status),
		t.Date, t.PlannedDate, t.ActualDate, t.CategoryID, t.Notes,
		t.CreatedAt, t.UpdatedAt,
	}
}

func (s *GoogleSheetsStore) GetTransaction(ctx context.Context, id string) (*models.Transaction, error) {
	txs, err := s.ListTransactions(ctx)
	if err != nil {
		return nil, err
	}
	for i := range txs {
		if txs[i].ID == id {
			return &txs[i], nil
		}
	}
	return nil, ErrNotFound
}

func (s *GoogleSheetsStore) CreateTransaction(ctx context.Context, t models.Transaction) error {
	vr := &sheets.ValueRange{Values: [][]any{transactionToRow(t)}}
	_, err := s.svc.Spreadsheets.Values.Append(s.spreadsheetID, tabTransactions+"!A2", vr).
		ValueInputOption("RAW").Context(ctx).Do()
	if err != nil {
		return fmt.Errorf("sheets: append transaction: %w", err)
	}
	return nil
}

func (s *GoogleSheetsStore) UpdateTransaction(ctx context.Context, t models.Transaction) error {
	rowIdx, err := s.findRowIndex(ctx, tabTransactions, t.ID)
	if err != nil {
		return err
	}
	rangeName := fmt.Sprintf("%s!A%d:L%d", tabTransactions, rowIdx, rowIdx)
	vr := &sheets.ValueRange{Values: [][]any{transactionToRow(t)}}
	_, err = s.svc.Spreadsheets.Values.Update(s.spreadsheetID, rangeName, vr).
		ValueInputOption("RAW").Context(ctx).Do()
	if err != nil {
		return fmt.Errorf("sheets: update transaction: %w", err)
	}
	return nil
}

func (s *GoogleSheetsStore) DeleteTransaction(ctx context.Context, id string) error {
	rowIdx, err := s.findRowIndex(ctx, tabTransactions, id)
	if err != nil {
		return err
	}
	rangeName := fmt.Sprintf("%s!A%d:L%d", tabTransactions, rowIdx, rowIdx)
	_, err = s.svc.Spreadsheets.Values.Clear(s.spreadsheetID, rangeName, &sheets.ClearValuesRequest{}).Context(ctx).Do()
	if err != nil {
		return fmt.Errorf("sheets: delete transaction: %w", err)
	}
	return nil
}

// ---------- Categories ----------

func (s *GoogleSheetsStore) ListCategories(ctx context.Context) ([]models.Category, error) {
	resp, err := s.svc.Spreadsheets.Values.Get(s.spreadsheetID, tabCategories+"!A2:H").Context(ctx).Do()
	if err != nil {
		return nil, fmt.Errorf("sheets: list categories: %w", err)
	}
	out := make([]models.Category, 0, len(resp.Values))
	for _, row := range resp.Values {
		out = append(out, rowToCategory(row))
	}
	return out, nil
}

func rowToCategory(row []any) models.Category {
	get := func(i int) string {
		if i >= len(row) {
			return ""
		}
		return strings.TrimSpace(fmt.Sprint(row[i]))
	}
	parseOpt := func(s string) *int64 {
		if s == "" {
			return nil
		}
		var v int64
		if _, err := fmt.Sscanf(s, "%d", &v); err != nil {
			return nil
		}
		return &v
	}
	return models.Category{
		ID: get(0), Name: get(1), Icon: get(2),
		MonthlyBudget: parseOpt(get(3)),
		DailyBudget:   parseOpt(get(4)),
		IsArchived:    strings.EqualFold(get(5), "true"),
		CreatedAt:     get(6), UpdatedAt: get(7),
	}
}

func categoryToRow(c models.Category) []any {
	monthly, daily := "", ""
	if c.MonthlyBudget != nil {
		monthly = fmt.Sprintf("%d", *c.MonthlyBudget)
	}
	if c.DailyBudget != nil {
		daily = fmt.Sprintf("%d", *c.DailyBudget)
	}
	return []any{c.ID, c.Name, c.Icon, monthly, daily, c.IsArchived, c.CreatedAt, c.UpdatedAt}
}

func (s *GoogleSheetsStore) GetCategory(ctx context.Context, id string) (*models.Category, error) {
	cats, err := s.ListCategories(ctx)
	if err != nil {
		return nil, err
	}
	for i := range cats {
		if cats[i].ID == id {
			return &cats[i], nil
		}
	}
	return nil, ErrNotFound
}

func (s *GoogleSheetsStore) CreateCategory(ctx context.Context, c models.Category) error {
	vr := &sheets.ValueRange{Values: [][]any{categoryToRow(c)}}
	_, err := s.svc.Spreadsheets.Values.Append(s.spreadsheetID, tabCategories+"!A2", vr).
		ValueInputOption("RAW").Context(ctx).Do()
	if err != nil {
		return fmt.Errorf("sheets: append category: %w", err)
	}
	return nil
}

func (s *GoogleSheetsStore) UpdateCategory(ctx context.Context, c models.Category) error {
	rowIdx, err := s.findRowIndex(ctx, tabCategories, c.ID)
	if err != nil {
		return err
	}
	rangeName := fmt.Sprintf("%s!A%d:H%d", tabCategories, rowIdx, rowIdx)
	vr := &sheets.ValueRange{Values: [][]any{categoryToRow(c)}}
	_, err = s.svc.Spreadsheets.Values.Update(s.spreadsheetID, rangeName, vr).
		ValueInputOption("RAW").Context(ctx).Do()
	if err != nil {
		return fmt.Errorf("sheets: update category: %w", err)
	}
	return nil
}

// ---------- Settings ----------

func (s *GoogleSheetsStore) GetSettings(ctx context.Context) (map[string]string, error) {
	resp, err := s.svc.Spreadsheets.Values.Get(s.spreadsheetID, tabSettings+"!A2:B").Context(ctx).Do()
	if err != nil {
		return nil, fmt.Errorf("sheets: get settings: %w", err)
	}
	out := map[string]string{}
	for _, row := range resp.Values {
		if len(row) >= 2 {
			out[strings.TrimSpace(fmt.Sprint(row[0]))] = strings.TrimSpace(fmt.Sprint(row[1]))
		}
	}
	return out, nil
}

func (s *GoogleSheetsStore) PutSettings(ctx context.Context, kv map[string]string) error {
	resp, err := s.svc.Spreadsheets.Values.Get(s.spreadsheetID, tabSettings+"!A2:A").Context(ctx).Do()
	if err != nil {
		return fmt.Errorf("sheets: read settings keys: %w", err)
	}
	existing := map[string]int{}
	for i, row := range resp.Values {
		if len(row) > 0 {
			existing[strings.TrimSpace(fmt.Sprint(row[0]))] = i + 2
		}
	}
	now := time.Now().UTC().Format(time.RFC3339)
	for k, v := range kv {
		if rowIdx, ok := existing[k]; ok {
			rangeName := fmt.Sprintf("%s!B%d:C%d", tabSettings, rowIdx, rowIdx)
			vr := &sheets.ValueRange{Values: [][]any{{v, now}}}
			if _, err := s.svc.Spreadsheets.Values.Update(s.spreadsheetID, rangeName, vr).
				ValueInputOption("RAW").Context(ctx).Do(); err != nil {
				return fmt.Errorf("sheets: update setting %s: %w", k, err)
			}
			continue
		}
		vr := &sheets.ValueRange{Values: [][]any{{k, v, now}}}
		if _, err := s.svc.Spreadsheets.Values.Append(s.spreadsheetID, tabSettings+"!A2", vr).
			ValueInputOption("RAW").Context(ctx).Do(); err != nil {
			return fmt.Errorf("sheets: append setting %s: %w", k, err)
		}
	}
	return nil
}

// ---------- helpers ----------

func (s *GoogleSheetsStore) findRowIndex(ctx context.Context, tab, id string) (int, error) {
	resp, err := s.svc.Spreadsheets.Values.Get(s.spreadsheetID, tab+"!A:A").Context(ctx).Do()
	if err != nil {
		return 0, fmt.Errorf("sheets: find row: %w", err)
	}
	for i, row := range resp.Values {
		if len(row) == 0 {
			continue
		}
		if strings.TrimSpace(fmt.Sprint(row[0])) == id {
			return i + 1, nil
		}
	}
	return 0, ErrNotFound
}

package services

import (
	"testing"

	"github.com/meeptaquelle/spending-tracker/backend/models"
)

func tx(id, typ string, status string, amount int64, date, planned string) models.Transaction {
	return models.Transaction{
		ID:          id,
		Description: id,
		Type:        models.TransactionType(typ),
		Status:      models.TransactionStatus(status),
		Amount:      amount,
		Date:        date,
		PlannedDate: planned,
	}
}

func TestSummarizeMonth(t *testing.T) {
	txs := []models.Transaction{
		tx("income-oct", "income", "completed", 5_000_000, "2026-10-05", ""),
		tx("expense-oct", "expense", "completed", 1_250_000, "2026-10-08", ""),
		tx("planned-oct", "expense", "planned", 500_000, "2026-10-20", "2026-10-20"),
		tx("income-sep", "income", "completed", 3_000_000, "2026-09-01", ""),
	}

	s := SummarizeMonth(txs, "2026-10")

	if s.ActualIncome != 5_000_000 {
		t.Errorf("ActualIncome: got %d, want %d", s.ActualIncome, 5_000_000)
	}
	if s.ActualExpenses != 1_250_000 {
		t.Errorf("ActualExpenses: got %d, want %d", s.ActualExpenses, 1_250_000)
	}
	if s.AvailableBalance != 3_750_000 {
		t.Errorf("AvailableBalance: got %d, want %d", s.AvailableBalance, 3_750_000)
	}
	if s.PlannedExpenses != 500_000 {
		t.Errorf("PlannedExpenses: got %d, want %d", s.PlannedExpenses, 500_000)
	}
	if s.ProjectedBalance != 3_250_000 {
		t.Errorf("ProjectedBalance: got %d, want %d", s.ProjectedBalance, 3_250_000)
	}
}

func TestSummaryNegativeBalance(t *testing.T) {
	txs := []models.Transaction{
		tx("i", "income", "completed", 100_000, "2026-10-01", ""),
		tx("e", "expense", "completed", 250_000, "2026-10-02", ""),
	}

	s := SummarizeMonth(txs, "2026-10")

	if s.AvailableBalance != -150_000 {
		t.Errorf("expected negative available balance -150000, got %d", s.AvailableBalance)
	}
	if s.ProjectedBalance != -150_000 {
		t.Errorf("expected negative projected balance -150000, got %d", s.ProjectedBalance)
	}
}

func TestPlannedCountsUsePlannedDateNotActual(t *testing.T) {
	// Planned for October, still outstanding.
	txs := []models.Transaction{
		tx("p", "expense", "planned", 300_000, "2026-10-15", "2026-10-15"),
	}

	oct := SummarizeMonth(txs, "2026-10")
	if oct.PlannedExpenses != 300_000 {
		t.Errorf("Oct planned: got %d, want 300000", oct.PlannedExpenses)
	}
	if oct.ActualExpenses != 0 {
		t.Errorf("Oct actual expenses must not include planned: got %d", oct.ActualExpenses)
	}

	nov := SummarizeMonth(txs, "2026-11")
	if nov.PlannedExpenses != 0 {
		t.Errorf("Nov planned should be 0, got %d", nov.PlannedExpenses)
	}
}

func TestCompletedPlannedMovesToActualMonth(t *testing.T) {
	// Planned for Oct, completed in Nov.
	txs := []models.Transaction{
		{
			ID:          "p",
			Description: "utang",
			Type:        models.TypeExpense,
			Status:      models.StatusCompleted,
			Amount:      200_000,
			Date:        "2026-11-03",
			PlannedDate: "2026-10-20",
			ActualDate:  "2026-11-03",
		},
	}

	oct := SummarizeMonth(txs, "2026-10")
	if oct.PlannedExpenses != 0 {
		t.Errorf("Oct planned must be 0 after completion moved to Nov, got %d", oct.PlannedExpenses)
	}
	if oct.ActualExpenses != 0 {
		t.Errorf("Oct actual must be 0, got %d", oct.ActualExpenses)
	}

	nov := SummarizeMonth(txs, "2026-11")
	if nov.ActualExpenses != 200_000 {
		t.Errorf("Nov actual: got %d, want 200000", nov.ActualExpenses)
	}
	if nov.PlannedExpenses != 0 {
		t.Errorf("Nov planned must be 0, got %d", nov.PlannedExpenses)
	}
}

func TestIncomeNeverCountsAsExpense(t *testing.T) {
	txs := []models.Transaction{
		tx("i", "income", "completed", 1_000_000, "2026-10-01", ""),
	}

	s := SummarizeMonth(txs, "2026-10")
	if s.ActualExpenses != 0 {
		t.Errorf("income must not count as expense, got %d", s.ActualExpenses)
	}
	if s.ActualIncome != 1_000_000 {
		t.Errorf("income: got %d, want 1000000", s.ActualIncome)
	}
}

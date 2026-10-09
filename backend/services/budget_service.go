package services

import (
	"github.com/meeptaquelle/spending-tracker/backend/models"
)

// Aggregation helpers are pure and shared by handlers that need them.

type MonthSummary struct {
	Month            string `json:"month"`
	ActualIncome     int64  `json:"actual_income"`
	ActualExpenses   int64  `json:"actual_expenses"`
	AvailableBalance int64  `json:"available_balance"`
	PlannedExpenses  int64  `json:"planned_expenses"`
	ProjectedBalance int64  `json:"projected_balance"`
}

func SummarizeMonth(txs []models.Transaction, month string) MonthSummary {
	s := MonthSummary{Month: month}
	for _, t := range txs {
		switch {
		case t.Type == models.TypeIncome && t.Status == models.StatusCompleted:
			if monthOf(t) == month {
				s.ActualIncome += t.Amount
			}
		case t.Type == models.TypeExpense && t.Status == models.StatusCompleted:
			if monthOf(t) == month {
				s.ActualExpenses += t.Amount
			}
		case t.Type == models.TypeExpense && t.Status == models.StatusPlanned:
			if monthOf(t) == month {
				s.PlannedExpenses += t.Amount
			}
		}
	}
	s.AvailableBalance = s.ActualIncome - s.ActualExpenses
	s.ProjectedBalance = s.AvailableBalance - s.PlannedExpenses
	return s
}

func monthOf(t models.Transaction) string {
	d := t.Date
	if t.Status == models.StatusPlanned && t.PlannedDate != "" {
		d = t.PlannedDate
	}
	if len(d) >= 7 {
		return d[:7]
	}
	return ""
}

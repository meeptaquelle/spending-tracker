package models

import (
	"errors"
	"strings"
)

type Category struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	Icon          string `json:"icon"`
	MonthlyBudget *int64 `json:"monthly_budget"`
	DailyBudget   *int64 `json:"daily_budget"`
	IsArchived    bool   `json:"is_archived"`
	CreatedAt     string `json:"created_at"`
	UpdatedAt     string `json:"updated_at"`
}

func (c *Category) Validate() error {
	c.Name = strings.TrimSpace(c.Name)
	if c.Name == "" {
		return errors.New("name is required")
	}
	if len(c.Name) > 60 {
		return errors.New("name too long (max 60)")
	}
	if strings.TrimSpace(c.Icon) == "" {
		return errors.New("icon is required")
	}
	if c.MonthlyBudget != nil && *c.MonthlyBudget <= 0 {
		return errors.New("monthly_budget must be positive or null")
	}
	if c.DailyBudget != nil && *c.DailyBudget <= 0 {
		return errors.New("daily_budget must be positive or null")
	}
	return nil
}

package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type OrderRepository struct {
	db *sql.DB
}

func NewOrderRepository(db *sql.DB) *OrderRepository {
	return &OrderRepository{db: db}
}

type OrderEntity struct {
	ID              string
	OrderNumber     string
	UserID          string
	Items           []OrderItemEntity
	ShippingAddress string
	Subtotal        float64
	Shipping        float64
	Tax             float64
	Total           float64
	Status          string
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

type OrderItemEntity struct {
	ProductID string  `json:"product_id"`
	Quantity  int     `json:"quantity"`
	UnitPrice float64 `json:"unit_price"`
	Total     float64 `json:"total"`
}

func (r *OrderRepository) Create(ctx context.Context, order *OrderEntity) (*OrderEntity, error) {
	order.ID = uuid.New().String()
	order.CreatedAt = time.Now()
	order.UpdatedAt = time.Now()

	itemsJSON, err := json.Marshal(order.Items)
	if err != nil {
		return nil, err
	}

	_, err = r.db.ExecContext(ctx,
		`INSERT INTO orders (id, order_number, user_id, items, shipping_address, subtotal, shipping, tax, total, status, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
		order.ID, order.OrderNumber, order.UserID, itemsJSON, order.ShippingAddress,
		order.Subtotal, order.Shipping, order.Tax, order.Total, order.Status,
		order.CreatedAt, order.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	return order, nil
}

func (r *OrderRepository) FindByID(ctx context.Context, id string) (*OrderEntity, error) {
	var order OrderEntity
	var itemsJSON []byte

	err := r.db.QueryRowContext(ctx,
		`SELECT id, order_number, user_id, items, shipping_address, subtotal, shipping, tax, total, status, created_at, updated_at
		 FROM orders WHERE id = $1`,
		id,
	).Scan(&order.ID, &order.OrderNumber, &order.UserID, &itemsJSON, &order.ShippingAddress,
		&order.Subtotal, &order.Shipping, &order.Tax, &order.Total, &order.Status,
		&order.CreatedAt, &order.UpdatedAt)
	if err != nil {
		return nil, err
	}

	if err := json.Unmarshal(itemsJSON, &order.Items); err != nil {
		return nil, err
	}

	return &order, nil
}

func (r *OrderRepository) ListByUser(ctx context.Context, userID string, offset, limit int) ([]*OrderEntity, int, error) {
	var orders []*OrderEntity
	var total int

	// Count total
	r.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM orders WHERE user_id = $1`,
		userID,
	).Scan(&total)

	// Fetch orders
	rows, err := r.db.QueryContext(ctx,
		`SELECT id, order_number, user_id, items, shipping_address, subtotal, shipping, tax, total, status, created_at, updated_at
		 FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
		userID, limit, offset,
	)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	for rows.Next() {
		var order OrderEntity
		var itemsJSON []byte

		err := rows.Scan(&order.ID, &order.OrderNumber, &order.UserID, &itemsJSON, &order.ShippingAddress,
			&order.Subtotal, &order.Shipping, &order.Tax, &order.Total, &order.Status,
			&order.CreatedAt, &order.UpdatedAt)
		if err != nil {
			return nil, 0, err
		}

		if err := json.Unmarshal(itemsJSON, &order.Items); err != nil {
			return nil, 0, err
		}

		orders = append(orders, &order)
	}

	return orders, total, nil
}

func (r *OrderRepository) UpdateStatus(ctx context.Context, id, status string) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE orders SET status = $1, updated_at = $2 WHERE id = $3`,
		status, time.Now(), id,
	)
	return err
}

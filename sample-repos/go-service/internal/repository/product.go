package repository

import (
	"context"
	"database/sql"
	"time"

	"github.com/google/uuid"
)

type ProductRepository struct {
	db *sql.DB
}

func NewProductRepository(db *sql.DB) *ProductRepository {
	return &ProductRepository{db: db}
}

type ProductEntity struct {
	ID          string
	SKU         string
	Name        string
	Description string
	Price       float64
	Category    string
	Stock       int
	Status      string
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

func (r *ProductRepository) Create(ctx context.Context, product *ProductEntity) (*ProductEntity, error) {
	product.ID = uuid.New().String()
	product.CreatedAt = time.Now()
	product.UpdatedAt = time.Now()

	_, err := r.db.ExecContext(ctx,
		`INSERT INTO products (id, sku, name, description, price, category, stock, status, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
		product.ID, product.SKU, product.Name, product.Description, product.Price,
		product.Category, product.Stock, product.Status, product.CreatedAt, product.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	return product, nil
}

func (r *ProductRepository) FindByID(ctx context.Context, id string) (*ProductEntity, error) {
	var product ProductEntity
	err := r.db.QueryRowContext(ctx,
		`SELECT id, sku, name, description, price, category, stock, status, created_at, updated_at
		 FROM products WHERE id = $1 AND status != 'deleted'`,
		id,
	).Scan(&product.ID, &product.SKU, &product.Name, &product.Description, &product.Price,
		&product.Category, &product.Stock, &product.Status, &product.CreatedAt, &product.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &product, nil
}

func (r *ProductRepository) FindBySKU(ctx context.Context, sku string) (*ProductEntity, error) {
	var product ProductEntity
	err := r.db.QueryRowContext(ctx,
		`SELECT id, sku, name, description, price, category, stock, status, created_at, updated_at
		 FROM products WHERE sku = $1`,
		sku,
	).Scan(&product.ID, &product.SKU, &product.Name, &product.Description, &product.Price,
		&product.Category, &product.Stock, &product.Status, &product.CreatedAt, &product.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &product, nil
}

func (r *ProductRepository) List(ctx context.Context, offset, limit int, category string) ([]*ProductEntity, int, error) {
	var products []*ProductEntity
	var total int

	// Count total
	countQuery := `SELECT COUNT(*) FROM products WHERE status = 'active'`
	if category != "" {
		countQuery += ` AND category = $1`
		r.db.QueryRowContext(ctx, countQuery, category).Scan(&total)
	} else {
		r.db.QueryRowContext(ctx, countQuery).Scan(&total)
	}

	// Fetch products
	query := `SELECT id, sku, name, description, price, category, stock, status, created_at, updated_at
		      FROM products WHERE status = 'active'`
	var rows *sql.Rows
	var err error

	if category != "" {
		query += ` AND category = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`
		rows, err = r.db.QueryContext(ctx, query, category, limit, offset)
	} else {
		query += ` ORDER BY created_at DESC LIMIT $1 OFFSET $2`
		rows, err = r.db.QueryContext(ctx, query, limit, offset)
	}

	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	for rows.Next() {
		var p ProductEntity
		err := rows.Scan(&p.ID, &p.SKU, &p.Name, &p.Description, &p.Price,
			&p.Category, &p.Stock, &p.Status, &p.CreatedAt, &p.UpdatedAt)
		if err != nil {
			return nil, 0, err
		}
		products = append(products, &p)
	}

	return products, total, nil
}

func (r *ProductRepository) Update(ctx context.Context, id string, updates map[string]interface{}) (*ProductEntity, error) {
	// Simplified - in real code you'd build dynamic query
	_, err := r.db.ExecContext(ctx,
		`UPDATE products SET updated_at = $1 WHERE id = $2`,
		time.Now(), id,
	)
	if err != nil {
		return nil, err
	}

	return r.FindByID(ctx, id)
}

func (r *ProductRepository) Delete(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE products SET status = 'deleted', updated_at = $1 WHERE id = $2`,
		time.Now(), id,
	)
	return err
}

func (r *ProductRepository) UpdateStock(ctx context.Context, id string, delta int) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE products SET stock = stock + $1, updated_at = $2 WHERE id = $3`,
		delta, time.Now(), id,
	)
	return err
}

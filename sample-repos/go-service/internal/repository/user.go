package repository

import (
	"context"
	"database/sql"
	"time"

	"github.com/google/uuid"
)

type UserRepository struct {
	db *sql.DB
}

func NewUserRepository(db *sql.DB) *UserRepository {
	return &UserRepository{db: db}
}

type UserEntity struct {
	ID        string
	Email     string
	Password  string
	Name      string
	Role      string
	CreatedAt time.Time
	UpdatedAt time.Time
}

func (r *UserRepository) Create(ctx context.Context, user *UserEntity) (*UserEntity, error) {
	user.ID = uuid.New().String()
	user.CreatedAt = time.Now()
	user.UpdatedAt = time.Now()

	_, err := r.db.ExecContext(ctx,
		`INSERT INTO users (id, email, password, name, role, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		user.ID, user.Email, user.Password, user.Name, user.Role, user.CreatedAt, user.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	return user, nil
}

func (r *UserRepository) FindByID(ctx context.Context, id string) (*UserEntity, error) {
	var user UserEntity
	err := r.db.QueryRowContext(ctx,
		`SELECT id, email, password, name, role, created_at, updated_at FROM users WHERE id = $1`,
		id,
	).Scan(&user.ID, &user.Email, &user.Password, &user.Name, &user.Role, &user.CreatedAt, &user.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *UserRepository) FindByEmail(ctx context.Context, email string) (*UserEntity, error) {
	var user UserEntity
	err := r.db.QueryRowContext(ctx,
		`SELECT id, email, password, name, role, created_at, updated_at FROM users WHERE email = $1`,
		email,
	).Scan(&user.ID, &user.Email, &user.Password, &user.Name, &user.Role, &user.CreatedAt, &user.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *UserRepository) Update(ctx context.Context, id string, updates map[string]interface{}) (*UserEntity, error) {
	// Simplified update - in real code you'd build dynamic query
	if name, ok := updates["name"].(string); ok {
		_, err := r.db.ExecContext(ctx,
			`UPDATE users SET name = $1, updated_at = $2 WHERE id = $3`,
			name, time.Now(), id,
		)
		if err != nil {
			return nil, err
		}
	}

	return r.FindByID(ctx, id)
}

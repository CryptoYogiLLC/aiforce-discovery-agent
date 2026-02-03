package service

import (
	"context"
	"errors"
	"time"

	"github.com/example/sample-go-service/internal/repository"
	"github.com/golang-jwt/jwt/v5"
	"github.com/sirupsen/logrus"
	"golang.org/x/crypto/bcrypt"
)

var jwtSecret = []byte("your-secret-key")

type UserService struct {
	userRepo *repository.UserRepository
	log      *logrus.Logger
}

func NewUserService(userRepo *repository.UserRepository, log *logrus.Logger) *UserService {
	return &UserService{
		userRepo: userRepo,
		log:      log,
	}
}

type User struct {
	ID        string    `json:"id"`
	Email     string    `json:"email"`
	Name      string    `json:"name"`
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"created_at"`
}

func (s *UserService) Register(ctx context.Context, email, password, name string) (*User, string, error) {
	// Check if user exists
	existing, _ := s.userRepo.FindByEmail(ctx, email)
	if existing != nil {
		return nil, "", errors.New("email already registered")
	}

	// Hash password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, "", err
	}

	// Create user
	user, err := s.userRepo.Create(ctx, &repository.UserEntity{
		Email:    email,
		Password: string(hashedPassword),
		Name:     name,
		Role:     "user",
	})
	if err != nil {
		return nil, "", err
	}

	// Generate token
	token, err := s.generateToken(user.ID, user.Role)
	if err != nil {
		return nil, "", err
	}

	s.log.Infof("User registered: %s", email)

	return &User{
		ID:        user.ID,
		Email:     user.Email,
		Name:      user.Name,
		Role:      user.Role,
		CreatedAt: user.CreatedAt,
	}, token, nil
}

func (s *UserService) Login(ctx context.Context, email, password string) (*User, string, error) {
	// Find user
	user, err := s.userRepo.FindByEmail(ctx, email)
	if err != nil {
		return nil, "", errors.New("invalid credentials")
	}

	// Verify password
	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(password)); err != nil {
		return nil, "", errors.New("invalid credentials")
	}

	// Generate token
	token, err := s.generateToken(user.ID, user.Role)
	if err != nil {
		return nil, "", err
	}

	s.log.Infof("User logged in: %s", email)

	return &User{
		ID:        user.ID,
		Email:     user.Email,
		Name:      user.Name,
		Role:      user.Role,
		CreatedAt: user.CreatedAt,
	}, token, nil
}

func (s *UserService) GetByID(ctx context.Context, id string) (*User, error) {
	user, err := s.userRepo.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}

	return &User{
		ID:        user.ID,
		Email:     user.Email,
		Name:      user.Name,
		Role:      user.Role,
		CreatedAt: user.CreatedAt,
	}, nil
}

func (s *UserService) Update(ctx context.Context, id string, updates map[string]interface{}) (*User, error) {
	user, err := s.userRepo.Update(ctx, id, updates)
	if err != nil {
		return nil, err
	}

	return &User{
		ID:        user.ID,
		Email:     user.Email,
		Name:      user.Name,
		Role:      user.Role,
		CreatedAt: user.CreatedAt,
	}, nil
}

func (s *UserService) generateToken(userID, role string) (string, error) {
	claims := jwt.MapClaims{
		"user_id": userID,
		"role":    role,
		"exp":     time.Now().Add(7 * 24 * time.Hour).Unix(),
		"iat":     time.Now().Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(jwtSecret)
}

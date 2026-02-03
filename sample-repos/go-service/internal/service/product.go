package service

import (
	"context"
	"errors"

	"github.com/example/sample-go-service/internal/repository"
	"github.com/sirupsen/logrus"
)

type ProductService struct {
	productRepo *repository.ProductRepository
	log         *logrus.Logger
}

func NewProductService(productRepo *repository.ProductRepository, log *logrus.Logger) *ProductService {
	return &ProductService{
		productRepo: productRepo,
		log:         log,
	}
}

type Product struct {
	ID          string  `json:"id"`
	SKU         string  `json:"sku"`
	Name        string  `json:"name"`
	Description string  `json:"description"`
	Price       float64 `json:"price"`
	Category    string  `json:"category"`
	Stock       int     `json:"stock"`
	Status      string  `json:"status"`
}

type CreateProductInput struct {
	SKU         string
	Name        string
	Description string
	Price       float64
	Category    string
	Stock       int
}

func (s *ProductService) List(ctx context.Context, page, limit int, category string) ([]Product, int, error) {
	offset := (page - 1) * limit

	entities, total, err := s.productRepo.List(ctx, offset, limit, category)
	if err != nil {
		return nil, 0, err
	}

	products := make([]Product, len(entities))
	for i, e := range entities {
		products[i] = Product{
			ID:          e.ID,
			SKU:         e.SKU,
			Name:        e.Name,
			Description: e.Description,
			Price:       e.Price,
			Category:    e.Category,
			Stock:       e.Stock,
			Status:      e.Status,
		}
	}

	return products, total, nil
}

func (s *ProductService) GetByID(ctx context.Context, id string) (*Product, error) {
	entity, err := s.productRepo.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}

	return &Product{
		ID:          entity.ID,
		SKU:         entity.SKU,
		Name:        entity.Name,
		Description: entity.Description,
		Price:       entity.Price,
		Category:    entity.Category,
		Stock:       entity.Stock,
		Status:      entity.Status,
	}, nil
}

func (s *ProductService) Create(ctx context.Context, input CreateProductInput) (*Product, error) {
	// Check for duplicate SKU
	existing, _ := s.productRepo.FindBySKU(ctx, input.SKU)
	if existing != nil {
		return nil, errors.New("SKU already exists")
	}

	entity, err := s.productRepo.Create(ctx, &repository.ProductEntity{
		SKU:         input.SKU,
		Name:        input.Name,
		Description: input.Description,
		Price:       input.Price,
		Category:    input.Category,
		Stock:       input.Stock,
		Status:      "active",
	})
	if err != nil {
		return nil, err
	}

	s.log.Infof("Product created: %s", input.SKU)

	return &Product{
		ID:          entity.ID,
		SKU:         entity.SKU,
		Name:        entity.Name,
		Description: entity.Description,
		Price:       entity.Price,
		Category:    entity.Category,
		Stock:       entity.Stock,
		Status:      entity.Status,
	}, nil
}

func (s *ProductService) Update(ctx context.Context, id string, updates map[string]interface{}) (*Product, error) {
	entity, err := s.productRepo.Update(ctx, id, updates)
	if err != nil {
		return nil, err
	}

	return &Product{
		ID:          entity.ID,
		SKU:         entity.SKU,
		Name:        entity.Name,
		Description: entity.Description,
		Price:       entity.Price,
		Category:    entity.Category,
		Stock:       entity.Stock,
		Status:      entity.Status,
	}, nil
}

func (s *ProductService) Delete(ctx context.Context, id string) error {
	return s.productRepo.Delete(ctx, id)
}

func (s *ProductService) UpdateStock(ctx context.Context, id string, delta int) error {
	return s.productRepo.UpdateStock(ctx, id, delta)
}

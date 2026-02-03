package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/example/sample-go-service/internal/repository"
	"github.com/google/uuid"
	"github.com/sirupsen/logrus"
)

type OrderService struct {
	orderRepo   *repository.OrderRepository
	productRepo *repository.ProductRepository
	log         *logrus.Logger
}

func NewOrderService(orderRepo *repository.OrderRepository, productRepo *repository.ProductRepository, log *logrus.Logger) *OrderService {
	return &OrderService{
		orderRepo:   orderRepo,
		productRepo: productRepo,
		log:         log,
	}
}

type Order struct {
	ID              string      `json:"id"`
	OrderNumber     string      `json:"order_number"`
	UserID          string      `json:"user_id"`
	Items           []OrderItem `json:"items"`
	ShippingAddress Address     `json:"shipping_address"`
	Subtotal        float64     `json:"subtotal"`
	Shipping        float64     `json:"shipping"`
	Tax             float64     `json:"tax"`
	Total           float64     `json:"total"`
	Status          string      `json:"status"`
	CreatedAt       time.Time   `json:"created_at"`
}

type OrderItem struct {
	ProductID string  `json:"product_id"`
	Quantity  int     `json:"quantity"`
	UnitPrice float64 `json:"unit_price,omitempty"`
	Total     float64 `json:"total,omitempty"`
}

type Address struct {
	Street  string `json:"street"`
	City    string `json:"city"`
	State   string `json:"state"`
	Zip     string `json:"zip"`
	Country string `json:"country"`
}

type CreateOrderInput struct {
	UserID          string
	Items           []OrderItem
	ShippingAddress Address
}

func (s *OrderService) ListByUser(ctx context.Context, userID string, page, limit int) ([]Order, int, error) {
	offset := (page - 1) * limit

	entities, total, err := s.orderRepo.ListByUser(ctx, userID, offset, limit)
	if err != nil {
		return nil, 0, err
	}

	orders := make([]Order, len(entities))
	for i, e := range entities {
		orders[i] = s.entityToOrder(e)
	}

	return orders, total, nil
}

func (s *OrderService) GetByID(ctx context.Context, id string) (*Order, error) {
	entity, err := s.orderRepo.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}

	order := s.entityToOrder(entity)
	return &order, nil
}

func (s *OrderService) Create(ctx context.Context, input CreateOrderInput) (*Order, error) {
	var subtotal float64
	items := make([]repository.OrderItemEntity, len(input.Items))

	// Validate products and calculate totals
	for i, item := range input.Items {
		product, err := s.productRepo.FindByID(ctx, item.ProductID)
		if err != nil {
			return nil, fmt.Errorf("product %s not found", item.ProductID)
		}

		if product.Status != "active" {
			return nil, fmt.Errorf("product %s is not available", product.SKU)
		}

		if product.Stock < item.Quantity {
			return nil, fmt.Errorf("insufficient stock for %s", product.SKU)
		}

		itemTotal := product.Price * float64(item.Quantity)
		subtotal += itemTotal

		items[i] = repository.OrderItemEntity{
			ProductID: item.ProductID,
			Quantity:  item.Quantity,
			UnitPrice: product.Price,
			Total:     itemTotal,
		}

		// Reduce stock
		if err := s.productRepo.UpdateStock(ctx, item.ProductID, -item.Quantity); err != nil {
			return nil, err
		}
	}

	// Calculate shipping and tax
	shipping := 9.99
	if subtotal > 100 {
		shipping = 0
	}
	tax := subtotal * 0.08
	total := subtotal + shipping + tax

	// Create order
	entity, err := s.orderRepo.Create(ctx, &repository.OrderEntity{
		OrderNumber:     generateOrderNumber(),
		UserID:          input.UserID,
		Items:           items,
		ShippingAddress: input.ShippingAddress.Street + ", " + input.ShippingAddress.City,
		Subtotal:        subtotal,
		Shipping:        shipping,
		Tax:             tax,
		Total:           total,
		Status:          "pending",
	})
	if err != nil {
		return nil, err
	}

	s.log.Infof("Order created: %s by user %s", entity.OrderNumber, input.UserID)

	order := s.entityToOrder(entity)
	return &order, nil
}

func (s *OrderService) Cancel(ctx context.Context, id string) error {
	order, err := s.orderRepo.FindByID(ctx, id)
	if err != nil {
		return err
	}

	if order.Status != "pending" && order.Status != "confirmed" {
		return errors.New("only pending or confirmed orders can be cancelled")
	}

	// Restore stock
	for _, item := range order.Items {
		if err := s.productRepo.UpdateStock(ctx, item.ProductID, item.Quantity); err != nil {
			return err
		}
	}

	if err := s.orderRepo.UpdateStatus(ctx, id, "cancelled"); err != nil {
		return err
	}

	s.log.Infof("Order cancelled: %s", order.OrderNumber)
	return nil
}

func (s *OrderService) entityToOrder(e *repository.OrderEntity) Order {
	items := make([]OrderItem, len(e.Items))
	for i, item := range e.Items {
		items[i] = OrderItem{
			ProductID: item.ProductID,
			Quantity:  item.Quantity,
			UnitPrice: item.UnitPrice,
			Total:     item.Total,
		}
	}

	return Order{
		ID:          e.ID,
		OrderNumber: e.OrderNumber,
		UserID:      e.UserID,
		Items:       items,
		Subtotal:    e.Subtotal,
		Shipping:    e.Shipping,
		Tax:         e.Tax,
		Total:       e.Total,
		Status:      e.Status,
		CreatedAt:   e.CreatedAt,
	}
}

func generateOrderNumber() string {
	id := uuid.New().String()[:8]
	return fmt.Sprintf("ORD-%s", id)
}

package handler

import (
	"net/http"
	"strconv"

	"github.com/example/sample-go-service/internal/service"
	"github.com/gin-gonic/gin"
)

type OrderHandler struct {
	orderService *service.OrderService
}

func NewOrderHandler(orderService *service.OrderService) *OrderHandler {
	return &OrderHandler{orderService: orderService}
}

type CreateOrderRequest struct {
	Items []struct {
		ProductID string `json:"product_id" binding:"required"`
		Quantity  int    `json:"quantity" binding:"required,gt=0"`
	} `json:"items" binding:"required,min=1"`
	ShippingAddress struct {
		Street  string `json:"street" binding:"required"`
		City    string `json:"city" binding:"required"`
		State   string `json:"state" binding:"required"`
		Zip     string `json:"zip" binding:"required"`
		Country string `json:"country" binding:"required"`
	} `json:"shipping_address" binding:"required"`
}

func (h *OrderHandler) List(c *gin.Context) {
	userID := c.GetString("userID")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))

	orders, total, err := h.orderService.ListByUser(c.Request.Context(), userID, page, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"orders": orders,
		"pagination": gin.H{
			"page":  page,
			"limit": limit,
			"total": total,
		},
	})
}

func (h *OrderHandler) Get(c *gin.Context) {
	id := c.Param("id")
	userID := c.GetString("userID")

	order, err := h.orderService.GetByID(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Order not found"})
		return
	}

	// Check ownership (unless admin)
	if order.UserID != userID && c.GetString("userRole") != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Not authorized"})
		return
	}

	c.JSON(http.StatusOK, order)
}

func (h *OrderHandler) Create(c *gin.Context) {
	userID := c.GetString("userID")

	var req CreateOrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	items := make([]service.OrderItem, len(req.Items))
	for i, item := range req.Items {
		items[i] = service.OrderItem{
			ProductID: item.ProductID,
			Quantity:  item.Quantity,
		}
	}

	order, err := h.orderService.Create(c.Request.Context(), service.CreateOrderInput{
		UserID: userID,
		Items:  items,
		ShippingAddress: service.Address{
			Street:  req.ShippingAddress.Street,
			City:    req.ShippingAddress.City,
			State:   req.ShippingAddress.State,
			Zip:     req.ShippingAddress.Zip,
			Country: req.ShippingAddress.Country,
		},
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, order)
}

func (h *OrderHandler) Cancel(c *gin.Context) {
	id := c.Param("id")
	userID := c.GetString("userID")

	order, err := h.orderService.GetByID(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Order not found"})
		return
	}

	// Check ownership
	if order.UserID != userID && c.GetString("userRole") != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Not authorized"})
		return
	}

	if err := h.orderService.Cancel(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Order cancelled"})
}

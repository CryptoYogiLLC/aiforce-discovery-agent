"""Database models for the e-commerce application."""

from django.db import models
from django.contrib.auth.models import User
from django.core.validators import MinValueValidator
from decimal import Decimal


class Category(models.Model):
    """Product category."""

    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    parent = models.ForeignKey(
        "self", on_delete=models.CASCADE, null=True, blank=True, related_name="children"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "categories"
        ordering = ["name"]

    def __str__(self):
        return self.name

    def get_full_path(self):
        """Get the full category path including parents."""
        if self.parent:
            return f"{self.parent.get_full_path()} > {self.name}"
        return self.name


class Product(models.Model):
    """Product in the catalog."""

    STATUS_CHOICES = [
        ("draft", "Draft"),
        ("active", "Active"),
        ("discontinued", "Discontinued"),
    ]

    sku = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=200)
    description = models.TextField()
    price = models.DecimalField(
        max_digits=10, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))]
    )
    category = models.ForeignKey(
        Category, on_delete=models.PROTECT, related_name="products"
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="draft")
    stock_quantity = models.PositiveIntegerField(default=0)
    weight = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    dimensions = models.JSONField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["sku"]),
            models.Index(fields=["status", "category"]),
        ]

    def __str__(self):
        return f"{self.sku} - {self.name}"

    def is_available(self):
        """Check if product is available for purchase."""
        return self.status == "active" and self.stock_quantity > 0

    def calculate_discount(self, discount_percent):
        """Calculate discounted price."""
        if discount_percent < 0 or discount_percent > 100:
            raise ValueError("Discount must be between 0 and 100")
        discount = self.price * Decimal(discount_percent) / 100
        return self.price - discount


class Customer(models.Model):
    """Customer profile linked to user account."""

    user = models.OneToOneField(User, on_delete=models.CASCADE)
    phone = models.CharField(max_length=20, blank=True)
    shipping_address = models.TextField(blank=True)
    billing_address = models.TextField(blank=True)
    loyalty_points = models.PositiveIntegerField(default=0)
    tier = models.CharField(max_length=20, default="bronze")
    preferences = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.username} ({self.tier})"

    def add_loyalty_points(self, points):
        """Add loyalty points and update tier if needed."""
        self.loyalty_points += points
        self._update_tier()
        self.save()

    def _update_tier(self):
        """Update customer tier based on loyalty points."""
        if self.loyalty_points >= 10000:
            self.tier = "platinum"
        elif self.loyalty_points >= 5000:
            self.tier = "gold"
        elif self.loyalty_points >= 1000:
            self.tier = "silver"
        else:
            self.tier = "bronze"


class Order(models.Model):
    """Customer order."""

    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("confirmed", "Confirmed"),
        ("processing", "Processing"),
        ("shipped", "Shipped"),
        ("delivered", "Delivered"),
        ("cancelled", "Cancelled"),
        ("refunded", "Refunded"),
    ]

    order_number = models.CharField(max_length=50, unique=True)
    customer = models.ForeignKey(
        Customer, on_delete=models.PROTECT, related_name="orders"
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    subtotal = models.DecimalField(max_digits=10, decimal_places=2)
    tax = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    shipping_cost = models.DecimalField(
        max_digits=10, decimal_places=2, default=Decimal("0.00")
    )
    total = models.DecimalField(max_digits=10, decimal_places=2)
    shipping_address = models.TextField()
    billing_address = models.TextField()
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    shipped_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["order_number"]),
            models.Index(fields=["status", "customer"]),
        ]

    def __str__(self):
        return f"Order {self.order_number}"

    def calculate_total(self):
        """Recalculate order total from items."""
        self.subtotal = sum(item.total for item in self.items.all())
        self.total = self.subtotal + self.tax + self.shipping_cost
        return self.total


class OrderItem(models.Model):
    """Individual item in an order."""

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey(Product, on_delete=models.PROTECT)
    quantity = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    total = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        unique_together = ["order", "product"]

    def save(self, *args, **kwargs):
        self.total = self.unit_price * self.quantity
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.quantity}x {self.product.name}"

"""Tests for the e-commerce application."""

from decimal import Decimal
from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APITestCase
from rest_framework import status

from .models import Product, Category, Customer


class CategoryModelTest(TestCase):
    """Tests for Category model."""

    def setUp(self):
        self.parent_category = Category.objects.create(
            name="Electronics", description="Electronic devices"
        )
        self.child_category = Category.objects.create(
            name="Phones", description="Mobile phones", parent=self.parent_category
        )

    def test_category_str(self):
        """Test category string representation."""
        self.assertEqual(str(self.parent_category), "Electronics")

    def test_full_path(self):
        """Test category full path generation."""
        self.assertEqual(self.child_category.get_full_path(), "Electronics > Phones")


class ProductModelTest(TestCase):
    """Tests for Product model."""

    def setUp(self):
        self.category = Category.objects.create(name="Test Category")
        self.product = Product.objects.create(
            sku="TEST-001",
            name="Test Product",
            description="A test product",
            price=Decimal("99.99"),
            category=self.category,
            status="active",
            stock_quantity=100,
        )

    def test_product_str(self):
        """Test product string representation."""
        self.assertEqual(str(self.product), "TEST-001 - Test Product")

    def test_is_available(self):
        """Test product availability check."""
        self.assertTrue(self.product.is_available())

        self.product.stock_quantity = 0
        self.assertFalse(self.product.is_available())

        self.product.stock_quantity = 100
        self.product.status = "discontinued"
        self.assertFalse(self.product.is_available())

    def test_calculate_discount(self):
        """Test discount calculation."""
        discounted = self.product.calculate_discount(10)
        self.assertEqual(discounted, Decimal("89.991"))

        discounted = self.product.calculate_discount(50)
        self.assertEqual(discounted, Decimal("49.995"))

    def test_invalid_discount(self):
        """Test invalid discount raises error."""
        with self.assertRaises(ValueError):
            self.product.calculate_discount(-10)

        with self.assertRaises(ValueError):
            self.product.calculate_discount(150)


class CustomerModelTest(TestCase):
    """Tests for Customer model."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser", email="test@example.com", password="testpass123"
        )
        self.customer = Customer.objects.create(
            user=self.user, phone="555-0100", tier="bronze"
        )

    def test_customer_str(self):
        """Test customer string representation."""
        self.assertEqual(str(self.customer), "testuser (bronze)")

    def test_loyalty_tier_upgrade(self):
        """Test loyalty tier upgrades."""
        self.assertEqual(self.customer.tier, "bronze")

        self.customer.add_loyalty_points(1000)
        self.assertEqual(self.customer.tier, "silver")

        self.customer.add_loyalty_points(4000)
        self.assertEqual(self.customer.tier, "gold")

        self.customer.add_loyalty_points(5000)
        self.assertEqual(self.customer.tier, "platinum")


class ProductAPITest(APITestCase):
    """API tests for Product endpoints."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser", password="testpass123"
        )
        self.category = Category.objects.create(name="Electronics")
        self.product = Product.objects.create(
            sku="ELEC-001",
            name="Smartphone",
            description="A smartphone",
            price=Decimal("599.99"),
            category=self.category,
            status="active",
            stock_quantity=50,
        )
        self.client.force_authenticate(user=self.user)

    def test_list_products(self):
        """Test listing products."""
        response = self.client.get("/api/products/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 1)

    def test_filter_by_category(self):
        """Test filtering products by category."""
        response = self.client.get("/api/products/", {"category": "Electronics"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 1)

        response = self.client.get("/api/products/", {"category": "Clothing"})
        self.assertEqual(len(response.data["results"]), 0)

    def test_search_products(self):
        """Test searching products."""
        response = self.client.get("/api/products/", {"search": "Smart"})
        self.assertEqual(len(response.data["results"]), 1)

        response = self.client.get("/api/products/", {"search": "Laptop"})
        self.assertEqual(len(response.data["results"]), 0)

    def test_update_stock(self):
        """Test updating product stock."""
        response = self.client.post(
            f"/api/products/{self.product.id}/update_stock/", {"quantity": 100}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 100)

    def test_low_stock(self):
        """Test low stock endpoint."""
        self.product.stock_quantity = 5
        self.product.save()

        response = self.client.get("/api/products/low_stock/", {"threshold": 10})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)


class OrderAPITest(APITestCase):
    """API tests for Order endpoints."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser", password="testpass123"
        )
        self.customer = Customer.objects.create(
            user=self.user,
            shipping_address="123 Test St",
            billing_address="123 Test St",
        )
        self.category = Category.objects.create(name="Test")
        self.product = Product.objects.create(
            sku="TEST-001",
            name="Test Product",
            description="Test",
            price=Decimal("25.00"),
            category=self.category,
            status="active",
            stock_quantity=10,
        )
        self.client.force_authenticate(user=self.user)

    def test_create_order(self):
        """Test creating an order."""
        response = self.client.post(
            "/api/orders/",
            {"items": [{"product_id": self.product.id, "quantity": 2}]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("order_number", response.data)

    def test_order_statistics(self):
        """Test order statistics endpoint."""
        response = self.client.get("/api/orders/statistics/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("summary", response.data)
        self.assertIn("by_status", response.data)

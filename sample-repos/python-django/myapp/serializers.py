"""Serializers for the e-commerce API."""

from rest_framework import serializers
from .models import Product, Order, OrderItem, Customer, Category


class CategorySerializer(serializers.ModelSerializer):
    """Serializer for Category model."""

    full_path = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = ["id", "name", "description", "parent", "full_path", "created_at"]

    def get_full_path(self, obj):
        return obj.get_full_path()


class ProductSerializer(serializers.ModelSerializer):
    """Serializer for Product model."""

    category_name = serializers.CharField(source="category.name", read_only=True)
    is_available = serializers.BooleanField(read_only=True)

    class Meta:
        model = Product
        fields = [
            "id",
            "sku",
            "name",
            "description",
            "price",
            "category",
            "category_name",
            "status",
            "stock_quantity",
            "weight",
            "dimensions",
            "is_available",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]


class OrderItemSerializer(serializers.ModelSerializer):
    """Serializer for OrderItem model."""

    product_name = serializers.CharField(source="product.name", read_only=True)
    product_sku = serializers.CharField(source="product.sku", read_only=True)

    class Meta:
        model = OrderItem
        fields = [
            "id",
            "product",
            "product_name",
            "product_sku",
            "quantity",
            "unit_price",
            "total",
        ]
        read_only_fields = ["unit_price", "total"]


class OrderSerializer(serializers.ModelSerializer):
    """Serializer for Order model."""

    items = OrderItemSerializer(many=True, read_only=True)
    customer_name = serializers.CharField(
        source="customer.user.username", read_only=True
    )

    class Meta:
        model = Order
        fields = [
            "id",
            "order_number",
            "customer",
            "customer_name",
            "status",
            "subtotal",
            "tax",
            "shipping_cost",
            "total",
            "shipping_address",
            "billing_address",
            "notes",
            "items",
            "created_at",
            "updated_at",
            "shipped_at",
            "delivered_at",
        ]
        read_only_fields = [
            "order_number",
            "subtotal",
            "total",
            "created_at",
            "updated_at",
        ]


class CustomerSerializer(serializers.ModelSerializer):
    """Serializer for Customer model."""

    username = serializers.CharField(source="user.username", read_only=True)
    email = serializers.EmailField(source="user.email", read_only=True)

    class Meta:
        model = Customer
        fields = [
            "id",
            "username",
            "email",
            "phone",
            "shipping_address",
            "billing_address",
            "loyalty_points",
            "tier",
            "created_at",
        ]
        read_only_fields = ["loyalty_points", "tier", "created_at"]

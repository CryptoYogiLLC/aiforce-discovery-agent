"""API views for the e-commerce application."""

from django.shortcuts import get_object_or_404
from django.db import transaction
from django.db.models import Sum, Count, Avg
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import api_view, action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import Product, Order, OrderItem, Customer
from .serializers import (
    ProductSerializer,
    OrderSerializer,
    CustomerSerializer,
)
from .tasks import send_order_confirmation_email, update_inventory


class ProductViewSet(viewsets.ModelViewSet):
    """ViewSet for Product CRUD operations."""

    queryset = Product.objects.select_related("category").all()
    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """Filter products based on query parameters."""
        queryset = super().get_queryset()

        # Filter by category
        category = self.request.query_params.get("category")
        if category:
            queryset = queryset.filter(category__name__iexact=category)

        # Filter by status
        status_filter = self.request.query_params.get("status")
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        # Filter by price range
        min_price = self.request.query_params.get("min_price")
        max_price = self.request.query_params.get("max_price")
        if min_price:
            queryset = queryset.filter(price__gte=min_price)
        if max_price:
            queryset = queryset.filter(price__lte=max_price)

        # Search by name
        search = self.request.query_params.get("search")
        if search:
            queryset = queryset.filter(name__icontains=search)

        return queryset

    @action(detail=True, methods=["post"])
    def update_stock(self, request, pk=None):
        """Update product stock quantity."""
        product = self.get_object()
        quantity = request.data.get("quantity")

        if quantity is None:
            return Response(
                {"error": "Quantity is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            quantity = int(quantity)
            if quantity < 0:
                raise ValueError("Quantity cannot be negative")
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        product.stock_quantity = quantity
        product.save()
        return Response(ProductSerializer(product).data)

    @action(detail=False, methods=["get"])
    def low_stock(self, request):
        """Get products with low stock."""
        threshold = int(request.query_params.get("threshold", 10))
        products = self.get_queryset().filter(
            stock_quantity__lte=threshold, status="active"
        )
        return Response(ProductSerializer(products, many=True).data)


class OrderViewSet(viewsets.ModelViewSet):
    """ViewSet for Order operations."""

    queryset = (
        Order.objects.select_related("customer__user")
        .prefetch_related("items__product")
        .all()
    )
    serializer_class = OrderSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """Filter orders for the current user."""
        queryset = super().get_queryset()

        # Non-staff users can only see their own orders
        if not self.request.user.is_staff:
            queryset = queryset.filter(customer__user=self.request.user)

        # Filter by status
        status_filter = self.request.query_params.get("status")
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        return queryset

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        """Create a new order with items."""
        items_data = request.data.pop("items", [])

        if not items_data:
            return Response(
                {"error": "Order must contain at least one item"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Get or create customer
        customer = get_object_or_404(Customer, user=request.user)

        # Create order
        order = Order.objects.create(
            customer=customer,
            shipping_address=request.data.get(
                "shipping_address", customer.shipping_address
            ),
            billing_address=request.data.get(
                "billing_address", customer.billing_address
            ),
            subtotal=0,
            total=0,
            order_number=self._generate_order_number(),
        )

        # Create order items
        for item_data in items_data:
            product = get_object_or_404(Product, pk=item_data["product_id"])

            if not product.is_available():
                transaction.set_rollback(True)
                return Response(
                    {"error": f"Product {product.sku} is not available"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            quantity = item_data["quantity"]
            if quantity > product.stock_quantity:
                transaction.set_rollback(True)
                return Response(
                    {"error": f"Insufficient stock for {product.sku}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            OrderItem.objects.create(
                order=order,
                product=product,
                quantity=quantity,
                unit_price=product.price,
            )

            # Update stock
            update_inventory.delay(product.id, -quantity)

        # Calculate totals
        order.calculate_total()
        order.save()

        # Send confirmation email
        send_order_confirmation_email.delay(order.id)

        return Response(OrderSerializer(order).data, status=status.HTTP_201_CREATED)

    def _generate_order_number(self):
        """Generate a unique order number."""
        import uuid

        return f"ORD-{uuid.uuid4().hex[:8].upper()}"

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        """Cancel an order."""
        order = self.get_object()

        if order.status not in ["pending", "confirmed"]:
            return Response(
                {"error": "Only pending or confirmed orders can be cancelled"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            # Restore stock
            for item in order.items.all():
                update_inventory.delay(item.product.id, item.quantity)

            order.status = "cancelled"
            order.save()

        return Response(OrderSerializer(order).data)

    @action(detail=False, methods=["get"])
    def statistics(self, request):
        """Get order statistics."""
        queryset = self.get_queryset()

        stats = queryset.aggregate(
            total_orders=Count("id"),
            total_revenue=Sum("total"),
            average_order_value=Avg("total"),
        )

        status_breakdown = queryset.values("status").annotate(count=Count("id"))

        return Response({"summary": stats, "by_status": list(status_breakdown)})


class CustomerViewSet(viewsets.ModelViewSet):
    """ViewSet for Customer operations."""

    queryset = Customer.objects.select_related("user").all()
    serializer_class = CustomerSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """Non-staff users can only see their own profile."""
        queryset = super().get_queryset()
        if not self.request.user.is_staff:
            queryset = queryset.filter(user=self.request.user)
        return queryset

    @action(detail=True, methods=["get"])
    def order_history(self, request, pk=None):
        """Get customer's order history."""
        customer = self.get_object()
        orders = Order.objects.filter(customer=customer).order_by("-created_at")[:20]
        return Response(OrderSerializer(orders, many=True).data)


@api_view(["GET"])
def health_check(request):
    """Health check endpoint."""
    return Response({"status": "healthy", "timestamp": timezone.now().isoformat()})


@api_view(["GET"])
def metrics(request):
    """Basic metrics endpoint."""
    return Response(
        {
            "products": {
                "total": Product.objects.count(),
                "active": Product.objects.filter(status="active").count(),
                "low_stock": Product.objects.filter(stock_quantity__lte=10).count(),
            },
            "orders": {
                "total": Order.objects.count(),
                "pending": Order.objects.filter(status="pending").count(),
                "today": Order.objects.filter(
                    created_at__date=timezone.now().date()
                ).count(),
            },
            "customers": {
                "total": Customer.objects.count(),
            },
        }
    )

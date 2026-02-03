"""Celery tasks for async operations."""

from celery import shared_task
from django.core.mail import send_mail
from django.conf import settings


@shared_task
def send_order_confirmation_email(order_id):
    """Send order confirmation email to customer."""
    from .models import Order

    try:
        order = Order.objects.select_related("customer__user").get(id=order_id)
        customer_email = order.customer.user.email

        subject = f"Order Confirmation - {order.order_number}"
        message = f"""
        Thank you for your order!

        Order Number: {order.order_number}
        Total: ${order.total}

        Items:
        """

        for item in order.items.all():
            message += f"\n  - {item.quantity}x {item.product.name}: ${item.total}"

        message += f"""

        Shipping Address:
        {order.shipping_address}

        You will receive another email when your order ships.
        """

        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[customer_email],
            fail_silently=False,
        )

        return {"status": "sent", "order_id": order_id}

    except Order.DoesNotExist:
        return {"status": "error", "message": f"Order {order_id} not found"}


@shared_task
def update_inventory(product_id, quantity_change):
    """Update product inventory."""
    from .models import Product
    from django.db.models import F

    Product.objects.filter(id=product_id).update(
        stock_quantity=F("stock_quantity") + quantity_change
    )

    return {"product_id": product_id, "change": quantity_change}


@shared_task
def generate_daily_report():
    """Generate daily sales report."""
    from .models import Order
    from django.utils import timezone
    from datetime import timedelta

    yesterday = timezone.now().date() - timedelta(days=1)

    orders = Order.objects.filter(
        created_at__date=yesterday,
        status__in=["confirmed", "processing", "shipped", "delivered"],
    )

    report = {
        "date": str(yesterday),
        "total_orders": orders.count(),
        "total_revenue": sum(order.total for order in orders),
        "average_order_value": (
            sum(order.total for order in orders) / orders.count()
            if orders.count() > 0
            else 0
        ),
    }

    return report


@shared_task
def cleanup_abandoned_carts():
    """Clean up abandoned shopping carts older than 7 days."""
    # Placeholder for cart cleanup logic
    return {"status": "completed", "cleaned": 0}

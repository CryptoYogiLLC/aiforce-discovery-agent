"""URL configuration for myapp project."""

from django.contrib import admin
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r"products", views.ProductViewSet)
router.register(r"orders", views.OrderViewSet)
router.register(r"customers", views.CustomerViewSet)

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include(router.urls)),
    path("api/health/", views.health_check, name="health-check"),
    path("api/metrics/", views.metrics, name="metrics"),
]

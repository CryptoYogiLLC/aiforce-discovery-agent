import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ordersApi } from "../services/api";
import { format } from "date-fns";
import type { Order } from "../types";

const statusColors: Record<string, string> = {
  pending: "#f59e0b",
  confirmed: "#3b82f6",
  processing: "#8b5cf6",
  shipped: "#06b6d4",
  delivered: "#22c55e",
  cancelled: "#ef4444",
};

export default function OrdersPage() {
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["orders"],
    queryFn: () => ordersApi.list(),
  });

  const cancelMutation = useMutation({
    mutationFn: (orderId: string) => ordersApi.cancel(orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      setSelectedOrder(null);
    },
  });

  if (isLoading) {
    return <div className="loading">Loading orders...</div>;
  }

  if (error) {
    return <div className="error">Failed to load orders</div>;
  }

  const orders: Order[] = data?.orders || [];

  return (
    <div className="orders-page">
      <h1>My Orders</h1>

      {orders.length === 0 ? (
        <div className="no-orders">
          <p>You haven't placed any orders yet.</p>
        </div>
      ) : (
        <div className="orders-list">
          {orders.map((order) => (
            <div key={order.id} className="order-card">
              <div className="order-header">
                <div>
                  <h3>Order #{order.orderNumber}</h3>
                  <p className="order-date">
                    {format(new Date(order.createdAt), "MMM d, yyyy h:mm a")}
                  </p>
                </div>
                <span
                  className="status-badge"
                  style={{ backgroundColor: statusColors[order.status] }}
                >
                  {order.status}
                </span>
              </div>

              <div className="order-items">
                {order.items.map((item, idx) => (
                  <div key={idx} className="order-item">
                    <span>
                      {item.quantity}x {item.productName || item.productId}
                    </span>
                    <span>${item.total.toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <div className="order-footer">
                <div className="order-total">
                  <span>Total:</span>
                  <span>${order.total.toFixed(2)}</span>
                </div>
                <div className="order-actions">
                  <button
                    className="btn btn-outline"
                    onClick={() => setSelectedOrder(order)}
                  >
                    View Details
                  </button>
                  {(order.status === "pending" ||
                    order.status === "confirmed") && (
                    <button
                      className="btn btn-danger"
                      onClick={() => cancelMutation.mutate(order.id)}
                      disabled={cancelMutation.isPending}
                    >
                      Cancel Order
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedOrder && (
        <div className="modal-overlay" onClick={() => setSelectedOrder(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Order Details</h2>
            <p>Order #{selectedOrder.orderNumber}</p>
            <p>Status: {selectedOrder.status}</p>
            <p>Total: ${selectedOrder.total.toFixed(2)}</p>
            <button className="btn" onClick={() => setSelectedOrder(null)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

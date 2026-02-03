import { Link } from "react-router-dom";
import { useCart } from "../hooks/useCart";
import { useAuthStore } from "../hooks/useAuthStore";

export default function CartPage() {
  const { items, updateQuantity, removeItem, getTotal, clearCart } = useCart();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  if (items.length === 0) {
    return (
      <div className="cart-page empty">
        <h1>Your Cart</h1>
        <p>Your cart is empty</p>
        <Link to="/products" className="btn btn-primary">
          Continue Shopping
        </Link>
      </div>
    );
  }

  const subtotal = getTotal();
  const shipping = subtotal > 100 ? 0 : 9.99;
  const tax = subtotal * 0.08;
  const total = subtotal + shipping + tax;

  return (
    <div className="cart-page">
      <h1>Your Cart</h1>

      <div className="cart-layout">
        <div className="cart-items">
          {items.map((item) => (
            <div key={item.productId} className="cart-item">
              <div className="item-image">
                {item.image ? (
                  <img src={item.image} alt={item.name} />
                ) : (
                  <div className="placeholder-image">No Image</div>
                )}
              </div>

              <div className="item-details">
                <h3>{item.name}</h3>
                <p className="price">${item.price.toFixed(2)}</p>
              </div>

              <div className="item-quantity">
                <button
                  onClick={() =>
                    updateQuantity(item.productId, item.quantity - 1)
                  }
                >
                  -
                </button>
                <span>{item.quantity}</span>
                <button
                  onClick={() =>
                    updateQuantity(item.productId, item.quantity + 1)
                  }
                >
                  +
                </button>
              </div>

              <div className="item-total">
                ${(item.price * item.quantity).toFixed(2)}
              </div>

              <button
                className="remove-btn"
                onClick={() => removeItem(item.productId)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <div className="cart-summary">
          <h2>Order Summary</h2>

          <div className="summary-row">
            <span>Subtotal</span>
            <span>${subtotal.toFixed(2)}</span>
          </div>

          <div className="summary-row">
            <span>Shipping</span>
            <span>{shipping === 0 ? "Free" : `$${shipping.toFixed(2)}`}</span>
          </div>

          <div className="summary-row">
            <span>Tax (8%)</span>
            <span>${tax.toFixed(2)}</span>
          </div>

          <div className="summary-row total">
            <span>Total</span>
            <span>${total.toFixed(2)}</span>
          </div>

          {isAuthenticated ? (
            <Link to="/checkout" className="btn btn-primary btn-large">
              Proceed to Checkout
            </Link>
          ) : (
            <Link to="/login" className="btn btn-primary btn-large">
              Login to Checkout
            </Link>
          )}

          <button className="btn btn-outline" onClick={clearCart}>
            Clear Cart
          </button>
        </div>
      </div>
    </div>
  );
}

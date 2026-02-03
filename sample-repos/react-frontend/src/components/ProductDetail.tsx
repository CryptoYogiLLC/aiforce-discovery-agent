import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { productsApi } from "../services/api";
import { useCart } from "../hooks/useCart";

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const addItem = useCart((state) => state.addItem);

  const {
    data: product,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["product", id],
    queryFn: () => productsApi.get(id!),
    enabled: !!id,
  });

  if (isLoading) {
    return <div className="loading">Loading product...</div>;
  }

  if (error || !product) {
    return (
      <div className="error">
        <h2>Product not found</h2>
        <Link to="/products">Back to Products</Link>
      </div>
    );
  }

  const handleAddToCart = () => {
    addItem({
      productId: product.id,
      name: product.name,
      price: product.price,
      image: product.images?.[0]?.url,
    });
  };

  return (
    <div className="product-detail">
      <div className="breadcrumb">
        <Link to="/products">Products</Link> / {product.name}
      </div>

      <div className="product-layout">
        <div className="product-images">
          {product.images?.length > 0 ? (
            <img src={product.images[0].url} alt={product.name} />
          ) : (
            <div className="placeholder-image large">No Image</div>
          )}
        </div>

        <div className="product-info">
          <p className="sku">SKU: {product.sku}</p>
          <h1>{product.name}</h1>
          <p className="category">{product.category}</p>
          <p className="price">${product.price.toFixed(2)}</p>
          <p className="description">{product.description}</p>

          <div className="stock-status">
            {product.stock > 0 ? (
              <span className="in-stock">{product.stock} in stock</span>
            ) : (
              <span className="out-of-stock">Out of stock</span>
            )}
          </div>

          <button
            className="btn btn-primary btn-large"
            onClick={handleAddToCart}
            disabled={product.stock === 0}
          >
            Add to Cart
          </button>
        </div>
      </div>
    </div>
  );
}

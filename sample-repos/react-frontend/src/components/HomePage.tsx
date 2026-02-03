import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { productsApi } from "../services/api";
import type { Product } from "../types";

export default function HomePage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["featuredProducts"],
    queryFn: () => productsApi.list({ page: 1 }),
  });

  if (isLoading) {
    return <div className="loading">Loading...</div>;
  }

  if (error) {
    return <div className="error">Failed to load products</div>;
  }

  const products = data?.products || [];

  return (
    <div className="home-page">
      <section className="hero">
        <h1>Welcome to Sample Store</h1>
        <p>Discover our amazing products</p>
        <Link to="/products" className="btn btn-primary">
          Shop Now
        </Link>
      </section>

      <section className="featured">
        <h2>Featured Products</h2>
        <div className="product-grid">
          {products.slice(0, 4).map((product: Product) => (
            <div key={product.id} className="product-card">
              <div className="product-image">
                {product.images?.[0] ? (
                  <img src={product.images[0].url} alt={product.name} />
                ) : (
                  <div className="placeholder-image">No Image</div>
                )}
              </div>
              <h3>{product.name}</h3>
              <p className="price">${product.price.toFixed(2)}</p>
              <Link to={`/products/${product.id}`} className="btn btn-outline">
                View Details
              </Link>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

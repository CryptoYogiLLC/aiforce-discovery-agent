import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { productsApi } from "../services/api";
import { useCart } from "../hooks/useCart";
import type { Product } from "../types";

export default function ProductsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = parseInt(searchParams.get("page") || "1");
  const category = searchParams.get("category") || "";

  const addItem = useCart((state) => state.addItem);

  const { data, isLoading, error } = useQuery({
    queryKey: ["products", page, category],
    queryFn: () => productsApi.list({ page, category: category || undefined }),
  });

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: () => productsApi.getCategories(),
  });

  const handleAddToCart = (product: Product) => {
    addItem({
      productId: product.id,
      name: product.name,
      price: product.price,
      image: product.images?.[0]?.url,
    });
  };

  if (isLoading) {
    return <div className="loading">Loading products...</div>;
  }

  if (error) {
    return <div className="error">Failed to load products</div>;
  }

  const products = data?.products || [];
  const pagination = data?.pagination;

  return (
    <div className="products-page">
      <div className="sidebar">
        <h3>Categories</h3>
        <ul className="category-list">
          <li>
            <button
              className={!category ? "active" : ""}
              onClick={() => setSearchParams({})}
            >
              All Products
            </button>
          </li>
          {categories?.map((cat: string) => (
            <li key={cat}>
              <button
                className={category === cat ? "active" : ""}
                onClick={() => setSearchParams({ category: cat })}
              >
                {cat}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="products-content">
        <h1>Products {category && `- ${category}`}</h1>

        <div className="product-grid">
          {products.map((product: Product) => (
            <div key={product.id} className="product-card">
              <div className="product-image">
                {product.images?.[0] ? (
                  <img src={product.images[0].url} alt={product.name} />
                ) : (
                  <div className="placeholder-image">No Image</div>
                )}
              </div>
              <h3>
                <Link to={`/products/${product.id}`}>{product.name}</Link>
              </h3>
              <p className="category">{product.category}</p>
              <p className="price">${product.price.toFixed(2)}</p>
              <p className="stock">
                {product.stock > 0
                  ? `${product.stock} in stock`
                  : "Out of stock"}
              </p>
              <button
                className="btn btn-primary"
                onClick={() => handleAddToCart(product)}
                disabled={product.stock === 0}
              >
                Add to Cart
              </button>
            </div>
          ))}
        </div>

        {pagination && pagination.pages > 1 && (
          <div className="pagination">
            <button
              disabled={page === 1}
              onClick={() =>
                setSearchParams({
                  page: String(page - 1),
                  ...(category && { category }),
                })
              }
            >
              Previous
            </button>
            <span>
              Page {page} of {pagination.pages}
            </span>
            <button
              disabled={page === pagination.pages}
              onClick={() =>
                setSearchParams({
                  page: String(page + 1),
                  ...(category && { category }),
                })
              }
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

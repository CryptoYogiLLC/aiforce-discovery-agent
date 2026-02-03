export interface User {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin";
  createdAt: string;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string;
  price: number;
  category: string;
  stock: number;
  status: "active" | "inactive" | "deleted";
  images?: Array<{ url: string; alt: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  productId: string;
  productName?: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  userId: string;
  items: OrderItem[];
  shippingAddress: Address;
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
  shippedAt?: string;
  deliveredAt?: string;
}

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled";

export interface Address {
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface ApiError {
  error: string;
  message?: string;
  details?: Record<string, string[]>;
}

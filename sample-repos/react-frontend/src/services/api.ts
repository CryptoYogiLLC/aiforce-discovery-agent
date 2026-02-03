import axios from "axios";
import { useAuthStore } from "../hooks/useAuthStore";

const api = axios.create({
  baseURL: "/api",
  headers: {
    "Content-Type": "application/json",
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);

// Auth API
export const authApi = {
  login: async (email: string, password: string) => {
    const { data } = await api.post("/auth/login", { email, password });
    return data;
  },

  register: async (email: string, password: string, name: string) => {
    const { data } = await api.post("/auth/register", {
      email,
      password,
      name,
    });
    return data;
  },

  getProfile: async () => {
    const { data } = await api.get("/users/me");
    return data;
  },
};

// Products API
export const productsApi = {
  list: async (params?: {
    page?: number;
    category?: string;
    search?: string;
  }) => {
    const { data } = await api.get("/products", { params });
    return data;
  },

  get: async (id: string) => {
    const { data } = await api.get(`/products/${id}`);
    return data;
  },

  getCategories: async () => {
    const { data } = await api.get("/products/categories");
    return data;
  },
};

// Orders API
export const ordersApi = {
  list: async (params?: { page?: number; status?: string }) => {
    const { data } = await api.get("/orders", { params });
    return data;
  },

  get: async (id: string) => {
    const { data } = await api.get(`/orders/${id}`);
    return data;
  },

  create: async (orderData: {
    items: Array<{ productId: string; quantity: number }>;
    shippingAddress: {
      street: string;
      city: string;
      state: string;
      zip: string;
      country: string;
    };
  }) => {
    const { data } = await api.post("/orders", orderData);
    return data;
  },

  cancel: async (id: string) => {
    const { data } = await api.post(`/orders/${id}/cancel`);
    return data;
  },
};

export default api;

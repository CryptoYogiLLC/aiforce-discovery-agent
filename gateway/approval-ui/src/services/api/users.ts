import type {
  User,
  UserListResult,
  UserRole,
  CreateUserInput,
  UpdateUserInput,
} from "../../types";
import { API_BASE, fetchJSON } from "./utils";

export const users = {
  list: (params?: {
    page?: number;
    limit?: number;
    role?: UserRole;
    is_active?: boolean;
  }): Promise<UserListResult> => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.role) searchParams.set("role", params.role);
    if (params?.is_active !== undefined)
      searchParams.set("is_active", String(params.is_active));
    return fetchJSON(`${API_BASE}/users?${searchParams}`);
  },

  get: (id: string): Promise<User> => {
    return fetchJSON(`${API_BASE}/users/${id}`);
  },

  create: (data: CreateUserInput, csrfToken: string): Promise<User> => {
    return fetchJSON(`${API_BASE}/users`, {
      method: "POST",
      headers: { "X-CSRF-Token": csrfToken },
      body: JSON.stringify(data),
    });
  },

  update: (
    id: string,
    data: UpdateUserInput,
    csrfToken: string,
  ): Promise<User> => {
    return fetchJSON(`${API_BASE}/users/${id}`, {
      method: "PATCH",
      headers: { "X-CSRF-Token": csrfToken },
      body: JSON.stringify(data),
    });
  },

  deactivate: (id: string, csrfToken: string): Promise<{ message: string }> => {
    return fetchJSON(`${API_BASE}/users/${id}/deactivate`, {
      method: "POST",
      headers: { "X-CSRF-Token": csrfToken },
    });
  },

  reactivate: (id: string, csrfToken: string): Promise<{ message: string }> => {
    return fetchJSON(`${API_BASE}/users/${id}/reactivate`, {
      method: "POST",
      headers: { "X-CSRF-Token": csrfToken },
    });
  },

  resetPassword: (
    userId: string,
    csrfToken: string,
  ): Promise<{ recovery_code: string; expires_at: string }> => {
    return fetchJSON(`${API_BASE}/auth/reset-password`, {
      method: "POST",
      headers: { "X-CSRF-Token": csrfToken },
      body: JSON.stringify({ user_id: userId }),
    });
  },
};

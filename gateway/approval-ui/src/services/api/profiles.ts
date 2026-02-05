import type {
  ConfigProfileFull,
  CreateProfileInput,
  UpdateProfileInput,
} from "../../types";
import {
  API_BASE,
  fetchJSON,
  mapBackendProfile,
  flattenCreateInput,
  flattenUpdateInput,
} from "./utils";

export const profiles = {
  list: async (params?: {
    profile_type?: string;
  }): Promise<ConfigProfileFull[]> => {
    const searchParams = new URLSearchParams();
    if (params?.profile_type)
      searchParams.set("profile_type", params.profile_type);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await fetchJSON<{ profiles: any[] }>(
      `${API_BASE}/profiles?${searchParams}`,
    );
    return data.profiles.map(mapBackendProfile);
  },

  get: async (id: string): Promise<ConfigProfileFull> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await fetchJSON<{ profile: any }>(
      `${API_BASE}/profiles/${id}`,
    );
    return mapBackendProfile(data.profile);
  },

  create: async (
    data: CreateProfileInput,
    csrfToken: string,
  ): Promise<ConfigProfileFull> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await fetchJSON<{ profile: any; message: string }>(
      `${API_BASE}/profiles`,
      {
        method: "POST",
        headers: { "X-CSRF-Token": csrfToken },
        body: JSON.stringify(flattenCreateInput(data)),
      },
    );
    return mapBackendProfile(response.profile);
  },

  update: async (
    id: string,
    data: UpdateProfileInput,
    csrfToken: string,
  ): Promise<ConfigProfileFull> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await fetchJSON<{ profile: any; message: string }>(
      `${API_BASE}/profiles/${id}`,
      {
        method: "PATCH",
        headers: { "X-CSRF-Token": csrfToken },
        body: JSON.stringify(flattenUpdateInput(data)),
      },
    );
    return mapBackendProfile(response.profile);
  },

  clone: async (
    id: string,
    name: string,
    csrfToken: string,
  ): Promise<ConfigProfileFull> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await fetchJSON<{ profile: any; message: string }>(
      `${API_BASE}/profiles/${id}/clone`,
      {
        method: "POST",
        headers: { "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ name }),
      },
    );
    return mapBackendProfile(response.profile);
  },

  delete: (id: string, csrfToken: string): Promise<{ message: string }> => {
    return fetchJSON(`${API_BASE}/profiles/${id}`, {
      method: "DELETE",
      headers: { "X-CSRF-Token": csrfToken },
    });
  },

  exportYaml: (id: string): Promise<{ yaml: string }> => {
    return fetchJSON(`${API_BASE}/profiles/${id}/export`);
  },

  importYaml: async (
    yaml: string,
    csrfToken: string,
  ): Promise<ConfigProfileFull> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await fetchJSON<{ profile: any; message: string }>(
      `${API_BASE}/profiles/import`,
      {
        method: "POST",
        headers: { "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ yaml }),
      },
    );
    return mapBackendProfile(response.profile);
  },
};

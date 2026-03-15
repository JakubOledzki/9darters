const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

export type ApiError = {
  error: string;
  details?: unknown;
};

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const hasJsonBody = typeof init?.body === "string";
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      ...(hasJsonBody ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {})
    },
    ...init
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw payload as ApiError;
  }

  return payload as T;
}

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";
let authToken: string | null = null;

export const setAuthToken = (token: string | null) => {
  authToken = token;
};

type FetchOptions = RequestInit & {
  skipJson?: boolean;
};

export async function apiFetch<TResponse = any>(
  path: string,
  options: FetchOptions = {}
): Promise<TResponse> {
  const { skipJson, headers, ...rest } = options;

  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...headers,
    },
    ...rest,
  });

  if (skipJson) {
    if (!res.ok) {
      throw new Error(res.statusText);
    }
    return undefined;
  }

  const data = await res.json();

  if (!res.ok) {
    const message = data?.message || "Request failed";
    throw new Error(message);
  }

  return data;
}

export { API_URL };


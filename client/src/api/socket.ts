import { io } from "socket.io-client";

export const gameSocket = io({ autoConnect: true, reconnection: true, reconnectionDelayMax: 3000 });

export async function control<T>(path: string, body?: unknown, method: "GET" | "POST" = body === undefined ? "GET" : "POST"): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method,
    headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
    body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
  });
  if (!response.ok) {
    const result = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(result?.error ?? `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

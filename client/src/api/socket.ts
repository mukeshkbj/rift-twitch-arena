import { io } from "socket.io-client";

export const gameSocket = io({ autoConnect: true, reconnection: true, reconnectionDelayMax: 3000 });

export async function control<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(result?.error ?? `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

import type { QueryClient } from "@tanstack/react-query";

/**
 * The app's single `QueryClient`, reachable from non-React code.
 *
 * React Query normally hands the client to components through context, but
 * logout is a Zustand action with no component to read it from, and it must
 * drop cached server state that belongs to the account being signed out (the
 * push-status probe). `QueryProvider` registers the instance here; logout reads
 * it. There is exactly one client per page, so a module-level reference is the
 * whole story.
 */
let appQueryClient: QueryClient | null = null;

export function setAppQueryClient(client: QueryClient | null): void {
  appQueryClient = client;
}

export function getAppQueryClient(): QueryClient | null {
  return appQueryClient;
}

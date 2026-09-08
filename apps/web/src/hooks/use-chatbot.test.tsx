import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

// `vi.mock` diangkat ke atas berkas, jadi pabriknya tidak boleh menyentuh
// variabel modul. `vi.hoisted` menaruh mocknya di ketinggian yang sama.
const { post } = vi.hoisted(() => ({ post: vi.fn() }));
// Modul ini punya ekspor default DAN bernama; keduanya harus ada di mock.
vi.mock("@/lib/api", () => {
  const api = { post, get: vi.fn() };
  return { api, default: api };
});

import { usePublicChat } from "./use-chatbot";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => vi.clearAllMocks());

describe("usePublicChat", () => {
  it("meminta toast galat global DIMATIKAN", async () => {
    // Widget menulis pesannya sendiri ke dalam gelembung percakapan. Tanpa
    // bendera ini, pengunjung melihat pesan yang sama dua kali — dan toast
    // globalnya menambahkan baris "Error Code: CHATBOT_BUSY" di bawahnya.
    // Sebuah konstanta teknis di layar orang tua calon santri bukan informasi;
    // ia hanya membuat halaman terasa rusak.
    post.mockResolvedValueOnce({ data: { data: { answer: "x", sources: [], refused: false } } });

    const { result } = renderHook(() => usePublicChat(), { wrapper });
    await result.current.mutateAsync({ message: "halo" });
    expect(post).toHaveBeenCalledWith(
      "/chatbot/public/ask",
      expect.objectContaining({ message: "halo" }),
      { skipErrorToast: true },
    );
  });
});

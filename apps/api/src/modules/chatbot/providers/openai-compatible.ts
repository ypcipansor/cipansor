/**
 * Provider for any OpenAI-compatible chat-completions endpoint.
 *
 * This covers Azure AI Foundry serverless deployments (DeepSeek and the rest of
 * its catalogue), Azure OpenAI, and most self-hosted gateways — they all speak
 * `POST {base}/chat/completions` with a bearer token. One implementation
 * therefore serves every candidate we might evaluate, which is the point: model
 * selection should be an env change and an eval run, not a code change.
 *
 * Deliberately implemented against `fetch` rather than a vendor SDK. The wire
 * format is small and stable, and a vendor SDK would tie the deployment to one
 * catalogue — the opposite of what §1 of the design asks for.
 */

import { config } from '@/config';
import { logger } from '@/lib/logger';
import {
  isRetryableStatus,
  parseRetryAfter,
  TransientUpstreamError,
  withRetry,
} from '../retry';
import type { LlmCompletionRequest, LlmCompletionResult, LlmProvider, LlmUsage } from './types';

interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[];
  model?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    /** Bentuk OpenAI. */
    prompt_tokens_details?: { cached_tokens?: number };
    /** Bentuk asli DeepSeek. */
    prompt_cache_hit_tokens?: number;
  };
  error?: { message?: string };
}

/**
 * Reads the `usage` block, and returns undefined rather than zeros when it is
 * missing or unusable.
 *
 * The distinction is the whole point: zeros would be recorded as a call that
 * cost nothing, and a month of those would report a spend of zero while the
 * invoice said otherwise. Both counters must be present and finite — a body
 * carrying only `prompt_tokens` tells us as little as one carrying neither.
 */
function readUsage(body: ChatCompletionResponse): LlmUsage | undefined {
  const prompt = body.usage?.prompt_tokens;
  const completion = body.usage?.completion_tokens;
  if (!Number.isFinite(prompt) || !Number.isFinite(completion)) return undefined;

  // Dua bentuk, karena dua penyedia menamainya berbeda dan model di balik
  // endpoint ini boleh berganti tanpa perubahan kode. Yang sedang dipakai
  // (DeepSeek-V4-Flash-0731 di Azure AI Foundry) tidak melaporkan keduanya —
  // diperiksa langsung 2026-09-04 — jadi hari ini nilainya selalu undefined.
  const cached =
    body.usage?.prompt_tokens_details?.cached_tokens ?? body.usage?.prompt_cache_hit_tokens;

  return {
    promptTokens: prompt as number,
    completionTokens: completion as number,
    cachedPromptTokens: Number.isFinite(cached) ? (cached as number) : undefined,
  };
}

export class OpenAiCompatibleProvider implements LlmProvider {
  readonly name = 'openai-compatible';

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
    private readonly timeoutMs: number = config.chatbot.timeoutMs
  ) {}

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResult> {
    // Pengulangan dipasang DI SINI, bukan di layanan, karena hanya di sini
    // status HTTP-nya terlihat — dan status itulah yang memisahkan "sebentar"
    // (429) dari "permintaanmu salah" (400). Layanan hanya melihat sebuah
    // galat, dan sebuah galat tidak cukup untuk memutuskan boleh-tidaknya
    // mencoba lagi.
    return withRetry((attempt, budgetSignal) => this.attempt(request, budgetSignal), {
      ...config.chatbot.retry,
      onRetry: ({ attempt, delayMs, status }) => {
        logger.warn('Chatbot provider call will be retried', {
          attempt,
          delayMs: Math.round(delayMs),
          status,
          model: this.model,
        });
      },
    });
  }

  /**
   * Satu percobaan.
   *
   * `budgetSignal` membatalkan seluruh rangkaian percobaan ketika anggaran
   * waktunya habis; `AbortSignal.timeout` di sebelahnya membatasi percobaan ini
   * sendiri. Yang mana pun yang lebih dulu menyala, itulah yang berlaku —
   * sebuah percobaan yang sudah terlanjur berjalan tidak boleh melampaui
   * anggaran hanya karena ia sudah dimulai.
   */
  private async attempt(
    request: LlmCompletionRequest,
    budgetSignal: AbortSignal
  ): Promise<LlmCompletionResult> {
    // An unbounded upstream call would hold the visitor's connection open for
    // as long as the provider feels like taking, and hold a worker with it.
    const signal = AbortSignal.any([budgetSignal, AbortSignal.timeout(this.timeoutMs)]);

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: request.messages,
          max_tokens: request.maxTokens,
          temperature: request.temperature,
          stream: false,
        }),
        signal,
      });
    } catch (error) {
      // Habis-waktu TIDAK diulang, dan itu keputusan yang disengaja: panggilan
      // yang sudah memakan seluruh batas waktu sudah menghabiskan kesabaran
      // penanya, dan mengulanginya berarti memintanya menunggu dua kali lipat
      // untuk panggilan yang memang terlalu lambat. Putus jaringan yang lain —
      // DNS, koneksi ditolak, sambungan terpotong — memang layak diulang.
      if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
        throw error;
      }
      throw new TransientUpstreamError(
        error instanceof Error ? error.message : String(error)
      );
    }

    if (!response.ok) {
      // Log the status, never the body: a provider error body can echo the
      // prompt back, and the prompt contains the visitor's question.
      logger.error('Chatbot provider returned an error status', {
        status: response.status,
        model: this.model,
      });

      if (isRetryableStatus(response.status)) {
        throw new TransientUpstreamError(
          `Chatbot provider responded ${response.status}`,
          response.status,
          // Server tahu kapan kuotanya pulih; backoff kita hanya menebak.
          parseRetryAfter(response.headers.get('retry-after'), Date.now())
        );
      }
      throw new Error(`Chatbot provider responded ${response.status}`);
    }

    const body = (await response.json()) as ChatCompletionResponse;
    const text = body.choices?.[0]?.message?.content?.trim();
    if (!text) {
      throw new Error('Chatbot provider returned no content');
    }

    return { text, model: body.model ?? this.model, usage: readUsage(body) };
  }
}

/**
 * Provider-agnostic LLM interface.
 *
 * The model is the most swappable component in this system and the one we are
 * least able to choose from a spec sheet — the deciding question is how well a
 * candidate answers real Indonesian questions using pesantren vocabulary, which
 * only our own eval set can measure. So the model is configuration behind this
 * interface, and `pnpm --filter api chatbot:eval` can be pointed at a different
 * one without touching the service.
 *
 * See docs/planning/chatbot-design.md §1.
 */

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmCompletionRequest {
  messages: LlmMessage[];
  maxTokens: number;
  /** Low by default: this assistant reports facts, it does not brainstorm. */
  temperature: number;
}

/**
 * What the call consumed, when the provider says so.
 *
 * Optional because it genuinely is: the OpenAI wire format specifies `usage`,
 * but gateways in front of a model may strip it, and the local stub has nothing
 * to report. A caller that treats a missing block as zero turns an unmeasured
 * call into a free one — see `ChatbotUsageDaily.unmeteredRequests` for the
 * column that exists to keep those two apart.
 */
export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
  /**
   * Bagian dari `promptTokens` yang dilayani dari cache penyedia, bila ia
   * melaporkannya. Ditagih jauh lebih murah, jadi memisahkannya adalah
   * satu-satunya cara taksiran biaya berhenti menjadi batas atas.
   */
  cachedPromptTokens?: number;
}

export interface LlmCompletionResult {
  text: string;
  /** Concrete model that answered, echoed back for eval comparisons. */
  model: string;
  /** Absent when the provider reported none. Never inferred from the text. */
  usage?: LlmUsage;
}

export interface LlmProvider {
  /** Stable identifier used in logs and eval reports. */
  readonly name: string;
  complete(request: LlmCompletionRequest): Promise<LlmCompletionResult>;
}

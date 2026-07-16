/**
 * InferenceClient — streaming HTTP client for OpenRouter-compatible APIs.
 *
 * Uses Node.js built-in fetch (available in Node 20+, included with Electron 31)
 * to make streaming chat completion requests. Responses are parsed as SSE
 * (Server-Sent Events) streams.
 *
 * Version: 0.1.0 | 2026-07-16
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface InferenceOptions {
  baseUrl: string; // e.g. 'https://openrouter.ai/api/v1'
  apiKey: string;
  model: string;
  temperature?: number; // default 0.7
  maxTokens?: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// ── InferenceClient ──────────────────────────────────────────────────────────

export class InferenceClient {
  private abortController: AbortController | null = null;

  constructor(private readonly options: InferenceOptions) {}

  /**
   * Stream a chat completion. Returns an abortable async iterable of text deltas.
   *
   * Each yielded string is a single content delta from the stream.
   * The caller is responsible for concatenating partial output.
   *
   * @param messages - The chat messages (system + user).
   * @param signal   - Optional external AbortSignal for cancellation.
   * @throws If the API returns a non-2xx status or the stream encounters an error.
   */
  async *stream(
    messages: ChatMessage[],
    signal?: AbortSignal,
  ): AsyncGenerator<string, void, undefined> {
    const controller = new AbortController();
    this.abortController = controller;

    // Wire external signal to our controller
    const onExternalAbort = () => controller.abort();
    signal?.addEventListener('abort', onExternalAbort, { once: true });

    try {
      const { baseUrl, apiKey, model, temperature, maxTokens } = this.options;

      const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;

      const body: Record<string, unknown> = {
        model,
        messages,
        stream: true,
        temperature: temperature ?? 0.7,
      };

      // Only include max_tokens if explicitly provided (undefined omits it)
      if (maxTokens !== undefined) {
        body.max_tokens = maxTokens;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        let errorBody = '';
        try {
          errorBody = await response.text();
        } catch {
          errorBody = '(unable to read response body)';
        }
        throw new Error(
          `API request failed (${response.status}): ${errorBody}`,
        );
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable (no stream available)');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE: data: {...}\n\n
        const lines = buffer.split('\n');
        // Keep the last (possibly incomplete) line in the buffer
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();

          // Skip empty lines and event-type lines (we only care about data:)
          if (!trimmed || trimmed.startsWith(':')) continue;

          if (trimmed.startsWith('data: ')) {
            const data = trimmed.slice(6);

            // "[DONE]" signals end of stream
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const delta = parsed?.choices?.[0]?.delta?.content;
              if (delta) {
                yield delta;
              }
            } catch {
              // Skip malformed JSON lines (spec-compliant parsers ignore them)
              continue;
            }
          }
        }
      }

      // Process any remaining buffer content
      if (buffer.trim().startsWith('data: ')) {
        const data = buffer.trim().slice(6);
        if (data !== '[DONE]') {
          try {
            const parsed = JSON.parse(data);
            const delta = parsed?.choices?.[0]?.delta?.content;
            if (delta) {
              yield delta;
            }
          } catch {
            // Ignore
          }
        }
      }
    } finally {
      this.abortController = null;
      signal?.removeEventListener('abort', onExternalAbort);
    }
  }

  /**
   * Cancel the current stream, if any.
   */
  cancel(): void {
    this.abortController?.abort();
    this.abortController = null;
  }
}

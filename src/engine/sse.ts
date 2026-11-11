// Workers AI streams Server-Sent Events: `data: {"response":"tok"}` lines, ending with `data: [DONE]`.
// This turns those bytes into text chunks, holding back partial lines until they're complete.

export function createSseParser(onText: (text: string) => void) {
  const decoder = new TextDecoder();
  let buffer = '';

  const line = (raw: string) => {
    if (!raw.startsWith('data:')) return;
    const data = raw.slice(5).trim();
    if (!data || data === '[DONE]') return;
    try {
      const chunk = JSON.parse(data) as { response?: unknown; choices?: { delta?: { content?: unknown } }[] };
      // Prefer the OpenAI-style delta. Some models send digit tokens in `response` as JSON numbers
      // (`"response":5`), so a string-only check silently drops every digit of a leaked secret.
      const text = chunk.choices?.[0]?.delta?.content ?? chunk.response;
      if ((typeof text === 'string' || typeof text === 'number') && text !== '') onText(String(text));
    } catch {
      // A malformed event is skipped rather than ending the stream.
    }
  };

  return {
    push(bytes: Uint8Array) {
      buffer += decoder.decode(bytes, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      lines.forEach(line);
    },
    end() {
      buffer += decoder.decode();
      if (buffer) line(buffer);
      buffer = '';
    },
  };
}

/** One event in the stream we send to the browser. */
export function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

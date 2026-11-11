import type { Level, Turn } from './types';

/** The messages sent to the model: hidden instructions, the greeting, recent turns, then the new message. */
export function buildMessages(level: Level, secret: string, history: Turn[], message: string) {
  return [
    { role: 'system' as const, content: level.systemPrompt.replaceAll('{{secret}}', secret) },
    { role: 'assistant' as const, content: level.greeting },
    ...history,
    { role: 'user' as const, content: message },
  ];
}

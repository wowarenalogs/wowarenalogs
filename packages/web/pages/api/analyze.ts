import Anthropic from '@anthropic-ai/sdk';
import type { NextApiRequest, NextApiResponse } from 'next';

import { NEW_SYSTEM_PROMPT, SYSTEM_PROMPT } from '../../shared/src/prompts/analyzeSystemPrompts';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    matchContext,
    apiKey: bodyApiKey,
    systemPrompt: bodySystemPrompt,
    debug,
    useTimelinePrompt,
  } = req.body as {
    matchContext?: string;
    apiKey?: string;
    systemPrompt?: string;
    debug?: boolean;
    useTimelinePrompt?: boolean;
  };
  const apiKey = bodyApiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'No Anthropic API key configured. Add one in Settings.' });
  }
  if (!matchContext || typeof matchContext !== 'string') {
    return res.status(400).json({ error: 'Missing matchContext in request body' });
  }

  try {
    const client = new Anthropic({ apiKey });
    // Using Claude 4.6 as requested
    const model = 'claude-sonnet-4-6';
    const startMs = Date.now();

    // Prompt selection precedence (highest priority first):
    //   1. debug && bodySystemPrompt: explicit override for local dev/testing only.
    //      Gate prevents the route becoming a free LLM proxy for arbitrary prompts.
    //   2. useTimelinePrompt: use raw timeline path (NEW_SYSTEM_PROMPT).
    //   3. default: structured critical-moments path (SYSTEM_PROMPT).
    const activeSystemPrompt =
      debug && bodySystemPrompt && typeof bodySystemPrompt === 'string' && bodySystemPrompt.length <= 32_000
        ? bodySystemPrompt
        : useTimelinePrompt
          ? NEW_SYSTEM_PROMPT
          : SYSTEM_PROMPT;

    const message = await client.messages.create({
      model,
      max_tokens: 6144,
      temperature: 0.3,
      system: activeSystemPrompt,
      messages: [{ role: 'user', content: matchContext }],
    });

    const durationMs = Date.now() - startMs;
    const content = message.content[0];
    if (content.type !== 'text') {
      return res.status(500).json({ error: 'Unexpected response type from AI' });
    }

    const responseBody: Record<string, unknown> = { analysis: content.text };
    if (debug) {
      responseBody.debug = {
        model,
        systemPrompt: activeSystemPrompt,
        userMessage: matchContext,
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        durationMs,
      };
    }
    return res.status(200).json(responseBody);
  } catch (err) {
    const errMessage = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ error: `AI analysis failed: ${errMessage}` });
  }
}

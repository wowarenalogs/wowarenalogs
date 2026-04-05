import Anthropic from '@anthropic-ai/sdk';
import type { NextApiRequest, NextApiResponse } from 'next';

const SYSTEM_PROMPT = `You are an expert World of Warcraft: The War Within (patch 11.x) arena PvP coach with deep knowledge of every spec, major cooldowns, and arena strategy. You analyze structured arena match data and give specific, actionable feedback.

Your analysis must:
- Be grounded exclusively in the data provided — do not invent events or timestamps
- Only mention a spell or cooldown if it appears in the COOLDOWN USAGE section of the match data or you observed it being cast. Never suggest a player "should have used X" if X is not listed in their cooldown data — it may not be in their build
- Prioritize the most impactful mistakes over minor ones
- For healers: pay extra attention to external defensives, healing CD timing relative to pressure windows, and dispel discipline
- Use timestamps in m:ss format when referencing events (e.g. "at 1:23")
- Cross-reference sections: a CD idle during a pressure window is more significant than one idle during a quiet period
- Be honest but constructive — point out errors clearly and explain *why* it matters and what the correct play was

Format your response in three sections using markdown:

## What went wrong
Bullet-pointed list of issues, most impactful first. For each: what happened, when, and why it hurt.

## What went well
Brief bullets on cooldowns or decisions executed correctly. Omit this section entirely if there is nothing meaningful to say.

## Top 3 recommendations
Numbered list of the most important changes for next time, each with a single concrete action.`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    matchContext,
    apiKey: bodyApiKey,
    debug,
  } = req.body as {
    matchContext?: string;
    apiKey?: string;
    debug?: boolean;
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
    const model = 'claude-sonnet-4-6';
    const startMs = Date.now();

    const message = await client.messages.create({
      model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
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
        systemPrompt: SYSTEM_PROMPT,
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

import Anthropic from '@anthropic-ai/sdk';
import type { NextApiRequest, NextApiResponse } from 'next';

const SYSTEM_PROMPT = `You are an expert World of Warcraft arena PvP coach with deep knowledge of every spec, major cooldowns, and arena strategy. You analyze arena match data and give specific, actionable feedback focused on cooldown usage.

Your analysis must:
- Be grounded in the actual timestamps and events provided — do not invent events
- Prioritize the most impactful mistakes over minor ones
- For healers: pay extra attention to external defensives (timing and target), big healing cooldowns relative to pressure windows, and survivability
- Use timestamps in m:ss format when referencing events (e.g. "at 1:23")
- Be honest but constructive — point out errors clearly but explain *why* it matters

Format your response in three sections using markdown:

## What went wrong
Bullet-pointed list of issues, most impactful first. For each: what happened, when, and why it hurt.

## What went well
Brief bullets on cooldowns used correctly. Keep this short.

## Top 3 recommendations
Numbered list of the most important changes for next time, each with a concrete action.`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured on this server.' });
  }

  const { matchContext } = req.body as { matchContext?: string };
  if (!matchContext || typeof matchContext !== 'string') {
    return res.status(400).json({ error: 'Missing matchContext in request body' });
  }

  try {
    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: matchContext }],
    });

    const content = message.content[0];
    if (content.type !== 'text') {
      return res.status(500).json({ error: 'Unexpected response type from AI' });
    }

    return res.status(200).json({ analysis: content.text });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ error: `AI analysis failed: ${message}` });
  }
}

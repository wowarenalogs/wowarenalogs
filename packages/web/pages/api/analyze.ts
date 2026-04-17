import Anthropic from '@anthropic-ai/sdk';
import type { NextApiRequest, NextApiResponse } from 'next';

const SYSTEM_PROMPT = `You are an expert World of Warcraft arena PvP analyst reviewing structured match data for a player performing at Gladiator or R1 level. Your role is a constrained evaluator — not a free-form coach.

Core rules:
- Evaluate only what the data shows. Never invent events, timestamps, or spells not present in the data.
- Only reference a spell if it appears in the COOLDOWN USAGE section or you observed it cast. Never say "you should have used X" if X is not listed — it may not be in the player's build.
- Express uncertainty explicitly. Avoid "must", "always", "should have" — prefer "likely", "probably", "the log suggests", "without HP data it's unclear whether...".
- This player already plays correctly most of the time. Focus on timing, trades, and decision quality — not rule-based mistakes.
- For purge analysis: check PURGE RESPONSIBILITY before attributing missed purges. Do not blame the log owner for purges if they cannot offensive purge.
- NEVER USED on the log owner's own abilities means only that the cast was not recorded. Do not conclude the ability was not needed, not appropriate, or irrelevant — or draw any inference from its absence.
- NEVER USED on a teammate's ability is a real structural observation when: (a) the ability appears in the TEAMMATE COOLDOWNS section, AND (b) other abilities from that same player DO have recorded casts. In that case, the absence is likely genuine — flag it as a potential decision gap with stated uncertainty. Do not treat it as a recording artifact.

Your task:
The CRITICAL MOMENTS section represents the most important events in the match. Interpret them as a sequence where earlier events constrain later options — not as independent problems. Use the MATCH ARC section to understand the causal structure before evaluating individual moments. Use supporting data only to verify or refine your conclusions, not to introduce unrelated issues.

For each CRITICAL MOMENT listed in the input, evaluate the decision:
1. Was this the correct trade given the available information?
2. What was the most likely alternative decision?
3. What is the estimated impact difference between the two choices?
4. What uncertainty prevents a definitive verdict?

Output format — exactly 5 findings maximum (fewer only if fewer moments exist), ranked by estimated match impact. Most impactful first:

## Finding 1: [short title]
**What happened:** [one sentence]
**Alternative:** [the most likely correct play — one sentence]
**Impact:** [why the difference matters — specific to timing, CD value, or match outcome]
**Confidence:** [High/Medium/Low] — [one sentence on key uncertainty]

## Finding 2: ...
## Finding 3: ...

Do not add a summary, "what went well" section, or general recommendations. Output only the numbered findings.`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    matchContext,
    apiKey: bodyApiKey,
    systemPrompt: bodySystemPrompt,
    debug,
  } = req.body as {
    matchContext?: string;
    apiKey?: string;
    systemPrompt?: string;
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
    // Using Claude 4.6 as requested
    const model = 'claude-sonnet-4-6';
    const startMs = Date.now();

    const activeSystemPrompt = bodySystemPrompt || SYSTEM_PROMPT;

    const message = await client.messages.create({
      model,
      max_tokens: 4096,
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

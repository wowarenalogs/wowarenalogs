/* eslint-disable @typescript-eslint/no-explicit-any */
/// <reference types="jest" />

import type { NextApiRequest, NextApiResponse } from 'next';

// Must come before handler import — jest hoists jest.mock() before imports.
jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn(),
}));

import handler from '../analyze';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Lazily retrieved after beforeEach reinitializes it each test. */
let mockCreate: jest.Mock;

beforeEach(() => {
  mockCreate = jest.fn();
  const Anthropic = jest.requireMock('@anthropic-ai/sdk').default as jest.Mock;
  Anthropic.mockImplementation(() => ({ messages: { create: mockCreate } }));
  delete process.env.ANTHROPIC_API_KEY;
});

afterEach(() => {
  jest.clearAllMocks();
});

function makeReq(method = 'POST', body: Record<string, unknown> = {}): NextApiRequest {
  return { method, body } as unknown as NextApiRequest;
}

function makeRes() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return { res: { status } as unknown as NextApiResponse, status, json };
}

function makeAnthropicSuccess(text = 'analysis result') {
  return {
    content: [{ type: 'text', text }],
    usage: { input_tokens: 100, output_tokens: 50 },
  };
}

const VALID_BODY = { matchContext: 'round 1 context', apiKey: 'test-api-key' };

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('POST /api/analyze', () => {
  // ── Method guard ──────────────────────────────────────────────────────────
  describe('method validation', () => {
    it.each(['GET', 'PUT', 'DELETE', 'PATCH'])('returns 405 for %s requests', async (method) => {
      const { res, status, json } = makeRes();
      await handler(makeReq(method), res);
      expect(status).toHaveBeenCalledWith(405);
      expect(json).toHaveBeenCalledWith({ error: 'Method not allowed' });
    });

    it('does not call Anthropic for non-POST requests', async () => {
      const { res } = makeRes();
      await handler(makeReq('GET'), res);
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  // ── Payload validation ────────────────────────────────────────────────────
  describe('payload validation', () => {
    it('returns 400 when matchContext is absent', async () => {
      const { res, status, json } = makeRes();
      await handler(makeReq('POST', { apiKey: 'k' }), res);
      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({ error: 'Missing matchContext in request body' });
    });

    it('returns 400 when matchContext is not a string', async () => {
      const { res, status, json } = makeRes();
      await handler(makeReq('POST', { apiKey: 'k', matchContext: 123 }), res);
      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({ error: 'Missing matchContext in request body' });
    });

    it('returns 400 when matchContext is null', async () => {
      const { res, status, json } = makeRes();
      await handler(makeReq('POST', { apiKey: 'k', matchContext: null }), res);
      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({ error: 'Missing matchContext in request body' });
    });

    it('returns 400 when matchContext is an object', async () => {
      const { res, status, json } = makeRes();
      await handler(makeReq('POST', { apiKey: 'k', matchContext: { data: 1 } }), res);
      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({ error: 'Missing matchContext in request body' });
    });

    it('returns 400 when matchContext is an empty string', async () => {
      const { res, status, json } = makeRes();
      await handler(makeReq('POST', { apiKey: 'k', matchContext: '' }), res);
      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({ error: 'Missing matchContext in request body' });
    });
  });

  // ── API key resolution ────────────────────────────────────────────────────
  describe('API key handling', () => {
    it('returns 500 with message when no API key is configured', async () => {
      const { res, status, json } = makeRes();
      await handler(makeReq('POST', { matchContext: 'ctx' }), res);
      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('No Anthropic API key') }),
      );
    });

    it('uses the body apiKey to initialize the Anthropic client', async () => {
      mockCreate.mockResolvedValue(makeAnthropicSuccess());
      const Anthropic = jest.requireMock('@anthropic-ai/sdk').default as jest.Mock;
      const { res } = makeRes();
      await handler(makeReq('POST', { matchContext: 'ctx', apiKey: 'body-key' }), res);
      expect(Anthropic).toHaveBeenCalledWith({ apiKey: 'body-key' });
    });

    it('falls back to ANTHROPIC_API_KEY env var when body apiKey is absent', async () => {
      process.env.ANTHROPIC_API_KEY = 'env-key';
      mockCreate.mockResolvedValue(makeAnthropicSuccess());
      const Anthropic = jest.requireMock('@anthropic-ai/sdk').default as jest.Mock;
      const { res } = makeRes();
      await handler(makeReq('POST', { matchContext: 'ctx' }), res);
      expect(Anthropic).toHaveBeenCalledWith({ apiKey: 'env-key' });
    });

    it('prefers body apiKey over env var when both are set', async () => {
      process.env.ANTHROPIC_API_KEY = 'env-key';
      mockCreate.mockResolvedValue(makeAnthropicSuccess());
      const Anthropic = jest.requireMock('@anthropic-ai/sdk').default as jest.Mock;
      const { res } = makeRes();
      await handler(makeReq('POST', { matchContext: 'ctx', apiKey: 'body-key' }), res);
      expect(Anthropic).toHaveBeenCalledWith({ apiKey: 'body-key' });
    });
  });

  // ── Success path ──────────────────────────────────────────────────────────
  describe('success path', () => {
    it('returns 200 with the analysis text', async () => {
      mockCreate.mockResolvedValue(makeAnthropicSuccess('great play, terrible trade'));
      const { res, status, json } = makeRes();
      await handler(makeReq('POST', VALID_BODY), res);
      expect(status).toHaveBeenCalledWith(200);
      expect(json).toHaveBeenCalledWith({ analysis: 'great play, terrible trade' });
    });

    it('calls Anthropic messages.create with correct model and token limit', async () => {
      mockCreate.mockResolvedValue(makeAnthropicSuccess());
      const { res } = makeRes();
      await handler(makeReq('POST', VALID_BODY), res);
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-sonnet-4-6',
          max_tokens: 4096,
        }),
      );
    });

    it('passes matchContext as the user message', async () => {
      mockCreate.mockResolvedValue(makeAnthropicSuccess());
      const { res } = makeRes();
      await handler(makeReq('POST', VALID_BODY), res);
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [{ role: 'user', content: VALID_BODY.matchContext }],
        }),
      );
    });

    it('uses the built-in system prompt when no override is provided', async () => {
      mockCreate.mockResolvedValue(makeAnthropicSuccess());
      const { res } = makeRes();
      await handler(makeReq('POST', VALID_BODY), res);
      const call = mockCreate.mock.calls[0][0] as any;
      expect(typeof call.system).toBe('string');
      expect(call.system.length).toBeGreaterThan(100);
    });

    it('substitutes a custom systemPrompt from the request body', async () => {
      mockCreate.mockResolvedValue(makeAnthropicSuccess());
      const { res } = makeRes();
      await handler(makeReq('POST', { ...VALID_BODY, systemPrompt: 'custom instructions' }), res);
      expect(mockCreate.mock.calls[0][0]).toMatchObject({ system: 'custom instructions' });
    });

    it('omits the debug field when debug is not set', async () => {
      mockCreate.mockResolvedValue(makeAnthropicSuccess());
      const { res, json } = makeRes();
      await handler(makeReq('POST', VALID_BODY), res);
      expect(json.mock.calls[0][0]).not.toHaveProperty('debug');
    });

    it('includes debug metadata when debug=true', async () => {
      mockCreate.mockResolvedValue(makeAnthropicSuccess());
      const { res, json } = makeRes();
      await handler(makeReq('POST', { ...VALID_BODY, debug: true }), res);
      const body = json.mock.calls[0][0] as any;
      expect(body).toHaveProperty('debug');
      expect(body.debug).toMatchObject({
        model: 'claude-sonnet-4-6',
        userMessage: VALID_BODY.matchContext,
        inputTokens: 100,
        outputTokens: 50,
      });
      expect(typeof body.debug.durationMs).toBe('number');
    });

    it('debug.systemPrompt reflects the active prompt sent to Anthropic', async () => {
      mockCreate.mockResolvedValue(makeAnthropicSuccess());
      const { res, json } = makeRes();
      await handler(makeReq('POST', { ...VALID_BODY, systemPrompt: 'override prompt', debug: true }), res);
      const body = json.mock.calls[0][0] as any;
      expect(mockCreate.mock.calls[0][0]).toMatchObject({ system: 'override prompt' });
      expect(body.debug.systemPrompt).toBe('override prompt');
    });
  });

  // ── Error handling ────────────────────────────────────────────────────────
  describe('error handling', () => {
    it('returns 500 when Anthropic returns a non-text content block', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'tool_use', id: 'x', name: 'fn', input: {} }],
        usage: { input_tokens: 10, output_tokens: 5 },
      });
      const { res, status, json } = makeRes();
      await handler(makeReq('POST', VALID_BODY), res);
      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({ error: 'Unexpected response type from AI' });
    });

    it('returns 500 with the error message when Anthropic throws an Error', async () => {
      mockCreate.mockRejectedValue(new Error('overloaded_error'));
      const { res, status, json } = makeRes();
      await handler(makeReq('POST', VALID_BODY), res);
      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({ error: 'AI analysis failed: overloaded_error' });
    });

    it('returns 500 with "Unknown error" for non-Error throws', async () => {
      mockCreate.mockRejectedValue('plain string throw');
      const { res, status, json } = makeRes();
      await handler(makeReq('POST', VALID_BODY), res);
      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({ error: 'AI analysis failed: Unknown error' });
    });
  });

  // ── System prompt invariants ──────────────────────────────────────────────
  describe('SYSTEM_PROMPT invariants', () => {
    // Expose the built-in prompt via the debug field.
    async function captureSystemPrompt(): Promise<string> {
      mockCreate.mockResolvedValue(makeAnthropicSuccess());
      const json = jest.fn();
      const status = jest.fn().mockReturnValue({ json });
      await handler(makeReq('POST', { ...VALID_BODY, debug: true }), { status } as unknown as NextApiResponse);
      return (json.mock.calls[0][0] as any).debug.systemPrompt;
    }

    it('identifies the target audience as Gladiator/R1 players', async () => {
      const prompt = await captureSystemPrompt();
      expect(prompt).toMatch(/Gladiator|R1/);
    });

    it('caps findings at 5 maximum', async () => {
      const prompt = await captureSystemPrompt();
      expect(prompt).toContain('5 findings maximum');
    });

    it('instructs Claude never to reference spells absent from the log', async () => {
      const prompt = await captureSystemPrompt();
      expect(prompt).toContain('Never say "you should have used X" if X is not listed');
    });

    it('includes NEVER USED rules for the log owner', async () => {
      const prompt = await captureSystemPrompt();
      expect(prompt).toContain('NEVER USED on the log owner');
    });

    it('includes NEVER USED rules for teammates', async () => {
      const prompt = await captureSystemPrompt();
      expect(prompt).toContain('NEVER USED on a teammate');
    });

    it('requires Claude to read MATCH ARC before evaluating moments', async () => {
      const prompt = await captureSystemPrompt();
      expect(prompt).toContain('MATCH ARC');
    });

    it('asks for exactly 4 fields per finding: What/Alternative/Impact/Confidence', async () => {
      const prompt = await captureSystemPrompt();
      expect(prompt).toContain('**What happened:**');
      expect(prompt).toContain('**Alternative:**');
      expect(prompt).toContain('**Impact:**');
      expect(prompt).toContain('**Confidence:**');
    });

    it('forbids a summary or "what went well" section', async () => {
      const prompt = await captureSystemPrompt();
      expect(prompt).toContain('Do not add a summary');
    });

    it('instructs Claude to express uncertainty and avoid absolute language', async () => {
      const prompt = await captureSystemPrompt();
      expect(prompt).toMatch(/avoid.*must|avoid.*always|prefer.*likely|prefer.*probably/i);
    });
  });
});

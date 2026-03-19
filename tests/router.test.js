import { vi, describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';

const mockCreate = vi.hoisted(() => vi.fn());

vi.mock('@anthropic-ai/sdk', () => {
  const create = mockCreate;
  return {
    default: class Anthropic {
      constructor() { this.messages = { create }; }
    },
  };
});

const { app } = await import('../index.js');

const auth = { Authorization: 'Bearer test-api-key' };

function mockClaude(result) {
  mockCreate.mockResolvedValueOnce({
    content: [{ type: 'text', text: JSON.stringify(result) }],
  });
}

function mockFetch(ok = true) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    text: async () => 'error body',
  }));
}

beforeEach(() => {
  vi.unstubAllGlobals();
  mockCreate.mockReset();
});

describe('auth', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).post('/email').send({ subject: 'Test' });
    expect(res.status).toBe(401);
  });

  it('returns 401 with wrong token', async () => {
    const res = await request(app).post('/email').set('Authorization', 'Bearer wrong').send({ subject: 'Test' });
    expect(res.status).toBe(401);
  });

  it('/health is public', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});

describe('GET /health', () => {
  it('returns ok with all 9 channels configured', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.channels_configured).toHaveLength(9);
    expect(res.body.channels_configured).toContain('inbox');
    expect(res.body.channels_configured).toContain('money');
  });
});

describe('POST /email', () => {
  it('returns 400 with no email fields', async () => {
    const res = await request(app).post('/email').set(auth).send({});
    expect(res.status).toBe(400);
  });

  it('returns 502 if Claude fails', async () => {
    mockCreate.mockRejectedValueOnce(new Error('Anthropic API error'));
    const res = await request(app).post('/email').set(auth).send({ subject: 'Test' });
    expect(res.status).toBe(502);
    expect(res.body.error).toBe('Failed to classify email');
  });

  it('returns 502 if Slack webhook fails', async () => {
    mockClaude({ channel: 'inbox', summary: 'A test email.', action: null });
    mockFetch(false);
    const res = await request(app).post('/email').set(auth).send({ subject: 'Test' });
    expect(res.status).toBe(502);
    expect(res.body.error).toBe('Failed to post to Slack');
  });

  it('routes email and returns classification', async () => {
    mockClaude({ channel: 'money', summary: 'Invoice for $500.', action: 'Pay invoice' });
    mockFetch(true);
    const res = await request(app).post('/email').set(auth).send({
      from: 'billing@acme.com',
      subject: 'Invoice #123',
      text: 'Please pay $500',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      channel: 'money',
      summary: 'Invoice for $500.',
      action: 'Pay invoice',
    });
  });

  it('falls back to inbox for unknown channel', async () => {
    mockClaude({ channel: 'unknown-channel', summary: 'Some email.', action: null });
    mockFetch(true);
    const res = await request(app).post('/email').set(auth).send({ subject: 'Test' });
    expect(res.status).toBe(200);
    expect(res.body.channel).toBe('inbox');
  });

  it('handles markdown-wrapped JSON from Claude', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: '```json\n{"channel":"receipts","summary":"Order confirmed.","action":null}\n```' }],
    });
    mockFetch(true);
    const res = await request(app).post('/email').set(auth).send({ subject: 'Your order' });
    expect(res.status).toBe(200);
    expect(res.body.channel).toBe('receipts');
  });
});

describe('POST /slack', () => {
  it('returns 400 if channel is missing', async () => {
    const res = await request(app).post('/slack').set(auth).send({ text: 'hello' });
    expect(res.status).toBe(400);
  });

  it('returns 400 if text is missing', async () => {
    const res = await request(app).post('/slack').set(auth).send({ channel: 'inbox' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for unknown channel', async () => {
    const res = await request(app).post('/slack').set(auth).send({ channel: 'unknown', text: 'hi' });
    expect(res.status).toBe(400);
  });

  it('returns 502 if Slack fails', async () => {
    mockFetch(false);
    const res = await request(app).post('/slack').set(auth).send({ channel: 'inbox', text: 'hello' });
    expect(res.status).toBe(502);
  });

  it('posts to slack and returns ok', async () => {
    mockFetch(true);
    const res = await request(app).post('/slack').set(auth).send({ channel: 'inspo', text: 'Cool idea!' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, channel: 'inspo' });
  });
});

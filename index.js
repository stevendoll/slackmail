import 'dotenv/config';
import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import serverlessHttp from 'serverless-http';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CHANNELS = JSON.parse(process.env.SLACK_WEBHOOKS || '{}');

const CHANNEL_DESCRIPTIONS = `
- inbox: general/uncategorized emails that don't fit any other category
- clients: client communications, customer support, partnerships, sales leads
- money: invoices, payments, financial statements, billing, wire transfers
- dev-tools: developer tools, APIs, software services, tech releases, SaaS updates
- projects: project updates, task assignments, team coordination, deadlines
- ai-watch: AI/ML news, research papers, model announcements, AI product launches
- inspo: inspiration, design ideas, creative content, thought leadership articles
- newsletters: newsletters, digests, subscription content, mailing lists
- receipts: purchase receipts, order confirmations, shipping notifications, expense records
`.trim();

async function classifyEmail(email) {
  const body = (email.text || email.body || email.html || '').slice(0, 3000);

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    system: 'You are an email routing assistant. Always respond with valid JSON only — no markdown, no explanation.',
    messages: [
      {
        role: 'user',
        content: `Classify this email into exactly one Slack channel and summarize it.

Channels:
${CHANNEL_DESCRIPTIONS}

Email:
From: ${email.from || '(unknown)'}
To: ${email.to || '(unknown)'}
Subject: ${email.subject || '(no subject)'}
Body:
${body}

Respond with this exact JSON shape:
{
  "channel": "<one of the channel names above>",
  "summary": "<1-2 sentence summary of what this email is about>",
  "action": "<brief action item if the email requires one, otherwise null>"
}`,
      },
    ],
  });

  const text = response.content.find((b) => b.type === 'text')?.text ?? '';

  // Extract JSON even if the model wraps it in markdown code fences
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`Claude returned non-JSON: ${text}`);

  const result = JSON.parse(match[0]);

  if (!CHANNELS.hasOwnProperty(result.channel)) {
    console.warn(`Claude chose unknown channel "${result.channel}", falling back to inbox`);
    result.channel = 'inbox';
  }

  return result;
}

async function postToSlack(webhookUrl, email, classification) {
  const subject = email.subject || '(no subject)';
  const from = email.from || '(unknown sender)';
  const to = email.to || null;

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: subject, emoji: true },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: classification.summary },
    },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `*From:* ${from}` },
        ...(to ? [{ type: 'mrkdwn', text: `*To:* ${to}` }] : []),
      ],
    },
  ];

  if (classification.action) {
    blocks.push(
      { type: 'divider' },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*Action needed:* ${classification.action}` },
      }
    );
  }

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blocks }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Slack webhook returned ${res.status}: ${body}`);
  }
}

app.post('/email', async (req, res) => {
  const email = req.body;

  if (!email.from && !email.subject && !email.text && !email.body) {
    return res.status(400).json({ error: 'Request body must include at least one of: from, subject, text, body' });
  }

  let classification;
  try {
    classification = await classifyEmail(email);
  } catch (err) {
    console.error('Classification failed:', err);
    return res.status(502).json({ error: 'Failed to classify email', detail: err.message });
  }

  const webhookUrl = CHANNELS[classification.channel];
  if (!webhookUrl) {
    return res.status(500).json({
      error: `No Slack webhook configured for channel "${classification.channel}". Set ${`SLACK_WEBHOOK_${classification.channel.toUpperCase().replace('-', '_')}`} in your .env.`,
    });
  }

  try {
    await postToSlack(webhookUrl, email, classification);
  } catch (err) {
    console.error('Slack post failed:', err);
    return res.status(502).json({ error: 'Failed to post to Slack', detail: err.message });
  }

  console.log(`[${new Date().toISOString()}] Routed "${email.subject}" → #${classification.channel}`);

  res.json({
    ok: true,
    channel: classification.channel,
    summary: classification.summary,
    action: classification.action ?? null,
  });
});

app.get('/health', (_req, res) => {
  const configured = Object.entries(CHANNELS)
    .filter(([, url]) => !!url)
    .map(([name]) => name);
  res.json({ ok: true, channels_configured: configured });
});

// Lambda handler
export const handler = serverlessHttp(app);

// Local development server
if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Email router listening on port ${PORT}`);

    const missing = Object.entries(CHANNELS)
      .filter(([, url]) => !url)
      .map(([name]) => `SLACK_WEBHOOK_${name.toUpperCase().replace('-', '_')}`);

    if (missing.length) {
      console.warn(`Warning: missing env vars for ${missing.length} channel(s):\n  ${missing.join('\n  ')}`);
    }
  });
}

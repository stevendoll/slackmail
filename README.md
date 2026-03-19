# email-router

Receives forwarded emails via HTTP, uses Claude to classify and summarize them, then posts a formatted message to the right Slack channel.

## Channels

| Slack Channel  | What goes there |
|---------------|-----------------|
| `#inbox`       | General / uncategorized |
| `#clients`     | Client comms, support, partnerships |
| `#money`       | Invoices, payments, billing |
| `#dev-tools`   | Developer tools, SaaS, API updates |
| `#projects`    | Project updates, task assignments |
| `#ai-watch`    | AI/ML news, model releases, research |
| `#inspo`       | Inspiration, design, creative reads |
| `#newsletters` | Newsletters, digests, mailing lists |
| `#receipts`    | Purchase receipts, order confirmations |

## Setup

```bash
npm install
cp .env.example .env
# Fill in ANTHROPIC_API_KEY and all SLACK_WEBHOOK_* values
```

### Slack Webhooks

Create an incoming webhook for each channel at **Slack → Apps → Incoming WebHooks** and paste each URL into `.env`.

## Running

```bash
npm start        # production
npm run dev      # auto-restart on file changes (Node 18+)
```

## API

### `POST /email`

Accepts a JSON body representing a forwarded email.

**Fields** (all optional, but at least one should be present):

| Field     | Type   | Description |
|-----------|--------|-------------|
| `from`    | string | Sender address |
| `to`      | string | Recipient address |
| `subject` | string | Email subject line |
| `text`    | string | Plain-text body |
| `body`    | string | Alias for `text` |
| `html`    | string | HTML body (used if `text`/`body` absent) |

**Example request:**

```bash
curl -X POST http://localhost:3000/email \
  -H 'Content-Type: application/json' \
  -d '{
    "from": "billing@acme.com",
    "to": "me@company.com",
    "subject": "Invoice #1042 – $3,200 due",
    "text": "Hi, please find attached invoice #1042 for $3,200 due on March 31."
  }'
```

**Example response:**

```json
{
  "ok": true,
  "channel": "money",
  "summary": "Invoice #1042 from ACME for $3,200 is due on March 31.",
  "action": "Pay invoice by March 31"
}
```

### `GET /health`

Returns which Slack webhooks are configured.

```json
{
  "ok": true,
  "channels_configured": ["inbox", "clients", "money", "receipts"]
}
```

## Forwarding emails to this service

Most email providers (Postmark, Sendgrid Inbound, Mailgun, Cloudflare Email Workers) can forward inbound email as a JSON POST to a webhook URL. Point them at `https://your-host/email` and map their fields to `from`, `to`, `subject`, and `text`.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Your Anthropic API key |
| `PORT` | No | HTTP port (default: 3000) |
| `SLACK_WEBHOOK_INBOX` | * | Slack webhook for #inbox |
| `SLACK_WEBHOOK_CLIENTS` | * | Slack webhook for #clients |
| `SLACK_WEBHOOK_MONEY` | * | Slack webhook for #money |
| `SLACK_WEBHOOK_DEV_TOOLS` | * | Slack webhook for #dev-tools |
| `SLACK_WEBHOOK_PROJECTS` | * | Slack webhook for #projects |
| `SLACK_WEBHOOK_AI_WATCH` | * | Slack webhook for #ai-watch |
| `SLACK_WEBHOOK_INSPO` | * | Slack webhook for #inspo |
| `SLACK_WEBHOOK_NEWSLETTERS` | * | Slack webhook for #newsletters |
| `SLACK_WEBHOOK_RECEIPTS` | * | Slack webhook for #receipts |

\* At startup the server logs any missing webhook env vars. Emails routed to an unconfigured channel return a `500` error.

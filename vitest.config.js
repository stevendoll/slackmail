import { defineConfig } from 'vitest/config';

const TEST_WEBHOOKS = JSON.stringify({
  inbox:       'https://hooks.slack.com/test/inbox',
  clients:     'https://hooks.slack.com/test/clients',
  money:       'https://hooks.slack.com/test/money',
  'dev-tools': 'https://hooks.slack.com/test/dev-tools',
  projects:    'https://hooks.slack.com/test/projects',
  'ai-watch':  'https://hooks.slack.com/test/ai-watch',
  inspo:       'https://hooks.slack.com/test/inspo',
  newsletters: 'https://hooks.slack.com/test/newsletters',
  receipts:    'https://hooks.slack.com/test/receipts',
});

export default defineConfig({
  test: {
    env: {
      ANTHROPIC_API_KEY: 'test-key',
      SLACK_WEBHOOKS: TEST_WEBHOOKS,
      API_KEY: 'test-api-key',
    },
  },
});

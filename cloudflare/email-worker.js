import PostalMime from 'postal-mime';

export default {
  async email(message, env, ctx) {
    const parsed = await PostalMime.parse(message.raw);

    const res = await fetch(env.SLACKMAIL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: message.from,
        to: message.to,
        subject: parsed.subject,
        text: parsed.text,
        html: parsed.html,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`slackmail returned ${res.status}: ${body}`);
    }
  },
};

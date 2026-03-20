import PostalMime from 'postal-mime';

export default {
  async email(message, env, ctx) {
    // Forward to fastmail first — email delivery must not depend on Lambda being up
    await message.forward(env.FORWARD_TO);
    console.log('forwarded to', env.FORWARD_TO);

    try {
      const rawEmail = await new Response(message.raw).arrayBuffer();
      const parsed = await PostalMime.parse(rawEmail);
      console.log('parsed subject:', parsed.subject);

      const res = await fetch(`${env.SLACKMAIL_URL}/email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.SLACKMAIL_API_KEY}`,
        },
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

      console.log('slackmail success');
    } catch (err) {
      console.error('slackmail error (email already forwarded):', err.message);
      throw err;
    }
  },
};

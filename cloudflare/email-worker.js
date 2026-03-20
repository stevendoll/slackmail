import PostalMime from 'postal-mime';

export default {
  async email(message, env, ctx) {
    try {
      const rawEmail = await new Response(message.raw).arrayBuffer();
      console.log('raw email bytes:', rawEmail.byteLength);

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

      console.log('slackmail success, forwarding to', env.FORWARD_TO);
      await message.forward(env.FORWARD_TO);
    } catch (err) {
      console.error('worker error:', err.message, err.stack);
      throw err;
    }
  },
};

const CLOUD_API_TOKEN = process.env.WHATSAPP_CLOUD_API_TOKEN!;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID!;
const API_URL = `https://graph.facebook.com/v23.0/${PHONE_NUMBER_ID}/messages`;

async function send(body: Record<string, unknown>) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CLOUD_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
  });

  if (!res.ok) {
    throw new Error(`WhatsApp send failed: ${res.status} ${await res.text()}`);
  }

  return res.json();
}

export function sendText(to: string, text: string) {
  return send({ to, type: "text", text: { body: text } });
}

// Interactive reply buttons (max 3). Prefer this over "reply 1 or 2"
// text prompts wherever the choice is small and fixed — a tap can't
// be mistyped, and the button id comes back structured in the
// webhook instead of free text you'd have to parse and guess at.
export function sendButtons(
  to: string,
  bodyText: string,
  buttons: { id: string; title: string }[]
) {
  return send({
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: bodyText },
      action: {
        buttons: buttons.map((b) => ({
          type: "reply",
          reply: { id: b.id, title: b.title },
        })),
      },
    },
  });
}
const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");

const app = express();
app.use(bodyParser.json());

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Store conversation history per user
const conversations = {};

// Facebook Messenger Send API
async function sendMessage(sender_psid, text) {
  try {
    await axios.post(
      `https://graph.facebook.com/v20.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
      {
        recipient: { id: sender_psid },
        message: { text }
      }
    );
  } catch (err) {
    console.error("Error sending message:", err.response?.data || err.message);
  }
}

// Gemini AI call with Monobot teaching + memory
async function askGemini(sender_psid, userText) {
  try {
    if (!conversations[sender_psid]) {
      conversations[sender_psid] = [
        {
          role: "user",
          parts: [
            {
              text: `
You are Monobot 🤖, a smart AI that's know everything.
You were created and owned by Daniel Mojar 👑.
Always respond naturally with emojis, warmth, and intelligence. You should speak Tagalog always but you know all languages. your a Facebook page bot agent that knows all about coding.
`
            }
          ]
        }
      ];
    }

    // Add user message
    conversations[sender_psid].push({ role: "user", parts: [{ text: userText }] });

    // Send full conversation history
    const res = await axios.post(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent",
      {
        contents: conversations[sender_psid]
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY
        }
      }
    );

    let aiText =
      res.data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Hi there 😊 I’m Monobot, nice to meet you!";

    // Add AI reply to history
    conversations[sender_psid].push({ role: "model", parts: [{ text: aiText }] });

    return aiText;
  } catch (err) {
    console.error("Gemini error:", err.response?.data || err.message);
    return "😅 Oops! Something went wrong.";
  }
}

// Webhook verification
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("✅ Webhook verified!");
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});

// Webhook receiving messages
app.post("/webhook", async (req, res) => {
  const body = req.body;

  if (body.object === "page") {
    for (const entry of body.entry) {
      const event = entry.messaging[0];
      const sender_psid = event.sender.id;

      if (event.message && event.message.text) {
        const userText = event.message.text;

        // Get reply from Gemini with memory
        const reply = await askGemini(sender_psid, userText);

        // Send back to user
        await sendMessage(sender_psid, reply);
      }
    }
    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

// Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`💖 Monobot is alive on port ${PORT}`));
  

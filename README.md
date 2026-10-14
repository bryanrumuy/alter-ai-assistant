# WhatsApp AI Assistant

An assistant that answers WhatsApp chats on your behalf while you are busy. It is built on
`whatsapp-web.js` and an OpenAI chat model, and it stays out of the way when you step in yourself.

## What it does

- Replies to private chats with a short, in-character message (groups and statuses are ignored).
- Remembers the last messages of each contact, stored in `brain.json`.
- Flags urgent messages: the model tags them and the bot forwards an alert to your own chat.
- Logs messages that need you (left messages, requests, questions only you can answer) to `followups.jsonl`, and optionally to a Google Sheet through `SHEETS_WEBHOOK_URL`. Send `/pending` to see the latest ones.
- Answers from your own facts: put FAQ or business info in `knowledge.md` (see `knowledge.example.md`) and the assistant uses only that for questions about you.
- Pauses itself in a chat for a while after you reply by hand (`MANUAL_PAUSE_MINUTES`).
- Sends a summary of what it answered to your own chat on a schedule (`REPORT_CRON`).
- Limits replies per contact per minute to avoid loops with other bots.
- Reconnects automatically after a disconnect and remembers whether it was switched on.

## Setup

1. Install Node.js 18 or newer, then run `npm install`.
2. Copy `.env.example` to `.env` and set `OPENAI_API_KEY`.
3. Run `npm start`, scan the QR code with WhatsApp (Linked devices), and wait for "Bot ready".

## Commands

Send these to your own chat ("Message yourself"):

| Command   | Effect                                   |
| --------- | ---------------------------------------- |
| `/on`     | Turn automatic replies on                |
| `/off`    | Turn automatic replies off               |
| `/status` | Show the current state                   |
| `/pending`| List the latest messages that need you   |
| `/help`   | List the commands                        |

The bot starts switched off. Send `/on` when you want it to answer.

## Tests and evaluation

- `npm test` runs the unit tests for the reply parsing, pause window, rate limiter and history trimming.
- `npm run eval` sends 20 test chats to the real model (greetings, questions only the owner can answer, general knowledge, an emergency, prompt-injection attempts, English) and checks each reply. It needs `OPENAI_API_KEY` and makes about 20 API calls. The checks are written by the author for this project, so read the result as a regression check, not a benchmark.

## Google Sheets (optional)

Create a Google Apps Script web app whose `doPost(e)` appends `JSON.parse(e.postData.contents)` as a row, deploy it, and put its URL in `SHEETS_WEBHOOK_URL`.

## Notes

- `whatsapp-web.js` automates WhatsApp Web and is not an official API. Use it on your own account at your own risk.
- `brain.json` holds real chat content. It is git-ignored: never publish it.

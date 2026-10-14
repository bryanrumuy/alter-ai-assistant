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

## Telegram version (official, free)

`npm run telegram` runs the same assistant as an official Telegram bot: no QR code, no unofficial API, no ban risk, and it uses long polling so no public server address is needed.

1. In Telegram open @BotFather, send `/newbot`, and copy the token into `TELEGRAM_BOT_TOKEN` in `.env`.
2. Run `npm run telegram`, send `/myid` to your bot, and put that number in `TELEGRAM_OWNER_ID`. Restart.
3. As the owner send `/on`. People who message the bot get answers; messages that need you are logged and sent to you at once. `/off`, `/status` and `/pending` work as well.

## Dashboard and business mode

- `npm run dashboard` opens an admin page (default `http://127.0.0.1:3100`, password from `DASHBOARD_PASSWORD`). It shows the follow-up queue (mark items done), every conversation, daily stats, the on/off switch for the Telegram bot, and an editor for the knowledge file.
- Conversations and follow-ups are stored in a SQLite file (`alter.db`, built-in `node:sqlite`, no extra dependency).
- Set `BOT_MODE=business` and `BUSINESS_NAME` to turn the assistant into a customer-service bot: it answers only from `knowledge.md` (see `knowledge.business-example.md`), never invents prices or promises, escalates complaints, refunds and discounts to the team, and flags urgent safety issues. `npm run eval:business` checks that behaviour with 10 scenarios.
- The dashboard has no user accounts, only one shared password. It is meant for localhost or a private network; put it behind HTTPS and a reverse proxy before exposing it.

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

## Run it on a server with Docker

The bot only answers while it is running, so for 24/7 use it needs a machine that stays on (a small VPS, Railway or Fly.io; Docker only packages the app, it does not provide the machine).

1. Copy the project and your `.env` to the server.
2. `docker compose up -d --build`
3. First start only: `docker compose logs -f`, scan the QR code that is printed, and wait for "Bot ready".

The WhatsApp session, chat memory and follow-ups live in the `bot-data` volume, so restarts do not need a new QR scan.

## Notes

- `whatsapp-web.js` automates WhatsApp Web and is not an official API. Use it on your own account at your own risk.
- `brain.json` holds real chat content. It is git-ignored: never publish it.

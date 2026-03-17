# Football Crawler System

This system includes a Discord bot, an admin web panel, and game modules (Aviator, Tiến Lên), using MongoDB to store betting and user data.

## 1) Architecture Overview

- **Bot runtime**: `src/index.js`
  - Connects to Discord gateway and handles slash commands.
  - Runs the Express server for admin/web APIs.
- **Admin Web**: `src/admin/public`
  - Match management interface.
- **Chat Web**: `src/chat/public`
- **Aviator Web**: `src/aviator/public`
- **Tiến Lên module**:
  - Server: `src/tienlen/server`
  - Client (Vite build): `src/tienlen/server/client`
- **Database models**: `src/models`

## 2) Requirements

- Node.js `>= 18`
- Local MongoDB or MongoDB Atlas
- Discord bot token and Application Client ID

## 3) Installation

```bash
npm install
npm install --prefix src/tienlen/server
npm install --prefix src/tienlen/server/client
```

## 4) `.env` Configuration

Create a `.env` file in the project root with minimum required values:

```env
DISCORD_TOKEN=
CLIENT_ID=
# optional: use only if you want guild-only command deployment
GUILD_ID=

MONGODB_URI=mongodb://127.0.0.1:27017/football_bot
PORT=3000
TIENLEN_PORT=3001
STARTING_BALANCE=0
```

Common optional variables:

```env
DISPLAY_LOCALE=en-US
DISPLAY_TIME_ZONE=Asia/Ho_Chi_Minh
MATCH_AUTO_LOCK_INTERVAL_MS=30000
KICKOFF_UTC_OFFSET_MINUTES=420

ESPN_EPL_AUTO_SYNC_ENABLED=true
ESPN_EPL_AUTO_CLOSE_ENABLED=true
ESPN_EPL_CREATE_SYNC_INTERVAL_MS=1800000
ESPN_EPL_LIVE_SYNC_INTERVAL_MS=120000
ESPN_EPL_PREMATCH_SYNC_CHECK_INTERVAL_MS=600000
ESPN_EPL_PREMATCH_SYNC_FAR_INTERVAL_MS=7200000
ESPN_EPL_PREMATCH_SYNC_NEAR_INTERVAL_MS=3600000
ESPN_EPL_PREMATCH_NEAR_WINDOW_MS=7200000
ESPN_EPL_SYNC_DAYS_AHEAD=7

ESPN_LALIGA_AUTO_SYNC_ENABLED=true
ESPN_LALIGA_AUTO_CLOSE_ENABLED=true
ESPN_LALIGA_CREATE_SYNC_INTERVAL_MS=1800000
ESPN_LALIGA_LIVE_SYNC_INTERVAL_MS=120000
ESPN_LALIGA_PREMATCH_SYNC_CHECK_INTERVAL_MS=600000
ESPN_LALIGA_PREMATCH_SYNC_FAR_INTERVAL_MS=7200000
ESPN_LALIGA_PREMATCH_SYNC_NEAR_INTERVAL_MS=3600000
ESPN_LALIGA_PREMATCH_NEAR_WINDOW_MS=7200000
ESPN_LALIGA_SYNC_DAYS_AHEAD=7

ESPN_UEFA_AUTO_SYNC_ENABLED=true
ESPN_UEFA_AUTO_CLOSE_ENABLED=true
ESPN_UEFA_CREATE_SYNC_INTERVAL_MS=1800000
ESPN_UEFA_LIVE_SYNC_INTERVAL_MS=120000
ESPN_UEFA_PREMATCH_SYNC_CHECK_INTERVAL_MS=600000
ESPN_UEFA_PREMATCH_SYNC_FAR_INTERVAL_MS=7200000
ESPN_UEFA_PREMATCH_SYNC_NEAR_INTERVAL_MS=3600000
ESPN_UEFA_PREMATCH_NEAR_WINDOW_MS=7200000
ESPN_UEFA_SYNC_DAYS_AHEAD=7

ESPN_NBA_AUTO_SYNC_ENABLED=true
ESPN_NBA_AUTO_CLOSE_ENABLED=true
ESPN_NBA_CREATE_SYNC_INTERVAL_MS=1800000
ESPN_NBA_LIVE_SYNC_INTERVAL_MS=120000
ESPN_NBA_PREMATCH_SYNC_CHECK_INTERVAL_MS=600000
ESPN_NBA_PREMATCH_SYNC_FAR_INTERVAL_MS=7200000
ESPN_NBA_PREMATCH_SYNC_NEAR_INTERVAL_MS=3600000
ESPN_NBA_PREMATCH_NEAR_WINDOW_MS=7200000
ESPN_NBA_SYNC_DAYS_AHEAD=7
```

## 5) Deploy Slash Commands

```bash
npm run deploy-commands
```

## 6) Run the System

### Standard mode (run bot + Tiến Lên server)

```bash
npm start
```

`npm start` will:
1. Free `PORT` and `TIENLEN_PORT` if they are in use.
2. Build the Tiến Lên client.
3. Start the bot (`src/index.js`) and Tiến Lên server.

### Skip Tiến Lên client build

```bash
npm run start:no-build
```

Or set:

```env
SKIP_TIENLEN_BUILD=true
```

### Run modules separately

```bash
npm run start:bot
npm run start:tienlen-server
```

### Stop processes that occupy system ports

```bash
npm run stop-all
```

## 7) Main Endpoints

- Admin: `http://localhost:3000/admin`
- Chat: `http://localhost:3000/chat`
- Aviator: `http://localhost:3000/aviator`
- Tiến Lên: `http://localhost:3001` (depends on module server config)

## 8) Available Scripts

- `npm start` — start all services (build + run)
- `npm run start:no-build` — start all, skip Tiến Lên client build
- `npm run stop-all` — free ports used by bot/Tiến Lên
- `npm run start:bot` — run bot only
- `npm run start:tienlen-server` — run Tiến Lên server only
- `npm run build:tienlen-client` — build Tiến Lên frontend
- `npm run deploy-commands` — deploy slash commands

## 9) Quick Troubleshooting

- **Missing package error when building Tiến Lên client**
  - Re-run:
  ```bash
  npm install --prefix src/tienlen/server/client
  npm run build:tienlen-client
  ```

- **Slash commands are not updated**
  - Re-run `npm run deploy-commands` and restart the bot.

- **Cannot connect to MongoDB**
  - Check `MONGODB_URI` in `.env`.
  - If using Atlas, verify IP whitelist and user credentials.

## 10) Production Notes

- Use PM2 or systemd for auto-restart.
- Follow deployment guidance in `deployment.md`.
- On VPS, open firewall for required web ports (for example `3000`).

# Deploy Football Discord Bot (VPS Ubuntu/Debian + MongoDB Atlas)

This guide deploys the bot on a VPS using Node.js and PM2, with MongoDB Atlas as the database.

## 1) Server setup

```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git
node -v
npm -v
```

### If apt asks about `/etc/ssh/sshd_config` (openssh-server update)

During `apt upgrade`, you may see a prompt like:

`What do you want to do about modified configuration file sshd_config?`

For remote VPS safety, choose:

- `keep the local version currently installed`

This keeps your current SSH settings and avoids accidentally losing access.

After upgrade, optionally verify SSH config and service:

```bash
sudo sshd -t
sudo systemctl status ssh
```

## 2) Get the source code

```bash
git clone <REPO_URL> football-crawler
cd football-crawler
npm install
npm install --prefix src/tienlen/server
npm install --prefix src/tienlen/server/client
```

Why this is needed:

- The root `npm install` only installs root dependencies.
- Tien Len server/client are separate packages with their own `package.json`.
- Without client dependencies, build can fail with `ERR_MODULE_NOT_FOUND: Cannot find package 'sharp'`.

## 3) Create .env

Create a `.env` file based on `.env.example` and fill in the values:

```
DISCORD_TOKEN=
CLIENT_ID=
GUILD_ID=
MONGODB_URI=
PORT=
STARTING_BALANCE=
PUBLIC_BASE_URL=
AVIATOR_TOKEN_SECRET=
AVIATOR_HOUSE_EDGE=
TIENLEN_TOKEN_SECRET=
TIENLEN_TOKEN_TTL_MS=
DISPLAY_LOCALE=
DISPLAY_TIME_ZONE=

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

## 4) Deploy slash commands

```bash
npm run deploy-commands
```

## 4.1) Build Tien Len frontend once (recommended)

```bash
npm run build:tienlen-client
```

After this, you can run services without rebuilding frontend each restart.

### Troubleshooting: `Cannot find package 'sharp'`

If `npm start` fails at `build-spritesheet.mjs` with missing `sharp`, run:

```bash
npm install --prefix src/tienlen/server/client
npm run build:tienlen-client
```

Then start again:

```bash
npm start
```

## 5) Run with PM2 (auto restart)

Install PM2 first (if `pm2` command is missing):

```bash
sudo npm i -g pm2
pm2 -v
```

```bash
pm2 start npm --name football-bot -- run start:no-build
pm2 save
pm2 startup
pm2 restart football-bot
```

`pm2 startup` will print a command starting with `sudo`. Run that command so the bot restarts on reboot.

If you update Tien Len frontend code later, rebuild once again:

```bash
npm run build:tienlen-client
pm2 restart football-bot
```

## 6) Open firewall for admin web (optional)

```bash
sudo ufw allow 3000/tcp
sudo ufw enable
```

Admin panel: `http://<VPS_IP>:3000/admin`

---

## Optional: Domain + HTTPS

If you want to use a domain with HTTPS, set up Nginx as a reverse proxy and use Certbot for SSL.


If you want to restart bot and update env:
```bash
pm2 restart football-bot --update-env
```
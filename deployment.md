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

## 2) Get the source code

```bash
git clone <REPO_URL> football-crawler
cd football-crawler
npm install
```

## 3) Create .env

Create a `.env` file based on `.env.example` and fill in the values:

```
DISCORD_TOKEN=...
CLIENT_ID=...
GUILD_ID=...        # optional, for guild-only commands
MONGODB_URI=...     # MongoDB Atlas URI
STARTING_BALANCE=1000
PORT=3000
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

## 5) Run with PM2 (auto restart)

```bash
sudo npm i -g pm2
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

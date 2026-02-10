# Football Discord Bot

Discord bot with a simple admin web panel for friendly football bets.

## Setup

1. Install dependencies:
   - `npm install`
2. Copy `.env.example` to `.env` and fill values:
   - `DISCORD_TOKEN`
   - `CLIENT_ID`
   - `GUILD_ID` (optional, for guild-only commands)
3. Start MongoDB locally or update `MONGODB_URI`.
4. Deploy slash commands:
   - `npm run deploy-commands`
5. Run the bot:
   - `npm start`

## Admin Panel

- Open `http://localhost:3000/admin`.
- Create matches, edit odds, and close matches to settle bets.

## Notes

- Bets use multipliers (odds). Win payout is `amount * multiplier`.
- Users start with `STARTING_BALANCE` points on first bet.

# Commission Feedback + Ticket Bot v2

Bot Discord untuk membuka ticket commission, mengelola status order, menutup ticket, lalu meminta rating 1-5.

## Flow
/customer -> /commission -> pilih jenis commission -> ticket private
-> staff handle -> /order-status -> selesai -> Close Ticket
-> tombol ⭐ Give Feedback -> rating + komentar -> #feedback

## Commands
Customer:
- /commission
- /feedback
- /myfeedback
- /stats

Staff/Admin:
- /order-status status:<open|progress|waiting|completed>
- /close-ticket
- /setup-commission
- /setup-feedback
- /feedback-delete id:<id>
- /feedback-lock locked:<true|false>

## Environment
Copy `.env.example` to `.env` and fill all IDs.

## Discord permissions
Bot needs:
- Manage Channels
- View Channels
- Send Messages
- Embed Links
- Read Message History
- Manage Messages
- Use Application Commands

Give the staff role access to ticket category/channels.

## Hosting
Railway: deploy from GitHub or upload project with Dockerfile.
Render: use Docker worker.
Pterodactyl: use Node.js 20 image, startup `npm start`, upload files, `npm install`.

IMPORTANT:
SQLite is included for simple deployment. On hosts with ephemeral storage, use a persistent volume/disk or move the database to PostgreSQL later.

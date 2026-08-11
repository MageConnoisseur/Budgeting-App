# Budgeting App

Full-stack budgeting app (web + future mobile) for monthly income, expenses, and savings planning, transaction tracking, and analysis.

**For product vision, architecture, and agent rules, see [`instructions.md`](./instructions.md).** Cursor agents auto-load [`AGENTS.md`](./AGENTS.md), which points them at that file.

## Database

PostgreSQL schema lives in [`database/tables.sql`](./database/tables.sql). Apply or reset it with:

```bash
pip install -r database/requirements.txt
python3 database/apply_tables.py
# python3 database/apply_tables.py --reset
```

Copy [`.env.example`](./.env.example) to `.env` and set `DATABASE_URL` / `DATABASE_URL_DIRECT`. See [`database/README.md`](./database/README.md).

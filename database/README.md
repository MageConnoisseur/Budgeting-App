# Database

PostgreSQL schema for the budgeting app.

| File | Role |
|------|------|
| `tables.sql` | Source of truth for table definitions |
| `apply_tables.py` | Executable that applies `tables.sql` to the DB |
| `requirements.txt` | Python deps for the apply script |

## Setup

1. Put connection strings in a root `.env` (see `.env.example`).
2. Install deps: `pip install -r database/requirements.txt`
3. Apply schema: `python database/apply_tables.py`

Reset and recreate (destructive):

```bash
python database/apply_tables.py --reset
```

When the schema changes, update **both** the live database (via the apply script) and `tables.sql`.

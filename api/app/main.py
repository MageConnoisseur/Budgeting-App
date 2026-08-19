"""FastAPI application entrypoint."""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.config import get_settings
from app.database import engine
from app.routers import auth, budgets, categories, dashboard, recurring_schedules, transactions

settings = get_settings()

app = FastAPI(
    title="Setaside API",
    description=(
        "Phase 1 REST API for personal budgeting: categories, monthly/annual plans, "
        "transactions (search/sort/filter), and dashboard insights. "
        "USD only. Over-budget is a soft warning — never blocked."
    ),
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    # Always allow Vercel preview/production hosts so registration from
    # *.vercel.app works even if CORS_ORIGINS was left at localhost defaults.
    allow_origin_regex=r"https://[\w.-]+\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(categories.router, prefix="/api")
app.include_router(budgets.router, prefix="/api")
app.include_router(transactions.router, prefix="/api")
app.include_router(recurring_schedules.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")


@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_exception_handler(
    _request: Request, exc: SQLAlchemyError
) -> JSONResponse:
    # Return JSON (with CORS) instead of a bare 500 text/plain that browsers
    # surface as a network/CORS failure on the web client.
    return JSONResponse(
        status_code=503,
        content={
            "detail": (
                "Database error while handling the request. "
                "If this is a fresh deploy, check that migrations ran and the "
                "schema matches the API (UUID users + preference columns)."
            ),
            "error_type": type(exc).__name__,
        },
    )


@app.get("/health")
def health() -> dict[str, str]:
    from app.services.mailer import mail_configured

    return {
        "status": "ok",
        "email": "resend" if mail_configured() else "log_only",
    }


@app.get("/health/ready")
def health_ready() -> JSONResponse:
    """Liveness + database connectivity / basic schema check."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            row = conn.execute(
                text(
                    """
                    SELECT data_type
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = 'users'
                      AND column_name = 'id'
                    """
                )
            ).first()
    except SQLAlchemyError as exc:
        return JSONResponse(
            status_code=503,
            content={"status": "db_unavailable", "detail": type(exc).__name__},
        )

    if row is None:
        return JSONResponse(
            status_code=503,
            content={"status": "schema_missing", "detail": "users table not found"},
        )

    data_type = str(row[0]).lower()
    if "uuid" not in data_type:
        return JSONResponse(
            status_code=503,
            content={
                "status": "schema_mismatch",
                "detail": f"users.id type is {data_type!r}, expected uuid",
            },
        )

    return JSONResponse(content={"status": "ok"})

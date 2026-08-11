"""FastAPI application entrypoint."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import auth, budgets, categories, dashboard, transactions

settings = get_settings()

app = FastAPI(
    title="Budgeting App API",
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
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(categories.router, prefix="/api")
app.include_router(budgets.router, prefix="/api")
app.include_router(transactions.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}

# ==========================================
# Builder Stage
# ==========================================
FROM python:3.12-slim AS builder

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

COPY --from=ghcr.io/astral-sh/uv:0.8.17 /uv /usr/local/bin/

# 先安裝第三方正式依賴，保留 Docker Layer Cache
COPY pyproject.toml uv.lock README.md ./

RUN uv sync --frozen --no-dev --no-install-project

# 複製專案程式碼
COPY ./app ./app
COPY ./docker-entrypoint.py ./docker-entrypoint.py

# 使用 Hatchling 安裝專案
RUN uv sync --frozen --no-dev


# ==========================================
# Production Stage
# ==========================================
FROM python:3.12-slim AS runtime

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH"

# 複製虛擬環境
COPY --from=builder /app/.venv /app/.venv

# 複製應用程式與啟動入口
COPY --from=builder /app/app ./app
COPY --from=builder /app/docker-entrypoint.py ./docker-entrypoint.py

EXPOSE 8000

ENTRYPOINT ["python", "/app/docker-entrypoint.py"]

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
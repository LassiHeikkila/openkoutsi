FROM python:3.14

WORKDIR /app

COPY pyproject.toml .

RUN pip install --no-cache-dir -r pyproject.toml

COPY . .
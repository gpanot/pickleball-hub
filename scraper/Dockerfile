FROM python:3.12-slim

RUN pip install --no-cache-dir psycopg2-binary anthropic pydantic requests

COPY scraper/ingest.py /app/ingest.py
COPY scraper/scan_clubs.py /app/scan_clubs.py
COPY scraper/entrypoint.py /app/entrypoint.py
COPY scraper/roster_scraper.py /app/roster_scraper.py
COPY scraper/dupr_refresh.py /app/dupr_refresh.py
COPY scraper/promotion/ /app/promotion/

WORKDIR /app

CMD ["python", "entrypoint.py"]

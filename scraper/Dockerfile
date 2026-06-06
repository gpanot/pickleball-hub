FROM python:3.12-slim
RUN pip install --no-cache-dir psycopg2-binary anthropic pydantic requests
COPY ingest.py /app/ingest.py
COPY scan_clubs.py /app/scan_clubs.py
COPY entrypoint.py /app/entrypoint.py
COPY roster_scraper.py /app/roster_scraper.py
COPY dupr_refresh.py /app/dupr_refresh.py
COPY promotion/ /app/promotion/
WORKDIR /app
CMD ["python", "entrypoint.py"]
FROM python:3.12-slim

RUN pip install --no-cache-dir psycopg2-binary

COPY scraper/ingest.py /app/ingest.py
COPY scraper/scan_clubs.py /app/scan_clubs.py
COPY scraper/run.sh /app/run.sh

# Strip any stray \r so the shebang works on Linux
RUN sed -i 's/\r$//' /app/run.sh && chmod +x /app/run.sh

WORKDIR /app

CMD ["sh", "/app/run.sh"]

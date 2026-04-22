FROM python:3.12-slim
RUN pip install --no-cache-dir psycopg2-binary
COPY scraper/ingest.py /app/ingest.py
WORKDIR /app
CMD ["python", "ingest.py"]

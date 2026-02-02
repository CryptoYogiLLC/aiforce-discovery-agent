# Database Inspector Dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY src/ ./src/

# Create non-root user
RUN useradd -m -u 1000 dbinspector && \
    chown -R dbinspector:dbinspector /app

USER dbinspector

# Environment variables
ENV DBINSPECTOR_SERVER_HOST=0.0.0.0 \
    DBINSPECTOR_SERVER_PORT=8003 \
    DBINSPECTOR_LOG_LEVEL=INFO

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8003/health || exit 1

EXPOSE 8003

# Run the application
CMD ["python", "-m", "src.main"]

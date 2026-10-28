FROM python:3.12-slim

WORKDIR /app

# Deno is required by yt-dlp to solve YouTube n/sig challenges (avoids googlevideo 403).
COPY --from=denoland/deno:bin-2.9.7 /deno /usr/local/bin/deno
ENV DENO_DIR=/tmp/deno

RUN apt-get update && apt-get install -y --no-install-recommends \
    libheif-dev \
    libde265-dev \
    libaom-dev \
    libdav1d-dev \
    ffmpeg \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && deno --version

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

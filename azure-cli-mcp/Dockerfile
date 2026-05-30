FROM python:3.11-slim

# Install Azure CLI
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates lsb-release gnupg \
 && curl -sL https://aka.ms/InstallAzureCLIDeb | bash \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py .
COPY startup.sh .
RUN chmod +x startup.sh

ENV PORT=8080
EXPOSE 8080

CMD ["./startup.sh"]

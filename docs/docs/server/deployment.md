---
title: Server Deployment
---

# Server Deployment

Claude Code Wrapper Server supports multiple deployment methods, from local development to production environments.

## Docker Deployment (Recommended)

### Using Docker Hub Image

```bash
docker run -d \
  --name ccw \
  -p 3456:3456 \
  -v ~/.ccw:/app/.ccw \
  musistudio/ccw:latest
```

### Using Docker Compose

Create `docker-compose.yml`:

```yaml
version: '3.8'
services:
  ccw:
    image: musistudio/ccw:latest
    container_name: ccw
    ports:
      - "3456:3456"
    volumes:
      - ./config:/app/.ccw
    environment:
      - LOG_LEVEL=info
      - HOST=0.0.0.0
      - PORT=3456
    restart: unless-stopped
```

Start the service:

```bash
docker-compose up -d
```

### Custom Build

Build Docker image from source:

```bash
git clone https://github.com/musistudio/ccw.git
cd ccw
docker build -t ccw:latest .
```

## Configuration File Mounting

Mount configuration file into container:

```bash
docker run -d \
  --name ccw \
  -p 3456:3456 \
  -v $(pwd)/config.json:/app/.ccw/config.json \
  musistudio/ccw:latest
```

Configuration file example:

```json5
{
  // Server configuration
  "HOST": "0.0.0.0",
  "PORT": 3456,
  "APIKEY": "your-api-key-here",

  // Logging configuration
  "LOG": true,
  "LOG_LEVEL": "info",

  // LLM provider configuration
  "Providers": [
    {
      "name": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "apiKey": "$OPENAI_API_KEY",
      "models": ["gpt-4", "gpt-3.5-turbo"]
    }
  ],

  // Routing configuration
  "Router": {
    "default": "openai,gpt-4"
  }
}
```

## Environment Variables

Override configuration through environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `HOST` | Listen address | `127.0.0.1` |
| `PORT` | Listen port | `3456` |
| `APIKEY` | API key | - |
| `LOG_LEVEL` | Log level | `debug` |
| `LOG` | Enable logging | `true` |

## Production Recommendations

### 1. Use Reverse Proxy

Use Nginx as reverse proxy:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3456;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 2. Configure HTTPS

Use Let's Encrypt to obtain free certificate:

```bash
sudo certbot --nginx -d your-domain.com
```

### 3. Log Management

Configure log rotation and persistence:

```yaml
version: '3.8'
services:
  ccw:
    image: musistudio/ccw:latest
    volumes:
      - ./logs:/app/.ccw/logs
    environment:
      - LOG_LEVEL=warn
```

### 4. Health Check

Configure Docker health check:

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3456/api/config"]
  interval: 30s
  timeout: 10s
  retries: 3
```

## Access Web UI

After deployment is complete, access the Web UI:

```
http://localhost:3456/ui/
```

Through the Web UI you can:
- View and manage configuration
- Monitor logs
- Check service status

## Secondary Development

If you need to develop based on CCW Server, please see [API Reference](/docs/category/api).

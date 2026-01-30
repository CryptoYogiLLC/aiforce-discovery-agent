FROM mcr.microsoft.com/devcontainers/base:ubuntu

# Install Go
ENV GO_VERSION=1.21.6
RUN curl -fsSL https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz | tar -C /usr/local -xz
ENV PATH="/usr/local/go/bin:${PATH}"

# Install Python
RUN apt-get update && apt-get install -y \
    python3.11 \
    python3.11-venv \
    python3-pip \
    && ln -sf /usr/bin/python3.11 /usr/bin/python \
    && ln -sf /usr/bin/python3.11 /usr/bin/python3

# Install Node.js
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs

# Install development tools
RUN apt-get install -y \
    git \
    make \
    curl \
    jq \
    && rm -rf /var/lib/apt/lists/*

# Install Go tools
RUN go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest

# Install Python tools
RUN pip install --no-cache-dir \
    ruff \
    mypy \
    pytest \
    pytest-cov \
    pre-commit

# Set workspace
WORKDIR /workspace

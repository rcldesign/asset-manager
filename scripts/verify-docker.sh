#!/bin/bash

# Docker Setup Verification Script

echo "==================================="
echo "Docker Setup Verification"
echo "==================================="
echo ""

# Check Docker
echo "Checking Docker installation..."
if command -v docker &> /dev/null; then
    echo "✓ Docker is installed"
    docker --version
else
    echo "✗ Docker is not installed or not in PATH"
    echo "  Please install Docker Desktop and enable WSL2 integration"
    echo "  Visit: https://docs.docker.com/desktop/windows/wsl/"
    exit 1
fi

echo ""

# Check Docker Compose
echo "Checking Docker Compose..."
if docker compose version &> /dev/null; then
    echo "✓ Docker Compose v2 is installed"
    docker compose version
elif command -v docker-compose &> /dev/null; then
    echo "✓ Docker Compose v1 is installed (consider upgrading to v2)"
    docker-compose --version
else
    echo "✗ Docker Compose is not installed"
    exit 1
fi

echo ""

# Check Docker daemon
echo "Checking Docker daemon..."
if docker info &> /dev/null; then
    echo "✓ Docker daemon is running"
else
    echo "✗ Docker daemon is not running"
    echo "  Please start Docker Desktop"
    exit 1
fi

echo ""

# Check required files
echo "Checking required files..."
FILES=("docker-compose.dev.yml" "docker-compose.prod.yml" "backend/Dockerfile" ".env.example")
for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "✓ $file exists"
    else
        echo "✗ $file is missing"
        exit 1
    fi
done

echo ""

# Check .env file
echo "Checking environment configuration..."
if [ -f ".env" ]; then
    echo "✓ .env file exists"
else
    echo "! .env file not found, copying from .env.example"
    cp .env.example .env
    echo "✓ .env file created from template"
fi

echo ""

# Check ports
echo "Checking port availability..."
PORTS=(3001 5432 6379)
for port in "${PORTS[@]}"; do
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo "✗ Port $port is already in use"
        echo "  Please stop the service using this port or change the port in .env"
    else
        echo "✓ Port $port is available"
    fi
done

echo ""
echo "==================================="
echo "Verification complete!"
echo "==================================="
echo ""
echo "Next steps:"
echo "1. Review and edit .env file if needed"
echo "2. Run: docker compose -f docker-compose.dev.yml up -d"
echo "3. Access the API at: http://localhost:3001"
echo ""
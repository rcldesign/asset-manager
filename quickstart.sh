#!/bin/bash

# DumbAssets Enhanced - Quick Start Script

echo ""
echo "██████╗ ██╗   ██╗███╗   ███╗██████╗  █████╗ ███████╗███████╗███████╗████████╗███████╗"
echo "██╔══██╗██║   ██║████╗ ████║██╔══██╗██╔══██╗██╔════╝██╔════╝██╔════╝╚══██╔══╝██╔════╝"
echo "██║  ██║██║   ██║██╔████╔██║██████╔╝███████║███████╗███████╗█████╗     ██║   ███████╗"
echo "██║  ██║██║   ██║██║╚██╔╝██║██╔══██╗██╔══██║╚════██║╚════██║██╔══╝     ██║   ╚════██║"
echo "██████╔╝╚██████╔╝██║ ╚═╝ ██║██████╔╝██║  ██║███████║███████║███████╗   ██║   ███████║"
echo "╚═════╝  ╚═════╝ ╚═╝     ╚═╝╚═════╝ ╚═╝  ╚═╝╚══════╝╚══════╝╚══════╝   ╚═╝   ╚══════╝"
echo ""
echo "                           E N H A N C E D   E D I T I O N"
echo ""
echo "===================================================================================="
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
   echo -e "${RED}Error: Please don't run this script as root${NC}"
   exit 1
fi

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check Docker
echo "Checking prerequisites..."
echo -n "Docker: "
if command_exists docker; then
    echo -e "${GREEN}✓${NC} $(docker --version)"
else
    echo -e "${RED}✗ Not found${NC}"
    echo ""
    echo "Please install Docker Desktop first:"
    echo "https://www.docker.com/products/docker-desktop"
    exit 1
fi

# Check Docker Compose
echo -n "Docker Compose: "
if docker compose version >/dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} $(docker compose version)"
elif command_exists docker-compose; then
    echo -e "${YELLOW}✓${NC} v1 detected (consider upgrading to v2)"
    COMPOSE_CMD="docker-compose"
else
    echo -e "${RED}✗ Not found${NC}"
    exit 1
fi

# Check if Docker is running
echo -n "Docker daemon: "
if docker info >/dev/null 2>&1; then
    echo -e "${GREEN}✓ Running${NC}"
else
    echo -e "${RED}✗ Not running${NC}"
    echo ""
    echo "Please start Docker Desktop"
    exit 1
fi

echo ""

# Check for existing .env
if [ ! -f .env ]; then
    echo "Creating environment configuration..."
    cp .env.example .env
    echo -e "${GREEN}✓${NC} Created .env from template"
else
    echo -e "${GREEN}✓${NC} Using existing .env file"
fi

echo ""

# Ask user for deployment type
echo "Select deployment type:"
echo "1) Development (with hot-reload)"
echo "2) Production (optimized)"
echo -n "Enter choice [1-2]: "
read -r choice

case $choice in
    1)
        echo ""
        echo "Starting development environment..."
        docker compose -f docker-compose.dev.yml up -d
        COMPOSE_FILE="docker-compose.dev.yml"
        ;;
    2)
        echo ""
        echo -e "${YELLOW}Warning: Production deployment requires proper configuration${NC}"
        echo "Please edit .env file and set:"
        echo "- JWT_SECRET (use: openssl rand -base64 32)"
        echo "- JWT_REFRESH_SECRET (use: openssl rand -base64 32)"
        echo "- SESSION_SECRET (use: openssl rand -base64 32)"
        echo "- ENCRYPTION_KEY (use: openssl rand -base64 24)"
        echo ""
        echo -n "Have you configured production secrets? [y/N]: "
        read -r confirm
        if [[ ! $confirm =~ ^[Yy]$ ]]; then
            echo "Please configure .env first"
            exit 1
        fi
        echo ""
        echo "Starting production environment..."
        docker compose -f docker-compose.prod.yml up -d
        COMPOSE_FILE="docker-compose.prod.yml"
        ;;
    *)
        echo "Invalid choice"
        exit 1
        ;;
esac

echo ""

# Wait for services
echo "Waiting for services to start..."
sleep 5

# Check health
echo -n "Checking health: "
if curl -f http://localhost:3001/health >/dev/null 2>&1; then
    echo -e "${GREEN}✓ Healthy${NC}"
else
    echo -e "${YELLOW}⚠ Services still starting...${NC}"
    echo "Check logs with: docker compose -f $COMPOSE_FILE logs -f"
fi

echo ""
echo "===================================================================================="
echo -e "${GREEN}DumbAssets Enhanced is starting!${NC}"
echo "===================================================================================="
echo ""
echo "Access points:"
echo "- API: http://localhost:3001"
echo "- API Documentation: http://localhost:3001/api-docs"
echo "- Health Check: http://localhost:3001/health"
echo ""
echo "Useful commands:"
echo "- View logs: docker compose -f $COMPOSE_FILE logs -f"
echo "- Stop: docker compose -f $COMPOSE_FILE down"
echo "- Shell: docker compose -f $COMPOSE_FILE exec backend sh"
echo ""
echo "Default admin credentials will be created on first access"
echo ""
echo "Happy asset tracking! 🚀"
echo ""
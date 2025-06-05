#!/bin/sh
set -e

# Check if we should use embedded PostgreSQL
if [ -z "$DATABASE_URL" ] || [ "$USE_EMBEDDED_DB" = "true" ]; then
    echo "Using embedded PostgreSQL..."
    export USE_EMBEDDED_DB=true
    export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/dumbassets_enhanced"
    
    # Initialize PostgreSQL if data directory is empty
    if [ ! -s /var/lib/postgresql/data/PG_VERSION ]; then
        echo "Initializing PostgreSQL database..."
        su - postgres -c "initdb -D /var/lib/postgresql/data"
        
        # Start PostgreSQL temporarily to create database
        su - postgres -c "pg_ctl -D /var/lib/postgresql/data -l /var/log/postgresql.log start"
        sleep 5
        
        # Create database
        su - postgres -c "createdb dumbassets_enhanced"
        
        # Stop PostgreSQL (supervisor will start it)
        su - postgres -c "pg_ctl -D /var/lib/postgresql/data stop"
    fi
else
    echo "Using external PostgreSQL: $DATABASE_URL"
    export USE_EMBEDDED_DB=false
fi

# Check if we should use embedded Redis
if [ -z "$REDIS_URL" ] || [ "$USE_EMBEDDED_REDIS" = "true" ]; then
    echo "Using embedded Redis..."
    export USE_EMBEDDED_REDIS=true
    export REDIS_URL="redis://localhost:6379"
else
    echo "Using external Redis: $REDIS_URL"
    export USE_EMBEDDED_REDIS=false
fi

# Wait for database to be ready (if external)
if [ "$USE_EMBEDDED_DB" = "false" ]; then
    echo "Waiting for external database to be ready..."
    until npx prisma db push --skip-generate > /dev/null 2>&1; do
        echo "Database is unavailable - sleeping"
        sleep 2
    done
    echo "Database is ready!"
fi

# Run database migrations
if [ "$NODE_ENV" = "production" ]; then
    echo "Running database migrations..."
    npx prisma migrate deploy
else
    echo "Pushing database schema..."
    npx prisma db push
fi

# Generate Prisma client
echo "Generating Prisma client..."
npx prisma generate

# Execute the main command
exec "$@"
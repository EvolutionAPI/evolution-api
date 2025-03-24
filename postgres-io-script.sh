#!/bin/bash

# Configuration
CONTAINER_NAME="postgres"  # Your PostgreSQL container name
IO_THRESHOLD=10  # Block I/O threshold in GiB

# Get container ID from name
CONTAINER_ID=$(docker ps --filter "name=$CONTAINER_NAME" --format "{{.ID}}")

if [ -z "$CONTAINER_ID" ]; then
  echo "$(date): Container '$CONTAINER_NAME' not found or not running. Exiting."
  exit 0
fi

# Get current block I/O usage and convert to proper numerical format
IO_RAW=$(docker stats $CONTAINER_ID --no-stream --format "{{.BlockIO}}")
echo "$(date): PostgreSQL block I/O usage: ${IO_RAW} (Threshold: ${IO_THRESHOLD}GB)"

# Extract the numerical value and handle MB/GB conversion
if [[ $IO_RAW == *"MB"* ]]; then
  IO_USAGE=$(echo $IO_RAW | sed 's/MB.*//' | tr -d ' ')
  # Convert MB to GB
  IO_USAGE=$(echo "scale=3; $IO_USAGE / 1024" | bc)
elif [[ $IO_RAW == *"GB"* ]]; then
  IO_USAGE=$(echo $IO_RAW | sed 's/GB.*//' | tr -d ' ')
else
  echo "$(date): Unknown format for I/O usage: $IO_RAW"
  exit 1
fi

echo "$(date): Converted I/O usage: ${IO_USAGE}GB"

# Check if I/O usage exceeds threshold using bc for decimal comparison
if (( $(echo "$IO_USAGE > $IO_THRESHOLD" | bc -l) )); then
  echo "$(date): Block I/O threshold exceeded! Restarting container..."
  docker stop $CONTAINER_NAME
  docker start $CONTAINER_NAME
  echo "$(date): Container restarted."
fi

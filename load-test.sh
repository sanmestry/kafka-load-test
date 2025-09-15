#!/bin/bash
set -euo pipefail

KAFKA_BROKER=${KAFKA_BROKER:-localhost:9092}
TOPIC=${TOPIC:-sessions}

echo "Deleting topic and old group..."
kafka-topics --bootstrap-server "$KAFKA_BROKER" --delete --topic "$TOPIC" || true
sleep 5

kafka-topics --bootstrap-server "$KAFKA_BROKER" --create --topic "$TOPIC" --partitions 1 --replication-factor 1 || true
sleep 5

rm -f load-test.log || true

echo "Starting load test..."
./k6 run \
  -e PRODUCER_VUS=20 \
  -e CONSUMER_VUS=10 \
  -e DURATION=10s \
  -e BATCH_SIZE=10 \
  -e PRODUCER_SLEEP=0.1 \
  load-test.js >> load-test.log 2>&1

echo "Load test completed."
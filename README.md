# Kafka Load Test with k6 (xk6-kafka)

This project provides a simple, configurable load test for Apache Kafka using k6 with the xk6-kafka extension. It produces and consumes messages concurrently to validate throughput and reliability, and it sets thresholds to fail the test on producer/consumer errors.

## Repository Layout
- load-test.js — k6 script using xk6-kafka to produce/consume messages
- load-test.sh — helper script to run the test with common parameters
- k6/ — optional folder for k6-related assets (if any)

## Prerequisites
- Kafka broker accessible at localhost:9092 by default, or update the script to point to your brokers
- k6 with xk6-kafka extension installed
  - Install xk6: https://github.com/grafana/xk6
  - Build k6 with xk6-kafka:
    ```bash
    xk6 build --with github.com/mostafa/xk6-kafka@latest
    ./k6 version
    ```

## What the test does
- Producer VUs ramp up, send base64-encoded messages to topic `sessions` in batches, sleep briefly, and repeat.
- Consumer VUs ramp up a few seconds after producer start and read messages from the beginning (FirstOffset), verifying keys and values exist.
- Thresholds enforce zero errors for writer and reader.

## Configuration (Environment Variables)
These can be exported in your shell or passed inline before the run command.

- PRODUCER_VUS: number of virtual users producing messages (default: 20)
- CONSUMER_VUS: number of virtual users consuming messages (default: 10)
- DURATION: duration of the steady state (stages have 10s ramp up/down around it) (default: 30s)
- BATCH_SIZE: messages per produce/consume operation (default: 10)
- PRODUCER_SLEEP: seconds the producer sleeps between iterations (default: 0.1)

Note: Brokers and topic are currently hardcoded in load-test.js as:
- Brokers: ["localhost:9092"]
- Topic: "sessions"
Update those constants in the script if your environment differs.

## How to Run
You can run with the helper script or directly with k6.

### Using the helper script
```bash
# make the script executable once
chmod +x ./load-test.sh

# run with defaults
./load-test.sh

# or with custom settings
PRODUCER_VUS=50 CONSUMER_VUS=25 DURATION=1m BATCH_SIZE=20 PRODUCER_SLEEP=0.05 ./load-test.sh
```

### Running directly with k6
If you built k6 with xk6-kafka:
```bash
# default
./k6 run load-test.js
```
# with settings
Please update settings in load-test.sh script


## Interpreting Results
- The script defines thresholds:
  - kafka_writer_error_count: count == 0
  - kafka_reader_error_count: count == 0
- If any errors occur, the test will fail. Check the console output for error details from producer/consumer blocks.
- Standard k6 metrics such as iterations and VU activity also appear in the summary.

## Common Issues & Troubleshooting
- xk6-kafka not found: Ensure you built k6 with the extension and are invoking the correct binary (e.g., ./k6).
- Connection errors to Kafka: Verify broker address/port and that listeners are configured correctly; change brokers in load-test.js if not using localhost:9092.
- No messages consumed: Ensure topic exists and that consumers start after producers; the script delays consumer start by 10s and uses FirstOffset.

## Known-Issues
- There seems a race condition the moment I introduce group-id for the consumer. I had tried putting in unique group id, resetting it however the consumer just fails with the error "Unable to read messages., OriginalError: fetching message: context deadline exceeded"
- To overcome this, I have removed the group id completely, so all the kafka consumers now read the full copy of all the messages.

## Findings
1) Baseline: (20 producer VUs, 10 consumer VUs, 10s duration, batch size 10, producer sleep 0.1s):
- 100% Success Rate: The test was a complete success, with 100% checks passing. There were no producer errors, no consumer errors, and no timeouts.
- High Throughput: 20 producer VUs generated a significant load, writing ~40K messages at a rate of 985 messages/second.
- Massive Consumer Activity: Because each of the 10 consumer VUs reads independently (without a groupID), they collectively read 20,758 messages.
- Significant Lag: The final consumer lag was 8,400 messages. This indicates that the producers are creating messages much faster than the consumers can read them, which is expected given the 20 producer VUs versus 10 consumer VUs.

2) Peak Traffic: (100 producer VUs, 10 consumer VUs, 5m duration, batch size 20, producer sleep 0.1s):
//TODO
3) Stress Test: (200 producer VUs, 50 consumer VUs, 15m duration, batch size 50, producer sleep 0.1s):
//TODO
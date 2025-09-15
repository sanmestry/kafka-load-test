import { check, sleep } from 'k6';
import * as kafka from 'k6/x/kafka';
import { b64encode } from 'k6/encoding';

const kafkaBrokers = ['localhost:9092'];
const kafkaTopic = 'sessions';

const producerVUs = parseInt(__ENV.PRODUCER_VUS) || 20;
const consumerVUs = parseInt(__ENV.CONSUMER_VUS) || 10;
const testDuration = __ENV.DURATION || '30s';
const messageBatchSize = parseInt(__ENV.BATCH_SIZE) || 10;
const producerSleep = parseFloat(__ENV.PRODUCER_SLEEP || '0.1');

export const options = {
    scenarios: {
        producer_scenario: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '10s', target: producerVUs },
                { duration: testDuration, target: producerVUs },
                { duration: '10s', target: 0 },
            ],
            gracefulRampDown: '10s',
            exec: 'producer',
        },
        consumer_scenario: {
            executor: 'ramping-vus',
            startTime: '10s', // start consumers after producers
            startVUs: 0,
            stages: [
                { duration: '10s', target: consumerVUs },
                { duration: testDuration, target: consumerVUs },
                { duration: '10s', target: 0 },
            ],
            gracefulRampDown: '10s',
            exec: 'consumer',
        },
    },
    thresholds: {
        'kafka_writer_error_count': ['count == 0'],
        'kafka_reader_error_count': ['count == 0'],
    },
};

const writer = new kafka.Writer({
    brokers: kafkaBrokers,
    topic: kafkaTopic,
    valueEncoding: 'base64',
});

const reader = new kafka.Reader({
    brokers: kafkaBrokers,
    topic: kafkaTopic,
    valueEncoding: 'base64',
    startOffset: kafka.FirstOffset,
});

export function producer() {
    const messages = [];
    for (let i = 0; i < messageBatchSize; i++) {
        const key = b64encode(`key-${__VU}-${__ITER}-${i}`);
        const value = b64encode(`value-${__VU}-${__ITER}-${i}`);
        messages.push({ key, value });
    }

    try {
        writer.produce({ messages });
        check(null, { 'produce successful': () => true });
    } catch (error) {
        console.error(error);
        check(null, { 'produce successful': () => false });
    }
    sleep(producerSleep);
}

export function consumer() {
    try {
        const consumedMessages = reader.consume({
            limit: messageBatchSize,
            timeout: '10s',
        });

        check(consumedMessages, {
            'received messages': msgs => msgs.length > 0,
            'all messages valid': msgs => msgs.every(m => m.key && m.value),
        });
    } catch (error) {
        console.error('Error in consumer:', error);
        check(null, { 'consumer error': () => false });
    }
    sleep(0.1);
}

export function teardown() {
    writer.close();
    reader.close();
}

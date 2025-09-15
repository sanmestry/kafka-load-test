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
        messages.push(generateMessage());
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

function generateMessage() {
    const getRandomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];

    const cdns = ['Akamai', 'Cloudflare', 'Fastly', 'CloudFront'];
    const platforms = ['dotcom', 'mobile', 'ctv'];
    const channels = ['sports', 'news', 'movies', 'series', 'live'];
    const asns = ['AS15169', 'AS7922', 'AS3356', 'AS16509'];
    const profiles = [720, 1200, 2800, 4500, 6000];

    const jwtPayload = {
        sessionID: `sid-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`,
        platform: getRandomItem(platforms),
        channel: getRandomItem(channels),
        asn: getRandomItem(asns),
    };

    const mockJwtHeader = b64encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }), 'url');
    const mockJwtPayload = b64encode(JSON.stringify(jwtPayload), 'url');
    const mockJwtSignature = 'fake-signature-for-load-test';
    const jwtToken = `${mockJwtHeader}.${mockJwtPayload}.${mockJwtSignature}`;

    const finalMessage = {
        currentCDN: getRandomItem(cdns),
        lastObservedVideoProfile: getRandomItem(profiles),
        jwtToken: jwtToken,
    };

    return {
        key: b64encode(`key-${__VU}-${__ITER}`),
        value: b64encode(JSON.stringify(finalMessage)),
    };
}

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The four CHATBOT_* variables that decide whether the feature is on at all must
 * be declared in the compose file.
 *
 * `docker-compose.yml` enumerates the api's environment by name; a value present
 * only in `.env` never reaches the container, so the assistant stays silently
 * inert and nothing fails — an assistant that is configured but never switched
 * on looks exactly like one that is off. (The api guide states the rule under
 * "Reuse, don't reinvent".)
 *
 * Scoped to the enablement four on purpose. The tuning variables (timeouts,
 * retry, throttle, prices) are not all declared today; that gap is pre-existing
 * and larger, and this guard is about the switch, not the dials.
 */
const ROOT = resolve(__dirname, '../../../..');
const COMPOSE = resolve(ROOT, 'docker-compose.yml');

const ENABLEMENT_VARS = [
  'CHATBOT_PROVIDER',
  'CHATBOT_API_BASE_URL',
  'CHATBOT_API_KEY',
  'CHATBOT_MODEL',
];

describe('chatbot enablement environment variables', () => {
  it('are all declared in docker-compose.yml', () => {
    const compose = readFileSync(COMPOSE, 'utf8');

    const missing = ENABLEMENT_VARS.filter((name) => !compose.includes(`${name}:`));
    expect(missing, `not declared in docker-compose.yml: ${missing.join(', ')}`).toEqual([]);
  });
});

import type { Clawntenna } from '../client.js';
import { outputError } from './util.js';
import { decodeContractError } from './errors.js';

function parseNumericId(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export async function resolveAppId(
  client: Clawntenna,
  {
    appId,
    app,
    positional,
    json,
    subject = 'app',
  }: {
    appId?: string;
    app?: string;
    positional?: string;
    json: boolean;
    subject?: string;
  }
): Promise<number> {
  const flaggedId = parseNumericId(appId);
  if (flaggedId !== null) return flaggedId;

  const positionalId = parseNumericId(positional);
  if (positionalId !== null) return positionalId;

  const appName = app ?? (positional && positionalId === null ? positional : undefined);
  if (!appName) {
    outputError(`Missing ${subject} selector. Pass --app, --app-id, or a numeric ${subject} ID.`, json);
  }

  const resolvedId = await client.getApplicationIdByName(appName);
  if (!resolvedId) {
    outputError(`Application not found: ${appName}`, json);
  }

  return resolvedId;
}

export async function resolveTopicId(
  client: Clawntenna,
  {
    topicId,
    topic,
    positional,
    appId,
    app,
    appPositional,
    json,
  }: {
    topicId?: string;
    topic?: string;
    positional?: string;
    appId?: string;
    app?: string;
    appPositional?: string;
    json: boolean;
  }
): Promise<number> {
  const flaggedId = parseNumericId(topicId);
  if (flaggedId !== null) return flaggedId;

  const positionalId = parseNumericId(positional);
  if (positionalId !== null) return positionalId;

  const topicName = topic ?? (positional && positionalId === null ? positional : undefined);
  if (!topicName) {
    outputError('Missing topic selector. Pass --topic, --topic-id, or a numeric topic ID.', json);
  }

  const resolvedAppId = await resolveAppId(client, {
    appId,
    app,
    positional: appPositional,
    json,
    subject: 'app for topic lookup',
  });

  let resolvedTopicId = 0;
  try {
    resolvedTopicId = await client.getTopicIdByName(resolvedAppId, topicName);
  } catch (error) {
    const message = decodeContractError(error);
    outputError(`Topic lookup failed for "${topicName}" in app ${resolvedAppId}: ${message}`, json);
  }

  if (!resolvedTopicId) {
    outputError(`Topic not found: ${topicName} in app ${resolvedAppId}`, json);
  }

  return resolvedTopicId;
}

import { loadClient, output, outputError, type CommonFlags } from './util.js';
import { AccessLevel } from '../types.js';

const ACCESS_NAMES = ['public', 'limited', 'private'] as const;

export async function topicsList(appId: number, flags: CommonFlags) {
  const client = loadClient(flags, false);
  const json = flags.json ?? false;

  const topicIds = await client.getApplicationTopics(appId);

  const topics = await Promise.all(
    topicIds.map(async (id) => {
      const t = await client.getTopic(Number(id));
      return {
        id: t.id.toString(),
        name: t.name,
        description: t.description,
        accessLevel: ACCESS_NAMES[t.accessLevel] ?? t.accessLevel,
        messageCount: t.messageCount.toString(),
        active: t.active,
      };
    })
  );

  if (json) {
    output(topics, true);
  } else {
    if (topics.length === 0) {
      console.log(`No topics found for app ${appId}.`);
      return;
    }
    console.log(`Topics for app ${appId}:\n`);
    for (const t of topics) {
      console.log(`  #${t.id} ${t.name} [${t.accessLevel}] - ${t.messageCount} msgs`);
    }
    console.log(`\n${topics.length} topic(s).`);
  }
}

export async function topicInfo(topicId: number, flags: CommonFlags) {
  const client = loadClient(flags, false);
  const json = flags.json ?? false;

  const t = await client.getTopic(topicId);

  if (json) {
    output({
      id: t.id.toString(),
      applicationId: t.applicationId.toString(),
      name: t.name,
      description: t.description,
      owner: t.owner,
      creator: t.creator,
      createdAt: t.createdAt.toString(),
      lastMessageAt: t.lastMessageAt.toString(),
      messageCount: t.messageCount.toString(),
      accessLevel: ACCESS_NAMES[t.accessLevel] ?? t.accessLevel,
      active: t.active,
    }, true);
  } else {
    console.log(`Topic #${t.id}`);
    console.log(`  Name:         ${t.name}`);
    console.log(`  Description:  ${t.description}`);
    console.log(`  App:          ${t.applicationId}`);
    console.log(`  Access:       ${ACCESS_NAMES[t.accessLevel] ?? t.accessLevel}`);
    console.log(`  Owner:        ${t.owner}`);
    console.log(`  Creator:      ${t.creator}`);
    console.log(`  Messages:     ${t.messageCount}`);
    console.log(`  Active:       ${t.active}`);
  }
}

export async function topicCreate(
  appId: number,
  name: string,
  description: string,
  access: string,
  flags: CommonFlags
) {
  const client = loadClient(flags);
  const json = flags.json ?? false;

  const levelMap: Record<string, AccessLevel> = {
    public: AccessLevel.PUBLIC,
    limited: AccessLevel.PUBLIC_LIMITED,
    private: AccessLevel.PRIVATE,
  };
  const level = levelMap[access];
  if (level === undefined) {
    outputError(`Invalid access level: ${access}. Use public, limited, or private.`, json);
  }

  if (!json) console.log(`Creating topic "${name}" in app ${appId} (${access})...`);

  const tx = await client.createTopic(appId, name, description, level);
  const receipt = await tx.wait();

  if (json) {
    output({ txHash: tx.hash, blockNumber: receipt?.blockNumber, appId, access }, true);
  } else {
    console.log(`TX: ${tx.hash}`);
    console.log(`Confirmed in block ${receipt?.blockNumber}`);
  }
}

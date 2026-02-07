import { loadClient, output, type CommonFlags } from './util.js';

export async function schemaCreate(
  appId: number,
  name: string,
  description: string,
  body: string,
  flags: CommonFlags
) {
  const client = loadClient(flags);
  const json = flags.json ?? false;

  if (!json) console.log(`Creating schema "${name}" in app ${appId}...`);

  const tx = await client.createAppSchema(appId, name, description, body);
  const receipt = await tx.wait();

  if (json) {
    output({ txHash: tx.hash, blockNumber: receipt?.blockNumber, appId }, true);
  } else {
    console.log(`TX: ${tx.hash}`);
    console.log(`Confirmed in block ${receipt?.blockNumber}`);
  }
}

export async function schemaInfo(schemaId: number, flags: CommonFlags) {
  const client = loadClient(flags, false);
  const json = flags.json ?? false;

  const s = await client.getSchema(schemaId);

  if (json) {
    output(s, true);
  } else {
    console.log(`Schema #${s.id}`);
    console.log(`  Name:         ${s.name}`);
    console.log(`  Description:  ${s.description}`);
    console.log(`  Creator:      ${s.creator}`);
    console.log(`  App:          ${s.applicationId}`);
    console.log(`  Versions:     ${s.versionCount}`);
    console.log(`  Active:       ${s.active}`);
  }
}

export async function schemaList(appId: number, flags: CommonFlags) {
  const client = loadClient(flags, false);
  const json = flags.json ?? false;

  const schemas = await client.getApplicationSchemas(appId);

  if (json) {
    output(schemas, true);
  } else {
    if (schemas.length === 0) {
      console.log(`No schemas for app ${appId}.`);
      return;
    }
    console.log(`Schemas for app ${appId}:\n`);
    for (const s of schemas) {
      console.log(`  #${s.id} ${s.name} (${s.versionCount} version(s)) ${s.active ? '' : '[inactive]'}`);
    }
    console.log(`\n${schemas.length} schema(s).`);
  }
}

export async function schemaBind(topicId: number, schemaId: number, version: number, flags: CommonFlags) {
  const client = loadClient(flags);
  const json = flags.json ?? false;

  if (!json) console.log(`Binding schema #${schemaId} v${version} to topic ${topicId}...`);

  const tx = await client.setTopicSchema(topicId, schemaId, version);
  const receipt = await tx.wait();

  if (json) {
    output({ txHash: tx.hash, blockNumber: receipt?.blockNumber, topicId, schemaId, version }, true);
  } else {
    console.log(`TX: ${tx.hash}`);
    console.log(`Confirmed in block ${receipt?.blockNumber}`);
  }
}

export async function schemaUnbind(topicId: number, flags: CommonFlags) {
  const client = loadClient(flags);
  const json = flags.json ?? false;

  if (!json) console.log(`Clearing schema from topic ${topicId}...`);

  const tx = await client.clearTopicSchema(topicId);
  const receipt = await tx.wait();

  if (json) {
    output({ txHash: tx.hash, blockNumber: receipt?.blockNumber, topicId }, true);
  } else {
    console.log(`TX: ${tx.hash}`);
    console.log(`Confirmed in block ${receipt?.blockNumber}`);
  }
}

export async function schemaTopic(topicId: number, flags: CommonFlags) {
  const client = loadClient(flags, false);
  const json = flags.json ?? false;

  const binding = await client.getTopicSchema(topicId);

  if (json) {
    output(binding, true);
  } else {
    if (binding.schemaId === 0) {
      console.log(`Topic ${topicId} has no schema bound.`);
    } else {
      console.log(`Topic ${topicId} schema:`);
      console.log(`  Schema ID: ${binding.schemaId}`);
      console.log(`  Version:   ${binding.version}`);
      console.log(`  Body:      ${binding.body.slice(0, 100)}${binding.body.length > 100 ? '...' : ''}`);
    }
  }
}

export async function schemaVersion(schemaId: number, version: number, flags: CommonFlags) {
  const client = loadClient(flags, false);
  const json = flags.json ?? false;

  const body = await client.getSchemaBody(schemaId, version);

  if (json) {
    output({ schemaId, version, body }, true);
  } else {
    console.log(body);
  }
}

export async function schemaPublish(schemaId: number, body: string, flags: CommonFlags) {
  const client = loadClient(flags);
  const json = flags.json ?? false;

  if (!json) console.log(`Publishing new version for schema #${schemaId}...`);

  const tx = await client.publishSchemaVersion(schemaId, body);
  const receipt = await tx.wait();

  if (json) {
    output({ txHash: tx.hash, blockNumber: receipt?.blockNumber, schemaId }, true);
  } else {
    console.log(`TX: ${tx.hash}`);
    console.log(`Confirmed in block ${receipt?.blockNumber}`);
  }
}

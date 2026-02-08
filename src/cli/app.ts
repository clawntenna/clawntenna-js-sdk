import { ethers } from 'ethers';
import { REGISTRY_ABI } from '../contracts.js';
import { loadClient, output, outputError, type CommonFlags } from './util.js';

export async function appInfo(appId: number, flags: CommonFlags) {
  const client = loadClient(flags, false);
  const json = flags.json ?? false;
  const app = await client.getApplication(appId);

  if (json) {
    output({
      id: app.id.toString(),
      name: app.name,
      description: app.description,
      frontendUrl: app.frontendUrl,
      owner: app.owner,
      createdAt: app.createdAt.toString(),
      memberCount: app.memberCount,
      topicCount: app.topicCount,
      active: app.active,
      allowPublicTopicCreation: app.allowPublicTopicCreation,
    }, true);
  } else {
    console.log(`Application #${app.id}`);
    console.log(`  Name:        ${app.name}`);
    console.log(`  Description: ${app.description}`);
    console.log(`  URL:         ${app.frontendUrl || '(none)'}`);
    console.log(`  Owner:       ${app.owner}`);
    console.log(`  Members:     ${app.memberCount}`);
    console.log(`  Topics:      ${app.topicCount}`);
    console.log(`  Active:      ${app.active}`);
    console.log(`  Public topics: ${app.allowPublicTopicCreation}`);
  }
}

export async function appCreate(
  name: string,
  description: string,
  url: string,
  isPublic: boolean,
  flags: CommonFlags
) {
  const client = loadClient(flags);
  const json = flags.json ?? false;

  if (!json) console.log(`Creating application "${name}" on ${flags.chain}...`);

  const tx = await client.createApplication(name, description, url, isPublic);
  if (!json) console.log(`TX submitted: ${tx.hash}`);

  const receipt = await tx.wait();
  let appId: string | null = null;
  if (receipt) {
    const iface = new ethers.Interface(REGISTRY_ABI);
    const parsed = receipt.logs.map(l => { try { return iface.parseLog(l); } catch { return null; } }).find(l => l?.name === 'ApplicationCreated');
    appId = parsed?.args?.applicationId?.toString() ?? null;
  }

  if (json) {
    output({ txHash: tx.hash, blockNumber: receipt?.blockNumber, appId, chain: flags.chain }, true);
  } else {
    if (appId) console.log(`Application created with ID: ${appId}`);
    console.log(`Confirmed in block ${receipt?.blockNumber}`);
  }
}

export async function appUpdateUrl(appId: number, url: string, flags: CommonFlags) {
  const client = loadClient(flags);
  const json = flags.json ?? false;

  if (!json) console.log(`Updating frontend URL for app ${appId}...`);

  const tx = await client.updateFrontendUrl(appId, url);
  const receipt = await tx.wait();

  if (json) {
    output({ txHash: tx.hash, blockNumber: receipt?.blockNumber, appId }, true);
  } else {
    console.log(`TX: ${tx.hash}`);
    console.log(`Confirmed in block ${receipt?.blockNumber}`);
  }
}

import { ethers } from 'ethers';
import { loadClient, output, type CommonFlags } from './util.js';

export async function membersList(appId: number, flags: CommonFlags) {
  const client = loadClient(flags, false);
  const json = flags.json ?? false;

  const raw = await client.getApplicationMembers(appId);
  const addresses = [...new Set(raw)].filter(a => a !== ethers.ZeroAddress);

  const members = await Promise.all(
    addresses.map(async (addr) => {
      const m = await client.getMember(appId, addr);
      return {
        address: m.account,
        nickname: m.nickname,
        roles: m.roles,
        joinedAt: m.joinedAt.toString(),
      };
    })
  );

  if (json) {
    output(members, true);
  } else {
    if (members.length === 0) {
      console.log(`No members in app ${appId}.`);
      return;
    }
    console.log(`Members of app ${appId}:\n`);
    for (const m of members) {
      console.log(`  ${m.address.slice(0, 10)}... ${m.nickname || '(no nickname)'} roles=${m.roles}`);
    }
    console.log(`\n${members.length} member(s).`);
  }
}

export async function memberInfo(appId: number, address: string, flags: CommonFlags) {
  const client = loadClient(flags, false);
  const json = flags.json ?? false;

  const m = await client.getMember(appId, address);

  if (json) {
    output({
      address: m.account,
      nickname: m.nickname,
      roles: m.roles,
      joinedAt: m.joinedAt.toString(),
    }, true);
  } else {
    console.log(`Member ${m.account}`);
    console.log(`  Nickname: ${m.nickname || '(none)'}`);
    console.log(`  Roles:    ${m.roles}`);
    console.log(`  Joined:   ${new Date(Number(m.joinedAt) * 1000).toISOString()}`);
  }
}

export async function memberAdd(
  appId: number,
  address: string,
  nickname: string,
  roles: number,
  flags: CommonFlags
) {
  const client = loadClient(flags);
  const json = flags.json ?? false;

  if (!json) console.log(`Adding member ${address} to app ${appId}...`);

  const tx = await client.addMember(appId, address, nickname, roles);
  const receipt = await tx.wait();

  if (json) {
    output({ txHash: tx.hash, blockNumber: receipt?.blockNumber, appId, address, roles }, true);
  } else {
    console.log(`TX: ${tx.hash}`);
    console.log(`Confirmed in block ${receipt?.blockNumber}`);
  }
}

export async function memberRemove(appId: number, address: string, flags: CommonFlags) {
  const client = loadClient(flags);
  const json = flags.json ?? false;

  if (!json) console.log(`Removing member ${address} from app ${appId}...`);

  const tx = await client.removeMember(appId, address);
  const receipt = await tx.wait();

  if (json) {
    output({ txHash: tx.hash, blockNumber: receipt?.blockNumber, appId, address }, true);
  } else {
    console.log(`TX: ${tx.hash}`);
    console.log(`Confirmed in block ${receipt?.blockNumber}`);
  }
}

export async function memberRoles(appId: number, address: string, roles: number, flags: CommonFlags) {
  const client = loadClient(flags);
  const json = flags.json ?? false;

  if (!json) console.log(`Updating roles for ${address} in app ${appId}...`);

  const tx = await client.updateMemberRoles(appId, address, roles);
  const receipt = await tx.wait();

  if (json) {
    output({ txHash: tx.hash, blockNumber: receipt?.blockNumber, appId, address, roles }, true);
  } else {
    console.log(`TX: ${tx.hash}`);
    console.log(`Confirmed in block ${receipt?.blockNumber}`);
  }
}

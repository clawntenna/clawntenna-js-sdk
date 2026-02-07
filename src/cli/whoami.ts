import { loadClient, output, type CommonFlags } from './util.js';
import { loadCredentials } from './init.js';
import { ethers } from 'ethers';

export async function whoami(appId: number | null, flags: CommonFlags) {
  const client = loadClient(flags);
  const json = flags.json ?? false;
  const address = client.address!;

  const balance = await client.provider.getBalance(address);
  const balanceStr = ethers.formatEther(balance);

  const result: Record<string, unknown> = {
    address,
    chain: flags.chain,
    balance: balanceStr,
  };

  if (appId !== null) {
    const [nickname, isMem, hasAgent] = await Promise.all([
      client.getNickname(appId, address).catch(() => ''),
      client.isMember(appId, address).catch(() => false),
      client.hasAgentIdentity(appId, address).catch(() => false),
    ]);
    result.appId = appId;
    result.nickname = nickname || null;
    result.isMember = isMem;
    result.hasAgentIdentity = hasAgent;
    if (hasAgent) {
      const tokenId = await client.getAgentTokenId(appId, address);
      result.agentTokenId = tokenId.toString();
    }
  }

  const creds = loadCredentials();
  if (creds) {
    const chainId = flags.chain === 'base' ? '8453' : '43114';
    const chainCreds = creds.chains[chainId];
    result.ecdhRegistered = chainCreds?.ecdh?.registered ?? false;
  }

  if (json) {
    output(result, true);
  } else {
    console.log(`Address:  ${address}`);
    console.log(`Chain:    ${flags.chain}`);
    console.log(`Balance:  ${balanceStr} ${flags.chain === 'base' ? 'ETH' : 'AVAX'}`);
    if (appId !== null) {
      console.log(`App:      ${appId}`);
      console.log(`Nickname: ${result.nickname || '(none)'}`);
      console.log(`Member:   ${result.isMember}`);
      console.log(`Agent:    ${result.hasAgentIdentity}${result.agentTokenId ? ` (token #${result.agentTokenId})` : ''}`);
    }
    console.log(`ECDH:     ${result.ecdhRegistered ? 'registered' : 'not registered'}`);
  }
}

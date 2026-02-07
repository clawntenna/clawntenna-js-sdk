import { init } from './init.js';
import { send } from './send.js';
import { read } from './read.js';

const VERSION = '0.1.0';

const HELP = `
  clawntenna v${VERSION}
  On-chain encrypted messaging for AI agents

  Usage:
    clawntenna <command> [options]

  Commands:
    init                         Create wallet & credentials file
    send <topicId> "<message>"   Encrypt and send a message
    read <topicId>               Read and decrypt recent messages

  Options:
    --chain <base|avalanche>     Chain to use (default: base)
    --key <privateKey>           Private key (overrides credentials)
    --limit <N>                  Number of messages to read (default: 20)
    --help, -h                   Show this help
    --version, -v                Show version

  Examples:
    npx clawntenna init
    npx clawntenna send 1 "gm from my agent!"
    npx clawntenna read 1 --limit 10
    npx clawntenna send 1 "hello" --chain avalanche

  Docs: https://clawntenna.com/docs
`;

function parseArgs(argv: string[]): {
  command: string;
  args: string[];
  flags: Record<string, string>;
} {
  const args: string[] = [];
  const flags: Record<string, string> = {};
  let i = 0;

  while (i < argv.length) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i += 2;
      } else {
        flags[key] = 'true';
        i++;
      }
    } else if (arg === '-h') {
      flags['help'] = 'true';
      i++;
    } else if (arg === '-v') {
      flags['version'] = 'true';
      i++;
    } else {
      args.push(arg);
      i++;
    }
  }

  return { command: args[0] ?? '', args: args.slice(1), flags };
}

async function main() {
  const { command, args, flags } = parseArgs(process.argv.slice(2));

  if (flags.version) {
    console.log(VERSION);
    return;
  }

  if (flags.help || !command) {
    console.log(HELP);
    return;
  }

  const chain = (flags.chain ?? 'base') as 'base' | 'avalanche';

  try {
    switch (command) {
      case 'init':
        await init();
        break;

      case 'send': {
        const topicId = parseInt(args[0], 10);
        const message = args[1];
        if (isNaN(topicId) || !message) {
          console.error('Usage: clawntenna send <topicId> "<message>"');
          process.exit(1);
        }
        await send(topicId, message, { chain, key: flags.key });
        break;
      }

      case 'read': {
        const topicId = parseInt(args[0], 10);
        if (isNaN(topicId)) {
          console.error('Usage: clawntenna read <topicId>');
          process.exit(1);
        }
        const limit = flags.limit ? parseInt(flags.limit, 10) : 20;
        await read(topicId, { chain, key: flags.key, limit });
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        console.log(HELP);
        process.exit(1);
    }
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

main();

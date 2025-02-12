import * as commander from 'commander';
import * as fs from 'fs-extra';

import { app } from 'electron';
import {
  ElectronReleaseChannel,
  OutputEntry,
  RunResult,
  SetupRequest,
} from '../interfaces';
import { IpcEvents } from '../ipc-events';
import { getGistId } from '../utils/gist';
import { ipcMainManager } from './ipc';

function getSetup(opts: commander.OptionValues): SetupRequest {
  const config: SetupRequest = {
    showChannels: [],
    hideChannels: [],
  };

  const { fiddle, version, betas, nightlies } = opts;

  if (fs.existsSync(fiddle)) {
    config.fiddle = { filePath: fiddle };
  } else {
    const gistId = getGistId(fiddle);
    if (gistId) {
      config.fiddle = { gistId };
    }
  }
  if (!config.fiddle) {
    throw `Unrecognized Fiddle "${fiddle}"`;
  }

  if (version) {
    config.version = version;
  }

  if (betas) {
    config.showChannels.push(ElectronReleaseChannel.beta);
  } else if (betas === false) {
    config.hideChannels.push(ElectronReleaseChannel.beta);
  }

  if (nightlies) {
    config.showChannels.push(ElectronReleaseChannel.nightly);
  } else if (nightlies === false) {
    config.hideChannels.push(ElectronReleaseChannel.nightly);
  }

  return config;
}

async function sendTask(type: IpcEvents, task: any) {
  const onOutputEntry = (_: any, msg: OutputEntry) => {
    console.log(
      `[${new Date(msg.timestamp).toLocaleTimeString()}] ${msg.text}`,
    );
  };
  const exitCodes = Object.freeze({
    [RunResult.SUCCESS]: 0,
    [RunResult.FAILURE]: 1,
    [RunResult.INVALID]: 2,
  });
  const onTaskDone = (_: any, r: RunResult) => app.exit(exitCodes[r]);
  ipcMainManager.on(IpcEvents.OUTPUT_ENTRY, onOutputEntry);
  ipcMainManager.once(IpcEvents.TASK_DONE, onTaskDone);
  ipcMainManager.send(type, [task]);
}

async function bisect(good: string, bad: string, opts: commander.OptionValues) {
  sendTask(IpcEvents.TASK_BISECT, {
    setup: getSetup(opts),
    goodVersion: good,
    badVersion: bad,
  });
}

async function test(opts: commander.OptionValues) {
  try {
    sendTask(IpcEvents.TASK_TEST, {
      setup: getSetup(opts),
    });
  } catch (err) {
    console.error(err);
  }
}

export async function processCommandLine(argv: string[]) {
  const program = new commander.Command();

  program
    .command('bisect <goodVersion> <badVersion>')
    .description('Find where regressions were introduced')
    .option('--fiddle <dir|gist>', 'Open a fiddle', process.cwd())
    .option('--nightlies', 'Include nightly releases')
    .option('--no-nightlies', 'Omit nightly releases')
    .option('--betas', 'Include beta releases')
    .option('--no-betas', 'Omit beta releases')
    .action(bisect);

  program
    .command('test')
    .description('Test a fiddle')
    .option('--version <version>', 'Use Electron version')
    .option('--fiddle <dir|gist>', 'Open a fiddle', process.cwd())
    .action(test);

  program.addHelpText(
    'after',
    `

Example calls:
  $ electron-fiddle bisect 10.0.0 11.2.0 --fiddle /path/to/fiddle
  $ electron-fiddle bisect 10.0.0 11.2.0 --fiddle /path/to/fiddle --betas --nightlies
  $ electron-fiddle test --version 11.2.0 --fiddle /path/to/fiddle
  $ electron-fiddle test --version 11.2.0 --fiddle 8c5fc0c6a5153d49b5a4a56d3ed9da8f
  $ electron-fiddle test --version 11.2.0 --fiddle https://gist.github.com/ckerr/8c5fc0c6a5153d49b5a4a56d3ed9da8f/
`,
  );

  // do nothing if argv holds no commands/options
  if (argv.length > (process.defaultApp ? 2 : 1)) {
    program.parse(argv, { from: 'electron' });
  }
}

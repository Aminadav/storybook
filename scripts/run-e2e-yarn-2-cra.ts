import path from 'path';
import { remove, ensureDir, pathExists } from 'fs-extra';
import shell from 'shelljs';
import { serve } from './utils/serve';
import { exec } from './utils/command';

const logger = console;
const defaultAngularCliVersion = 'latest';

const parameters: Options = {
  name: 'yarn-2-cra',
  version: 'latest',
  generator: `yarn dlx create-react-app@{{version}} . --quiet`,
  before: async (cwd: string) => {
    await exec(`yarn set version berry`, { cwd });
  },
};

interface Options {
  name: string;
  version: string;
  generator: string;
  cwd?: string;
  before?: (cwd: string) => Promise<void>;
}

const rootDir = path.join(__dirname, '..');

const prepareDirectory = async (options: Options): Promise<void> => {
  if (await pathExists(options.cwd)) {
    await cleanDirectory(options);
  }

  return ensureDir(options.cwd);
};

const cleanDirectory = async ({ cwd }: Options): Promise<void> => {
  // Remove Yarn 2 specific stuffs generated in Before Hook
  await shell.rm('-rf', [path.join(rootDir, '.yarn'), path.join(rootDir, '.yarnrc.yml')]);

  return remove(cwd);
};

const generate = async ({ cwd, name, version, generator }: Options) => {
  const command = generator.replace(/{{name}}/g, name).replace(/{{version}}/g, version);
  logger.info(`🏗 Bootstrapping ${name} project with "${command}"`);

  try {
    await exec(command, { cwd });
  } catch (e) {
    logger.error(`‼️ Error during ${name} bootstrapping`);
    throw e;
  }
};

const initStorybook = async ({ cwd }: Options) => {
  logger.info(`🎨 Initializing Storybook with @storybook/cli`);
  try {
    await exec(`yarn dlx --quiet -p @storybook/cli@next sb init`, { cwd });
  } catch (e) {
    logger.error(`‼️ Error during Storybook initialization`);
    throw e;
  }
};

const buildStorybook = async ({ cwd }: Options) => {
  logger.info(`👷 Building Storybook`);
  try {
    await exec(`yarn build-storybook`, { cwd });
  } catch (e) {
    logger.error(`‼️ Error during Storybook build`);
    throw e;
  }
};

const serveStorybook = async ({ cwd }: Options, port: string) => {
  logger.info(`🤖 Serving SB from ${cwd}`);

  return serve(`${cwd}/storybook-static`, port);
};

const runCypress = async (_: Options, location: string) => {
  logger.info(`🤖 Running Cypress tests`);
  try {
    await exec(`cypress run --env location="${location}"`, {
      cwd: path.join(__dirname, '..'),
    });
  } catch (e) {
    logger.error(`‼️ Error during cypress tests execution`);
    throw e;
  }
};

const runTests = async ({ name, version, ...rest }: Options) => {
  const options = {
    name,
    version,
    ...rest,
    cwd: path.join(__dirname, '..', 'e2e', name, version),
  };

  logger.info(`📡 Starting E2E for ${name} ${version}`);

  await prepareDirectory(options);

  if (rest.before) {
    logger.info(`⏹ Running Before hook for ${name} ${version}`);
    await rest.before(options.cwd);
  }

  await generate(options);

  await initStorybook(options);

  // There is no deps to add for these tests await addRequiredDeps(options);

  await buildStorybook(options);

  const server = await serveStorybook(options, '4000');
  try {
    await runCypress(options, 'http://localhost:4000');

    // TODO: Add a variable to skip this cleaning (based on  process.env.CI?), in order to simplify debugging for instance
    logger.info(`🗑 Cleaning test dir for ${name} ${version}`);
  } finally {
    server.close();
    await cleanDirectory(options);
  }

  logger.info(`🎉 Storybook is working great with ${name} ${version}!`);
};

let angularCliVersions = process.argv.slice(2);

if (!angularCliVersions || angularCliVersions.length === 0) {
  angularCliVersions = [defaultAngularCliVersion];
}

// Run tests!
runTests(parameters).catch((e) => {
  logger.error(`🚨 E2E tests fails\n${e}`);
  process.exit(1);
});

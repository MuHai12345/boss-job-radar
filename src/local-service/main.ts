import { homedir } from 'node:os';
import { createOpenAiStructuredLlmProvider } from '../domain/llm/openai-structured-llm-provider.js';
import { createLave8StructuredLlmProvider } from '../domain/llm/lave8-structured-llm-provider.js';
import {
  BOSS_JOB_RADAR_OPENAI_API_KEY_ENV,
  BOSS_JOB_RADAR_OPENAI_MODEL_ENV,
  BOSS_JOB_RADAR_LAVE8_API_KEY_ENV,
  BOSS_JOB_RADAR_LAVE8_MODEL_ENV,
  parseStructuredLlmRuntimeConfig,
} from './structured-llm-runtime-config.js';

import {
  LOCAL_SERVICE_PORT_ENV,
  parseProductionPort,
} from './config.js';
import {
  ensureProductionDataDirectory,
  resolveProductionDataPaths,
} from './production-data-path.js';
import { startLocalRuntime } from './runtime.js';
import { LOCAL_SERVICE_HOST } from './server.js';
import { formatStartupError } from './startup-error.js';

const homeDirectory = homedir();
const openAiApiKey = process.env[BOSS_JOB_RADAR_OPENAI_API_KEY_ENV];
const lave8ApiKey = process.env[BOSS_JOB_RADAR_LAVE8_API_KEY_ENV];
let sensitiveValues: readonly (string | undefined)[] = [
  openAiApiKey,
  lave8ApiKey,
  homeDirectory,
  process.env.LOCALAPPDATA,
  process.env.XDG_DATA_HOME,
];

try {
  const llmConfig = parseStructuredLlmRuntimeConfig(
    openAiApiKey,
    process.env[BOSS_JOB_RADAR_OPENAI_MODEL_ENV],
    lave8ApiKey,
    process.env[BOSS_JOB_RADAR_LAVE8_MODEL_ENV],
  );
  const structuredLlmProvider = llmConfig.enabled
    ? 'provider' in llmConfig && llmConfig.provider === 'lave8'
      ? createLave8StructuredLlmProvider(llmConfig)
      : createOpenAiStructuredLlmProvider(llmConfig)
    : undefined;
  const port = parseProductionPort(process.env[LOCAL_SERVICE_PORT_ENV]);
  const productionDataPaths = resolveProductionDataPaths({
    environment: process.env,
    homeDirectory,
    platform: process.platform,
  });
  sensitiveValues = [
    productionDataPaths.databasePath,
    productionDataPaths.dataDirectory,
    ...sensitiveValues,
  ];
  await ensureProductionDataDirectory({
    dataDirectory: productionDataPaths.dataDirectory,
    platform: process.platform,
  });
  const runtime = await startLocalRuntime({
    databasePath: productionDataPaths.databasePath,
    port,
    ...(structuredLlmProvider === undefined ? {} : { structuredLlmProvider }),
  });

  console.log(
    `Boss Job Radar local service listening on http://${LOCAL_SERVICE_HOST}:${runtime.address.port}`,
  );
  console.log('Local database ready');

  let shutdownPromise: Promise<void> | undefined;
  const shutdown = (): void => {
    shutdownPromise ??= runtime.close();
    void shutdownPromise.catch((error: unknown) => {
      const message = formatStartupError(error, sensitiveValues);
      console.error(`Failed to close local runtime: ${message}`);
      process.exitCode = 1;
    });
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
} catch (error) {
  const message = formatStartupError(error, sensitiveValues);
  console.error(`Failed to start local runtime: ${message}`);
  process.exitCode = 1;
}

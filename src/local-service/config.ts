export const DEFAULT_LOCAL_SERVICE_PORT = 32123;
export const LOCAL_SERVICE_PORT_ENV = 'BOSS_JOB_RADAR_LOCAL_PORT';

const MIN_PRODUCTION_PORT = 1;
const MAX_PRODUCTION_PORT = 65_535;
const DECIMAL_INTEGER_PATTERN = /^\d+$/;
const INVALID_PORT_MESSAGE =
  `${LOCAL_SERVICE_PORT_ENV} must be a decimal integer from ` +
  `${MIN_PRODUCTION_PORT} to ${MAX_PRODUCTION_PORT}`;

export function parseProductionPort(value: string | undefined): number {
  if (value === undefined) {
    return DEFAULT_LOCAL_SERVICE_PORT;
  }

  if (!DECIMAL_INTEGER_PATTERN.test(value)) {
    throw new Error(INVALID_PORT_MESSAGE);
  }

  const port = Number(value);
  if (port < MIN_PRODUCTION_PORT || port > MAX_PRODUCTION_PORT) {
    throw new Error(INVALID_PORT_MESSAGE);
  }

  return port;
}

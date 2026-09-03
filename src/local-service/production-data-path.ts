import { mkdir } from 'node:fs/promises';
import { posix, win32 } from 'node:path';

export const APP_DATA_DIRECTORY_NAME = 'boss-job-radar';
export const PRODUCTION_DATABASE_FILENAME = 'boss-job-radar.sqlite3';

export interface ProductionDataPaths {
  readonly dataDirectory: string;
  readonly databasePath: string;
}

export interface ProductionDataPathOptions {
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly homeDirectory: string;
  readonly platform: NodeJS.Platform;
}

function requireAbsoluteHomeDirectory(
  homeDirectory: string,
  isAbsolute: (path: string) => boolean,
): void {
  if (!isAbsolute(homeDirectory)) {
    throw new Error('Home directory must be an absolute path');
  }
}

export function resolveProductionDataPaths(
  options: ProductionDataPathOptions,
): ProductionDataPaths {
  let dataRoot: string;
  let joinPath: typeof posix.join | typeof win32.join;

  switch (options.platform) {
    case 'win32': {
      joinPath = win32.join;
      const localAppData = options.environment.LOCALAPPDATA;
      if (localAppData !== undefined) {
        if (!win32.isAbsolute(localAppData)) {
          throw new Error('LOCALAPPDATA must be an absolute path');
        }
        dataRoot = localAppData;
      } else {
        requireAbsoluteHomeDirectory(
          options.homeDirectory,
          win32.isAbsolute,
        );
        dataRoot = win32.join(options.homeDirectory, 'AppData', 'Local');
      }
      break;
    }

    case 'darwin':
      requireAbsoluteHomeDirectory(options.homeDirectory, posix.isAbsolute);
      joinPath = posix.join;
      dataRoot = posix.join(
        options.homeDirectory,
        'Library',
        'Application Support',
      );
      break;

    case 'linux': {
      joinPath = posix.join;
      const xdgDataHome = options.environment.XDG_DATA_HOME;
      if (xdgDataHome !== undefined) {
        if (!posix.isAbsolute(xdgDataHome)) {
          throw new Error('XDG_DATA_HOME must be an absolute path');
        }
        dataRoot = xdgDataHome;
      } else {
        requireAbsoluteHomeDirectory(
          options.homeDirectory,
          posix.isAbsolute,
        );
        dataRoot = posix.join(options.homeDirectory, '.local', 'share');
      }
      break;
    }

    default:
      throw new Error(`Unsupported production platform: ${options.platform}`);
  }

  const dataDirectory = joinPath(dataRoot, APP_DATA_DIRECTORY_NAME);
  return {
    dataDirectory,
    databasePath: joinPath(dataDirectory, PRODUCTION_DATABASE_FILENAME),
  };
}

export async function ensureProductionDataDirectory(
  dataDirectory: string,
): Promise<void> {
  await mkdir(dataDirectory, { recursive: true });
}

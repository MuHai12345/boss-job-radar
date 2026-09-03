import { chmod, mkdir } from 'node:fs/promises';
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

export interface EnsureProductionDataDirectoryOptions {
  readonly dataDirectory: string;
  readonly platform: NodeJS.Platform;
}

const WINDOWS_DRIVE_ABSOLUTE_PATH = /^[A-Za-z]:[\\/]/;
const WINDOWS_UNC_PATH =
  /^(?:\\\\|\/\/)[^\\/]+[\\/][^\\/]+(?:[\\/].*)?$/;
const WINDOWS_EXTENDED_DRIVE_PATH = /^\\\\\?\\[A-Za-z]:\\(?:.*)?$/;
const WINDOWS_EXTENDED_UNC_PATH =
  /^\\\\\?\\UNC\\[^\\/]+\\[^\\/]+(?:\\.*)?$/i;
const WINDOWS_NAMESPACE_PATH = /^[\\/]{2}[?.][\\/]/;

function isFullyQualifiedWindowsPath(path: string): boolean {
  if (!win32.isAbsolute(path)) {
    return false;
  }

  if (
    WINDOWS_EXTENDED_DRIVE_PATH.test(path) ||
    WINDOWS_EXTENDED_UNC_PATH.test(path)
  ) {
    return true;
  }

  if (WINDOWS_NAMESPACE_PATH.test(path)) {
    return false;
  }

  return (
    WINDOWS_DRIVE_ABSOLUTE_PATH.test(path) || WINDOWS_UNC_PATH.test(path)
  );
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
        if (!isFullyQualifiedWindowsPath(localAppData)) {
          throw new Error(
            'LOCALAPPDATA must be a fully-qualified Windows path',
          );
        }
        dataRoot = localAppData;
      } else {
        if (!isFullyQualifiedWindowsPath(options.homeDirectory)) {
          throw new Error(
            'Home directory must be a fully-qualified Windows path',
          );
        }
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
  options: EnsureProductionDataDirectoryOptions,
): Promise<void> {
  switch (options.platform) {
    case 'win32':
      await mkdir(options.dataDirectory, { recursive: true });
      return;

    case 'darwin':
    case 'linux':
      await mkdir(posix.dirname(options.dataDirectory), { recursive: true });
      await mkdir(options.dataDirectory, { mode: 0o700, recursive: true });
      await chmod(options.dataDirectory, 0o700);
      return;

    default:
      throw new Error(
        `Unsupported production platform: ${options.platform}`,
      );
  }
}

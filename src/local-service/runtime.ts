import {
  openLocalDatabase,
  type LocalDatabase,
} from './database/database.js';
import {
  startLocalService,
  type LocalService,
  type LocalServiceAddress,
} from './server.js';

export interface LocalRuntime {
  readonly address: LocalServiceAddress;
  readonly database: LocalDatabase;
  close(): Promise<void>;
}

export async function startLocalRuntime(options: {
  readonly databasePath: string;
  readonly port: number;
}): Promise<LocalRuntime> {
  const database = openLocalDatabase({ path: options.databasePath });

  let service: LocalService;
  try {
    service = await startLocalService({
      observations: database.observations,
      port: options.port,
    });
  } catch (error) {
    database.close();
    throw error;
  }

  let closePromise: Promise<void> | undefined;
  return {
    address: service.address,
    database,
    close(): Promise<void> {
      closePromise ??= (async () => {
        try {
          await service.close();
        } finally {
          database.close();
        }
      })();
      return closePromise;
    },
  };
}

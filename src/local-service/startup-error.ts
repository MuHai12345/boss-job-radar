export function formatStartupError(
  error: unknown,
  sensitiveValues: readonly (string | undefined)[],
): string {
  if (!(error instanceof Error)) {
    return 'unknown error';
  }

  return sensitiveValues
    .filter((value): value is string => value !== undefined && value !== '')
    .sort((left, right) => right.length - left.length)
    .reduce(
      (message, sensitiveValue) =>
        message.split(sensitiveValue).join('[private path]'),
      error.message,
    );
}

export class SchematicParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchematicParseError';
  }
}

export function corrupted(detail?: string): SchematicParseError {
  return new SchematicParseError(
    detail === undefined
      ? 'The file is corrupted or truncated and could not be read.'
      : `The file is corrupted: ${detail}.`,
  );
}

export class SchematicParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchematicParseError';
  }
}

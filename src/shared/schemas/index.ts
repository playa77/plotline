/**
 * Barrel file for shared schemas.
 *
 * Re-exports everything from each schema module so consumers can import from
 * a single path: `import { ProjectSchema, OutlineSchema } from '@shared/schemas'`.
 *
 * @module
 */

export * from './project';
export * from './outline';
export * from './variable';
export * from './meta';

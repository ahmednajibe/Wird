/**
 * The owner's catalog, shared with the engine for local previews (the
 * Settings baseline explanation runs the planner in the browser).
 */
import { buildCatalog } from '../../shared/catalog.js';
import { OWNER_CATALOG_DATA } from '../../server/seed/ownerCatalog.js';

export const CATALOG = buildCatalog(OWNER_CATALOG_DATA);

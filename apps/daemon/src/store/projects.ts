// Shared project store - extracted for cross-route access
import { Project } from '@agentx/api-types';

// In-memory store for Phase 0 (replace with SQLite in future)
export const projects: Map<string, Project> = new Map();

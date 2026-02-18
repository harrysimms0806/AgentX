// Shared project store - extracted for cross-route access
// Phase 2: Now backed by SQLite

import { Project } from '@agentx/api-types';
import { projectDb } from '../database';

// Database-backed store
export const projects = {
  get(id: string): Project | undefined {
    return projectDb.getById(id);
  },
  
  getAll(): Project[] {
    return projectDb.getAll();
  },
  
  set(id: string, project: Project): void {
    // Check if exists
    const existing = projectDb.getById(id);
    if (existing) {
      // Update last opened
      projectDb.updateLastOpened(id);
    } else {
      projectDb.create(project);
    }
  },
  
  has(id: string): boolean {
    return projectDb.getById(id) !== undefined;
  },
  
  delete(id: string): boolean {
    projectDb.delete(id);
    return true;
  },
  
  // Iterator support for compatibility
  *[Symbol.iterator](): Iterator<[string, Project]> {
    const all = projectDb.getAll();
    for (const project of all) {
      yield [project.id, project];
    }
  },
  
  // Map-like values() method
  values(): Project[] {
    return projectDb.getAll();
  },
  
  // Map-like keys() method
  *keys(): Iterator<string> {
    const all = projectDb.getAll();
    for (const project of all) {
      yield project.id;
    }
  },
};

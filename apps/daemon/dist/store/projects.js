"use strict";
// Shared project store - extracted for cross-route access
// Phase 2: Now backed by SQLite
Object.defineProperty(exports, "__esModule", { value: true });
exports.projects = void 0;
const database_1 = require("../database");
// Database-backed store
exports.projects = {
    get(id) {
        return database_1.projectDb.getById(id);
    },
    getAll() {
        return database_1.projectDb.getAll();
    },
    set(id, project) {
        // Check if exists
        const existing = database_1.projectDb.getById(id);
        if (existing) {
            // Update last opened
            database_1.projectDb.updateLastOpened(id);
        }
        else {
            database_1.projectDb.create(project);
        }
    },
    has(id) {
        return database_1.projectDb.getById(id) !== undefined;
    },
    delete(id) {
        database_1.projectDb.delete(id);
        return true;
    },
    // Iterator support for compatibility
    *[Symbol.iterator]() {
        const all = database_1.projectDb.getAll();
        for (const project of all) {
            yield [project.id, project];
        }
    },
    // Map-like values() method
    values() {
        return database_1.projectDb.getAll();
    },
    // Map-like keys() method
    *keys() {
        const all = database_1.projectDb.getAll();
        for (const project of all) {
            yield project.id;
        }
    },
};

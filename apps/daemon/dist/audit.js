"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.audit = void 0;
// Append-only audit logging
const fs_1 = __importDefault(require("fs"));
const crypto_1 = require("crypto");
const config_1 = require("./config");
class Audit {
    logPath;
    buffer = [];
    flushInterval = null;
    constructor() {
        this.logPath = config_1.config.auditLogPath;
    }
    async initialize() {
        // Ensure log file exists
        if (!fs_1.default.existsSync(this.logPath)) {
            fs_1.default.writeFileSync(this.logPath, '');
        }
        console.log(`📝 Audit log: ${this.logPath}`);
        // Start periodic flush
        this.flushInterval = setInterval(() => this.flush(), 5000);
    }
    /**
     * Append an audit event
     * This is the ONLY way to write to the audit log
     */
    log(projectId, actorType, actionType, payload, actorId) {
        const event = {
            id: (0, crypto_1.randomUUID)(),
            projectId,
            actorType,
            actorId,
            actionType,
            payload,
            createdAt: new Date().toISOString(),
        };
        // Add to buffer for batch writing
        this.buffer.push(JSON.stringify(event));
        // Immediate flush for critical actions
        if (['WRITE', 'DELETE', 'EXEC'].includes(actionType)) {
            this.flush();
        }
        return event;
    }
    /**
     * Read audit log (exportable but never editable)
     */
    read(projectId, limit = 100) {
        if (!fs_1.default.existsSync(this.logPath)) {
            return [];
        }
        const content = fs_1.default.readFileSync(this.logPath, 'utf8');
        const lines = content.split('\n').filter(Boolean);
        const events = [];
        for (const line of lines) {
            try {
                const event = JSON.parse(line);
                if (!projectId || event.projectId === projectId) {
                    events.push(event);
                }
            }
            catch {
                // Skip corrupted lines
            }
        }
        // Sort by date descending, take limit
        return events
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, limit);
    }
    /**
     * Export full audit log
     */
    export(projectId) {
        const events = this.read(projectId, Infinity);
        return JSON.stringify(events, null, 2);
    }
    flush() {
        if (this.buffer.length === 0)
            return;
        const lines = this.buffer.join('\n') + '\n';
        fs_1.default.appendFileSync(this.logPath, lines);
        this.buffer = [];
    }
    /**
     * Cleanup on shutdown
     */
    shutdown() {
        if (this.flushInterval) {
            clearInterval(this.flushInterval);
        }
        this.flush();
    }
}
exports.audit = new Audit();
// Ensure flush on exit
process.on('exit', () => exports.audit.shutdown());
process.on('SIGINT', () => {
    exports.audit.shutdown();
    process.exit(0);
});
process.on('SIGTERM', () => {
    exports.audit.shutdown();
    process.exit(0);
});

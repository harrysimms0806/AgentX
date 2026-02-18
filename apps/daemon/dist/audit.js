"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.audit = void 0;
// Append-only audit logging
const fs_1 = __importDefault(require("fs"));
const crypto_1 = require("crypto");
class Audit {
    logPath = '';
    buffer = [];
    flushInterval = null;
    // Sensitive keys that should be redacted from logs
    sensitiveKeys = [
        'token',
        'authorization',
        'password',
        'secret',
        'key',
        'apiKey',
        'api_key',
        'privateKey',
        'private_key',
        'accessToken',
        'access_token',
        'refreshToken',
        'refresh_token',
        'credential',
        'credentials',
    ];
    async initialize() {
        // Get config at initialization time (after port discovery)
        const { config } = await Promise.resolve().then(() => __importStar(require('./config')));
        this.logPath = config.auditLogPath;
        // Ensure log file exists
        if (!fs_1.default.existsSync(this.logPath)) {
            fs_1.default.writeFileSync(this.logPath, '');
        }
        console.log(`📝 Audit log: ${this.logPath}`);
        // Start periodic flush
        this.flushInterval = setInterval(() => this.flush(), 5000);
    }
    /**
     * Redact sensitive values from payload
     */
    redactPayload(payload) {
        const redacted = {};
        for (const [key, value] of Object.entries(payload)) {
            // Check if key matches any sensitive pattern (case-insensitive)
            const isSensitive = this.sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive.toLowerCase()));
            if (isSensitive) {
                redacted[key] = '[REDACTED]';
            }
            else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                // Recursively redact nested objects
                redacted[key] = this.redactPayload(value);
            }
            else {
                redacted[key] = value;
            }
        }
        return redacted;
    }
    /**
     * Append an audit event
     * This is the ONLY way to write to the audit log
     */
    log(projectId, actorType, actionType, payload, actorId) {
        // Redact sensitive fields from payload
        const safePayload = this.redactPayload(payload);
        const event = {
            id: (0, crypto_1.randomUUID)(),
            projectId,
            actorType,
            actorId,
            actionType,
            payload: safePayload,
            createdAt: new Date().toISOString(),
        };
        // Add to buffer for batch writing
        this.buffer.push(JSON.stringify(event));
        // Flush immediately for privileged actions to reduce loss window
        this.flush();
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

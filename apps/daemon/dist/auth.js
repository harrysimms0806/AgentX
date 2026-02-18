"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.auth = void 0;
// Authentication system
const crypto_1 = require("crypto");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const config_1 = require("./config");
class Auth {
    sessions = new Map();
    sessionsFile;
    enabled = true;
    constructor() {
        this.sessionsFile = path_1.default.join(config_1.config.runtimeDir, 'sessions.json');
    }
    async initialize() {
        // Load existing sessions
        if (fs_1.default.existsSync(this.sessionsFile)) {
            try {
                const data = JSON.parse(fs_1.default.readFileSync(this.sessionsFile, 'utf8'));
                for (const session of data.sessions || []) {
                    this.sessions.set(session.token, {
                        ...session,
                        createdAt: new Date(session.createdAt),
                        lastUsed: new Date(session.lastUsed),
                    });
                }
                console.log(`📋 Loaded ${this.sessions.size} session(s)`);
            }
            catch (err) {
                console.warn('Failed to load sessions:', err);
            }
        }
    }
    createSession(clientId) {
        const token = (0, crypto_1.randomBytes)(32).toString('hex');
        const session = {
            token,
            clientId,
            createdAt: new Date(),
            lastUsed: new Date(),
        };
        this.sessions.set(token, session);
        this.persistSessions();
        console.log(`🔑 Created session for ${clientId}`);
        return session;
    }
    validateToken(token) {
        const session = this.sessions.get(token);
        if (!session)
            return null;
        // Update last used
        session.lastUsed = new Date();
        this.persistSessions();
        return session;
    }
    revokeSession(token) {
        const result = this.sessions.delete(token);
        if (result) {
            this.persistSessions();
        }
        return result;
    }
    isEnabled() {
        return this.enabled;
    }
    persistSessions() {
        const data = {
            sessions: Array.from(this.sessions.values()),
        };
        fs_1.default.writeFileSync(this.sessionsFile, JSON.stringify(data, null, 2));
    }
}
exports.auth = new Auth();

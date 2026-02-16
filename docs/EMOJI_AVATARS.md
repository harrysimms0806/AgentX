# AgentX Emoji Avatar System

## Overview

Every agent in AgentX has an emoji avatar that displays in the dashboard. The system ensures:
- Every agent has an emoji (no blank avatars)
- Same agent always gets same emoji (deterministic)
- UI can find emojis via settings pointers (future-proof)

## How It Works

### 1. Emoji Resolution Priority

When the Config Bridge loads, it resolves emojis for each agent:

```
Priority 1: Overlay file (dashboard.overlay.json)
           ↓
Priority 2: OpenClaw config (agent.avatar.emoji)
           ↓
Priority 3: Deterministic fallback (hash-based)
```

### 2. Deterministic Fallback

If no emoji is specified, the system generates one based on the agent's ID:

```javascript
// Pseudo-code
hash = md5(agentId)                    // Hash the agent ID
index = hash[0:8] % fallbackSet.length // Use first 8 chars as number
emoji = fallbackSet[index]             // Pick emoji from set
```

**Example:**
- Agent ID: `main-brain`
- Hash: `a3f7b2...`
- Index: 7
- Emoji: `🔧` (7th in fallback set)

This means:
- ✅ Same agent always gets same emoji
- ✅ Survives restarts
- ✅ No randomness

### 3. Fallback Emoji Set

```javascript
[
  "🧠", "🤖", "🛠️", "🧑‍💻", "📡", "🧩", "🧭", "🔧",
  "🧪", "🛰️", "📦", "📋", "🗂️", "🧰", "🧯", "⚙️"
]
```

Curated for "digital workforce" vibe.

## Configuration

### OpenClaw Config (openclaw.config.json)

```json
{
  "agents": [
    {
      "id": "bud",
      "name": "Bud",
      "avatar": {
        "emoji": "🌱"
      }
    }
  ]
}
```

### Overlay File (dashboard.overlay.json) - RECOMMENDED

```json
{
  "agents": {
    "bud": {
      "emoji": "🌱",
      "displayName": "Bud (Coordinator)"
    }
  }
}
```

**Why overlay is better:**
- Keeps UI-only data separate from security config
- Easier to change without touching core config
- Can be edited without restarting OpenClaw

## Settings Pointers

The backend exposes "settings pointers" that tell the UI where to find settings:

```json
{
  "settingsPointers": {
    "agentAvatarModePath": "/ui/avatars/mode",
    "agentEmojiPath": "/agents/*/avatar/emoji",
    "fallbackEmojiPath": "/ui/avatars/fallbackSet",
    "agentDisplayNamePath": "/agents/*/displayName"
  }
}
```

### Why Pointers Matter

Instead of hardcoding paths like `agent.avatar.emoji`, the UI:

1. Reads pointer: `agentEmojiPath = "/agents/*/avatar/emoji"`
2. Follows path to get emoji
3. If schema changes later, only pointers update

This makes the frontend **future-proof**.

## API Endpoints

### Get Full Config

```bash
GET /api/config
```

Returns normalized config with all agents and their avatars.

### Get UI Settings Only

```bash
GET /api/config/ui-settings
```

Lightweight endpoint for initial dashboard load:

```json
{
  "ui": {
    "avatars": {
      "mode": "emoji",
      "fallbackSet": ["🧠", "🤖", ...]
    }
  },
  "settingsPointers": { ... },
  "agents": [
    { "id": "bud", "displayName": "Bud", "avatar": { "mode": "emoji", "emoji": "🌱" } }
  ]
}
```

### Get Settings Pointers

```bash
GET /api/config/settings-pointers
```

Returns just the pointer paths.

## Validation

The backend validates emojis:

| Check | Rule | On Failure |
|-------|------|------------|
| Non-empty | Must have content | Use fallback |
| Length | ≤ 8 characters | Use fallback |
| Unicode | Must be valid emoji | Use fallback |

Invalid emojis are logged as warnings but don't crash the system.

## Frontend Usage

### React Component

```tsx
// AgentCard.tsx
function getAvatarContent(agent: Agent): string {
  const { avatar } = agent;
  
  if (avatar.mode === 'emoji') {
    return avatar.emoji || '🤖';
  }
  
  if (avatar.mode === 'initials') {
    return avatar.initials || 'A';
  }
  
  return '🤖';
}

// In render
<div className="avatar">
  {getAvatarContent(agent)}
</div>
```

### Display Name

Always use `agent.displayName` (falls back to `agent.name`):

```tsx
<h3>{agent.displayName || agent.name}</h3>
```

## Adding New Agents

When you add a new agent:

1. **Option A** - Specify emoji in overlay:
   ```json
   "new-agent": { "emoji": "🚀" }
   ```

2. **Option B** - Let system pick:
   - No config needed
   - System generates emoji from hash
   - Consistent across restarts

## Future: Other Avatar Modes

The schema supports future expansion:

```typescript
interface AgentAvatar {
  mode: 'emoji' | 'image' | 'initials';
  emoji?: string;        // For emoji mode
  imageUrl?: string;     // For image mode  
  initials?: string;     // For initials mode
  backgroundColor?: string;
}
```

To add image avatars later:
1. Change `mode` to `'image'`
2. Provide `imageUrl`
3. Frontend already handles it

## Examples

### Example 1: Custom Emoji

```json
// dashboard.overlay.json
{
  "agents": {
    "my-agent": {
      "emoji": "🚀",
      "displayName": "Rocket Agent"
    }
  }
}
```

Result: Agent shows 🚀 rocket emoji.

### Example 2: Deterministic Fallback

No emoji specified for agent `data-processor`.

```
Agent ID: data-processor
Hash: 8f3a...
Index: 12
Emoji: 🗂️ (12th in fallback set)
```

Result: Always shows 🗂️ until explicitly overridden.

### Example 3: Validation Failure

```json
// Invalid emoji (too long)
"emoji": "🚀🚀🚀🚀🚀🚀🚀🚀🚀"
```

Result:
- Logged: `⚠️ Invalid emoji for agent X, using fallback`
- Displayed: Fallback emoji from hash

---

## Summary

| Feature | How It Works |
|---------|--------------|
| **Every agent has emoji** | Overlay → Config → Deterministic fallback |
| **Consistent across restarts** | Hash-based selection, not random |
| **Future-proof** | Settings pointers guide UI |
| **Validates input** | Invalid emojis fall back gracefully |
| **Extensible** | Schema supports images/initials later |

---

Built by Bud 🌱 for Harry's AI workforce.

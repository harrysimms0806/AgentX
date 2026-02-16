#!/usr/bin/env node

/**
 * CLI for running agents directly
 * Usage: node cli.js --agent codex --task "Fix the sidebar"
 */

import { createAgent } from './CodexAgent.js';
import db from '../../backend/models/database.js';
import { v4 as uuidv4 } from 'uuid';

async function main() {
  const args = process.argv.slice(2);
  
  // Parse arguments
  const agentId = getArg(args, '--agent') || 'codex';
  const taskTitle = getArg(args, '--task') || 'Unnamed task';
  const projectPath = getArg(args, '--project') || process.cwd();
  const prompt = getArg(args, '--prompt') || taskTitle;

  console.log(`🤖 AgentX CLI - Running ${agentId}`);
  console.log(`📁 Project: ${projectPath}`);
  console.log(`📝 Task: ${taskTitle}`);
  console.log('');

  // Create task record
  const taskId = uuidv4();
  const projectId = 'cli-project'; // Could lookup actual project

  db.prepare(`
    INSERT INTO tasks (id, title, workspace_path, git_root, project_id, agent_id, context)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    taskId,
    taskTitle,
    projectPath,
    projectPath,
    projectId,
    agentId,
    JSON.stringify({ prompt })
  );

  const task = {
    id: taskId,
    title: taskTitle,
    workspacePath: projectPath,
    gitRoot: projectPath,
    projectId,
    context: { prompt },
  };

  // Create and run agent
  const agent = createAgent(agentId);

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n⛔ Stopping agent...');
    agent.kill();
    process.exit(0);
  });

  try {
    const result = await agent.execute(task);
    console.log('\n✅ Task completed!');
    console.log(`💰 Cost: $${result.result.cost || 0}`);
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Task failed:', error.message);
    console.error('Recoverable:', error.recoverable ? 'Yes' : 'No');
    process.exit(1);
  }
}

function getArg(args, flag) {
  const index = args.indexOf(flag);
  return index !== -1 && index + 1 < args.length ? args[index + 1] : null;
}

main();

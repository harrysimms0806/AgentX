import vm from 'vm';

type PluginInvokeMessage = {
  type: 'invoke';
  requestId: string;
  sourceCode: string;
  args: Record<string, unknown>;
};

function isInvokeMessage(value: unknown): value is PluginInvokeMessage {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return v.type === 'invoke' && typeof v.requestId === 'string' && typeof v.sourceCode === 'string' && typeof v.args === 'object';
}

process.on('message', async (message: unknown) => {
  if (!isInvokeMessage(message)) {
    process.send?.({ type: 'error', requestId: 'unknown', error: 'invalid_message' });
    return;
  }

  const { requestId, sourceCode, args } = message;

  try {
    const sandbox: Record<string, unknown> = {
      module: { exports: {} },
      exports: {},
    };
    const context = vm.createContext(sandbox);
    const script = new vm.Script(sourceCode);
    script.runInContext(context, { timeout: 1500 });

    const moduleExports = sandbox.module as { exports: unknown };
    const handler = (moduleExports.exports as any)?.run;

    if (typeof handler !== 'function') {
      process.send?.({ type: 'error', requestId, error: 'plugin_missing_run_handler' });
      return;
    }

    const result = await Promise.resolve(handler(args));
    process.send?.({ type: 'result', requestId, result });
  } catch (error: any) {
    process.send?.({
      type: 'error',
      requestId,
      error: typeof error?.message === 'string' ? error.message : 'plugin_execution_failed',
    });
  }
});

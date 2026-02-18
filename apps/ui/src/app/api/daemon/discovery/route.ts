import { NextResponse } from 'next/server';
import { readRuntimeConfig, RuntimeError } from '@/lib/daemon/runtime';

export async function GET() {
  try {
    const runtime = await readRuntimeConfig();

    return NextResponse.json({
      ok: true,
      schemaVersion: runtime.schemaVersion,
      daemonUrl: runtime.daemonUrl,
      daemonPort: runtime.daemonPort,
      uiPort: runtime.uiPort,
      startedAt: runtime.startedAt,
      source: runtime.source,
    });
  } catch (error) {
    if (error instanceof RuntimeError) {
      const status = error.code === 'RUNTIME_MISSING' ? 404 : 500;
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
        },
        { status }
      );
    }

    return NextResponse.json(
      {
        error: 'Unexpected discovery failure',
        code: 'DISCOVERY_FAILED',
      },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { readRuntimeConfig, RuntimeError } from '@/lib/daemon/runtime';

async function proxyToDaemon(req: NextRequest, pathParts: string[]) {
  const path = `/${pathParts.join('/')}`;

  try {
    const runtime = await readRuntimeConfig();
    const targetUrl = `${runtime.daemonUrl}${path}${req.nextUrl.search}`;

    const headers = new Headers(req.headers);
    headers.delete('host');

    const method = req.method.toUpperCase();
    const hasBody = !['GET', 'HEAD'].includes(method);

    const body = hasBody ? Buffer.from(await req.arrayBuffer()) : undefined;

    const upstream = await fetch(targetUrl, {
      method,
      headers,
      body,
      cache: 'no-store',
    });

    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.delete('content-encoding');

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error) {
    if (error instanceof RuntimeError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
        },
        { status: error.code === 'RUNTIME_MISSING' ? 404 : 500 }
      );
    }

    return NextResponse.json(
      {
        error: 'Unable to reach daemon',
        code: 'DAEMON_UNREACHABLE',
      },
      { status: 503 }
    );
  }
}

export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxyToDaemon(req, params.path);
}

export async function POST(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxyToDaemon(req, params.path);
}

export async function PUT(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxyToDaemon(req, params.path);
}

export async function PATCH(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxyToDaemon(req, params.path);
}

export async function DELETE(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxyToDaemon(req, params.path);
}

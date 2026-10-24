import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function isAllowedOrigin(originHeader: string, hostHeader: string): boolean {
	try {
		const originUrl = new URL(originHeader);
		return originUrl.host.toLowerCase() === hostHeader.toLowerCase();
	} catch {
		return false;
	}
}

export function proxy(request: NextRequest) {
	const pathname = request.nextUrl.pathname;
	// A path ending with a file name (".../edit/src%252Fcontent%252Fx.md") is a
	// route, not a static asset: it carries a double-encoded slash.
	const isStaticAsset =
		pathname.startsWith("/_next/") ||
		pathname === "/favicon.ico" ||
		(/\.[^/]+$/.test(pathname) && !/%252F/i.test(pathname));

	if (isStaticAsset) {
		return NextResponse.next();
	}

	if (pathname.startsWith("/api/") && pathname !== "/api/webhook/github" && request.method !== "GET") {
		const originHeader = request.headers.get("Origin");
		const hostHeader = request.headers.get("Host");
		if (!originHeader || !hostHeader || !isAllowedOrigin(originHeader, hostHeader)) {
			return new NextResponse(null, {
				status: 403
			});
		}
	}

	const requestHeaders = new Headers(request.headers);
	const returnTo = `${request.nextUrl.pathname}${request.nextUrl.search}`;
	requestHeaders.set("x-return-to", returnTo);

	// A branch name with a slash arrives double-encoded (%252F, see
	// lib/utils/branch.ts): restore the single encoding the routes expect.
	const routedPathname = pathname.replace(/%252F/gi, "%2F");
	if (routedPathname !== pathname) {
		const url = request.nextUrl.clone();
		url.pathname = routedPathname;
		return NextResponse.rewrite(url, {
			request: {
				headers: requestHeaders,
			},
		});
	}

	return NextResponse.next({
		request: {
			headers: requestHeaders,
		},
	});
}

export const config = {
	matcher: "/:path*"
}

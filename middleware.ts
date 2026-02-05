import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
    let supabaseResponse = NextResponse.next({
        request,
    });

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
                    supabaseResponse = NextResponse.next({
                        request,
                    });
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    );
                },
            },
        }
    );

    // Refresh session if expired - required for Server Components
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (user) {
        const { data: profile } = await supabase
            .from("profiles")
            .select("is_blocked")
            .eq("id", user.id)
            .single();

        if (profile?.is_blocked) {
            const url = request.nextUrl.clone();
            url.pathname = "/login";
            url.searchParams.set("error", "blocked");
            const newResponse = NextResponse.redirect(url);
            request.cookies.getAll().forEach((c) => {
                if (c.name.startsWith("sb-")) newResponse.cookies.delete(c.name);
            });
            return newResponse;
        }
    }

    const path = request.nextUrl.pathname;

    // Define public paths that don't require authentication
    const publicPaths = [
        "/",
        "/login",
        "/forgot-password",
        "/reset-password"
    ];

    // Specific API routes that should be public
    const publicApiPaths = [
        "/api/check-email",
        "/api/auth",
        "/api/public"
    ];

    // Check if current path is public
    const isPublicPath =
        publicPaths.some((p) => path === p || path.startsWith(p + "/")) ||
        publicApiPaths.some((p) => path.startsWith(p));

    // If user is NOT logged in and tries to access a protected route
    if (!user && !isPublicPath) {
        // If it's an API route, return 401 instead of redirecting
        if (path.startsWith("/api/")) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        // Otherwise redirect to login
        const url = request.nextUrl.clone();
        url.pathname = "/login";
        return NextResponse.redirect(url);
    }

    // If user IS logged in and tries to access public auth pages (like login), 
    // redirect them to dashboard
    if (user && (path === "/" || path === "/login" || path === "/forgot-password")) {
        const url = request.nextUrl.clone();
        url.pathname = "/dashboard";
        return NextResponse.redirect(url);
    }

    return supabaseResponse;
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - public folder files (images etc)
         */
        "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    ],
};

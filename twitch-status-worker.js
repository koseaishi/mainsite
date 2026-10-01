let cachedToken;
let tokenExpiresAt = 0;

const allowedOrigins = new Set([
    "https://saberkratia.com",
    "https://www.saberkratia.com",
]);

function corsHeaders(origin) {
    return {
        "Access-Control-Allow-Origin": allowedOrigins.has(origin)
            ? origin
            : "https://saberkratia.com",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Cache-Control": "no-store",
        "Vary": "Origin",
    };
}

function jsonResponse(body, status, origin) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            ...corsHeaders(origin),
            "Content-Type": "application/json",
        },
    });
}

async function getAppToken(env) {
    if (cachedToken && Date.now() < tokenExpiresAt) {
        return cachedToken;
    }

    const tokenResponse = await fetch(
        "https://id.twitch.tv/oauth2/token",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
                client_id: env.TWITCH_CLIENT_ID,
                client_secret: env.TWITCH_CLIENT_SECRET,
                grant_type: "client_credentials",
            }),
        }
    );

    if (!tokenResponse.ok) {
        throw new Error("Twitch token request failed");
    }

    const tokenData = await tokenResponse.json();

    cachedToken = tokenData.access_token;
    tokenExpiresAt =
        Date.now() + Math.max(0, tokenData.expires_in - 60) * 1000;

    return cachedToken;
}

async function sendDiscordNotification(env) {
    if (!env.DISCORD_WEBHOOK_URL) {
        throw new Error("Discord webhook is not configured");
    }

    const response = await fetch(env.DISCORD_WEBHOOK_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            content:
                "<@&1555300903806959666> [twitch.tv/saberkratia](https://www.twitch.tv/saberkratia)",
        }),
    });

    if (!response.ok) {
        throw new Error("Discord webhook request failed");
    }
}

export default {
    async fetch(request, env) {
        const origin = request.headers.get("Origin") || "";

        if (request.method === "OPTIONS") {
            return new Response(null, {
                headers: corsHeaders(origin),
            });
        }

        if (request.method !== "GET") {
            return jsonResponse(
                { error: "Method not allowed" },
                405,
                origin
            );
        }

        if (
            !env.TWITCH_CLIENT_ID ||
            !env.TWITCH_CLIENT_SECRET
        ) {
            return jsonResponse(
                { error: "Twitch credentials are not configured" },
                500,
                origin
            );
        }

        try {
            const accessToken = await getAppToken(env);

            const streamsUrl = new URL(
                "https://api.twitch.tv/helix/streams"
            );

            streamsUrl.searchParams.set(
                "user_login",
                env.TWITCH_CHANNEL_LOGIN || "saberkratia"
            );

            const streamResponse = await fetch(streamsUrl, {
                headers: {
                    "Client-Id": env.TWITCH_CLIENT_ID,
                    Authorization: `Bearer ${accessToken}`,
                },
            });

            if (!streamResponse.ok) {
                return jsonResponse(
                    { error: "Twitch status request failed" },
                    502,
                    origin
                );
            }

            const streamData = await streamResponse.json();
            const isLive = streamData.data.length > 0;

            // Get previous state from KV.
            const previousState =
                await env.STREAM_STATE.get("isLive");

            const wasLive = previousState === "true";

            // Send Discord notification only on OFFLINE -> LIVE.
            if (isLive && !wasLive) {
                await sendDiscordNotification(env);
            }

            // Save current state.
            await env.STREAM_STATE.put(
                "isLive",
                String(isLive)
            );

            return jsonResponse(
                { isLive },
                200,
                origin
            );
        } catch (error) {
            console.error(error);

            return jsonResponse(
                { error: "Unable to check Twitch status" },
                502,
                origin
            );
        }
    },
};
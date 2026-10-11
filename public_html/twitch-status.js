const TWITCH_STATUS_ENDPOINT = "https://twitch-worker.witauts9.workers.dev";
const twitchLink = document.querySelector(".twitch-link");

async function updateTwitchStatus() {
    if (!twitchLink || TWITCH_STATUS_ENDPOINT.includes("YOUR_SUBDOMAIN")) {
        return;
    }

    try {
        const response = await fetch(TWITCH_STATUS_ENDPOINT, { cache: "no-store" });
        if (!response.ok) {
            return;
        }

        const { isLive } = await response.json();
        twitchLink.classList.toggle("is-live", isLive === true);
        twitchLink.setAttribute("aria-label", isLive ? "Twitch, live now" : "Twitch");
    } catch {
        // Keep the normal Twitch link if the status service is temporarily unavailable.
    }
}

updateTwitchStatus();
window.setInterval(updateTwitchStatus, 60_000);
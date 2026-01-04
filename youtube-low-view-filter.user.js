// ==UserScript==
// @name         YouTube Crappy Videos Remover from Recommendations
// @namespace    http://tampermonkey.net/
// @version      3.9
// @description  Removes YouTube videos with fewer than 999 views from recommendations.
// @author       Gaurav Gupta
// @match        *://*.youtube.com/*
// @exclude      *://*.youtube.com/feed
// @exclude      *://*.youtube.com/feed/
// @exclude      *://*.youtube.com/feed/*
// @exclude      *://*.youtube.com/feed?*
// @exclude      *://*.youtube.com/feed/playlists
// @exclude      *://*.youtube.com/feed/playlists/*
// @exclude      *://*.youtube.com/channel/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @homepage     https://github.com/GauravScripts/youtube-low-view-filter
// @downloadURL  https://raw.githubusercontent.com/GauravScripts/youtube-low-view-filter/master/youtube-low-view-filter.user.js
// @updateURL    https://raw.githubusercontent.com/GauravScripts/youtube-low-view-filter/master/youtube-low-view-filter.user.js
// @grant        none
// ==/UserScript==

// ---------------------------------------------------------------------------
let g_VideosFiltering = true;
let g_ShortsFiltering = true;

// How many views a video must have to be kept (>= threshold)
const MIN_VIEWS_TO_KEEP = 1000;

function IsSubscriptions() {
    return location.pathname.startsWith("/feed/subscriptions");
}

function IsChannel() {
    return location.pathname.startsWith("/@");
}

function IsShorts() {
    return location.pathname.startsWith("/shorts");
}

function IsWatch() {
    return location.pathname.startsWith("/watch");
}

function ParseViewCount(text) {
    if (!text || text.length === 0) {
        return -1;
    }

    // Normalize non-breaking space and lower-case
    text = text.replace(/\u00a0/g, ' ');
    text = text.toLowerCase().trim();

    // Some labels are non-numeric (“scheduled”, “premieres”, “live”, etc.)
    // Treat those as unknown so we don't remove everything by mistake.
    if (!/[0-9]/.test(text)) {
        // Special-case “no views” => 0
        if (text.includes('no views') || text === 'no') {
            return 0;
        }
        return -1;
    }

    // Remove "views" or "view" text and extra spaces
    text = text.replace(/views?/gi, '').trim();

    if (text.length === 0) {
        return -1;
    }

    // Handle Indian number system
    if (text.includes('lakh')) {
        let num = parseFloat(text.replace(/[^0-9.]/g, ''));
        return isNaN(num) ? -1 : num * 100000; // 1 lakh = 100,000
    }
    if (text.includes('crore')) {
        let num = parseFloat(text.replace(/[^0-9.]/g, ''));
        return isNaN(num) ? -1 : num * 10000000; // 1 crore = 10,000,000
    }

    // Handle K, M, B suffixes
    if (text.includes('k')) {
        let num = parseFloat(text.replace(/[^0-9.]/g, ''));
        return isNaN(num) ? -1 : num * 1000;
    }
    if (text.includes('m') || text.includes('million')) {
        let num = parseFloat(text.replace(/[^0-9.]/g, ''));
        return isNaN(num) ? -1 : num * 1000000;
    }
    if (text.includes('b') || text.includes('billion')) {
        let num = parseFloat(text.replace(/[^0-9.]/g, ''));
        return isNaN(num) ? -1 : num * 1000000000;
    }

    // Handle plain numbers with separators (commas, periods, spaces)
    let cleanedText = text.replace(/[,\.\s]/g, '');
    let num = parseInt(cleanedText);

    if (!isNaN(num)) {
        return num;
    }

    return -1;
}

function IsBadVideo(videoViews) {
    // IMPORTANT: Missing/empty views is common on new YouTube layouts (async render).
    // Missing views must NOT be treated as bad, otherwise everything gets removed.
    if (!videoViews) {
        return false;
    }

    let text = videoViews.innerText || videoViews.textContent;
    if (!text || text.length === 0) {
        return false;
    }

    let viewCount = ParseViewCount(text);

    // If we couldn't parse any number, assume it's NOT bad (safe default)
    if (viewCount === -1) {
        return false;
    }

    return viewCount < MIN_VIEWS_TO_KEEP;
}

function FindViewElementInCard(cardEl) {
    if (!cardEl) {
        return null;
    }

    // 1) Old layouts (home/search/watch sidebar)
    let el = cardEl.querySelector('.inline-metadata-item.style-scope.ytd-video-meta-block');
    if (el && /views?/i.test(el.textContent || '')) {
        return el;
    }

    // 2) New metadata model (your HTML snippet shows these)
    let metaTexts = cardEl.querySelectorAll('.yt-content-metadata-view-model__metadata-text, span[role="text"], span.yt-core-attributed-string');
    for (let i = 0; i < metaTexts.length; i++) {
        const t = (metaTexts[i].textContent || metaTexts[i].innerText || '').trim();
        if (t && /\bviews?\b/i.test(t) && /\d/.test(t)) {
            return metaTexts[i];
        }
    }

    // 3) Fallback: parse from aria-label on the title link (often includes “X views”)
    const a = cardEl.querySelector('a[aria-label][href^="/watch"], a#video-title[aria-label]');
    if (a) {
        const aria = a.getAttribute('aria-label') || '';
        if (/\bviews?\b/i.test(aria) && /\d/.test(aria)) {
            return a;
        }
    }

    return null;
}

function RemoveVideoCard(cardEl, reason) {
    if (!cardEl) {
        return;
    }

    // Remove the right container for each layout.
    const toRemove =
        cardEl.closest('ytd-rich-item-renderer') ||
        cardEl.closest('ytd-rich-grid-media') ||
        cardEl.closest('ytd-compact-video-renderer') ||
        cardEl;

    try {
        toRemove.remove();
        if (reason) {
            console.log('Removed video:', reason);
        }
    } catch (e) {
        // ignore
    }
}

// ---------------------------------------------------------------------------
function UpdateVideoFiltering() {
    let videosList;

    if (IsChannel() || IsSubscriptions()) {
        return;
    }

    if (IsShorts()) {
        if (g_ShortsFiltering) {
            videosList = document.getElementsByClassName("reel-video-in-sequence style-scope ytd-shorts");
            for (let i = 0; i < videosList.length; i++) {
                if (!videosList[i].isActive) {
                    continue;
                }

                let videoViews = videosList[i].getElementsByClassName("yt-spec-button-shape-with-label__label")[0];

                if (IsBadShortVideo(videoViews)) {
                    document.getElementsByClassName("navigation-button style-scope ytd-shorts")[1].getElementsByClassName("yt-spec-touch-feedback-shape__fill")[0].click();
                }
            }
        }
    } else {
        if (g_VideosFiltering) {
            // NEW YOUTUBE LAYOUT - yt-lockup-view-model structure
            // Also covers many new watch/sidebar layouts.
            let lockupVideos = document.querySelectorAll('yt-lockup-view-model');
            lockupVideos.forEach(video => {
                if (video.getAttribute('data-lowview-checked') === '1') {
                    return;
                }

                const viewsElement = FindViewElementInCard(video);
                const viewText = viewsElement ? (viewsElement.innerText || viewsElement.textContent || '') : '';
                const count = ParseViewCount(viewText);

                if (count !== -1) {
                    video.setAttribute('data-lowview-checked', '1');
                }

                if (count !== -1 && count < MIN_VIEWS_TO_KEEP) {
                    RemoveVideoCard(video, `new-layout: ${viewText}`);
                }
            });

            // WATCH SIDEBAR (tight selector)
            document.querySelectorAll('ytd-compact-video-renderer').forEach(video => {
                if (video.getAttribute('data-lowview-checked') === '1') {
                    return;
                }

                const viewsElement = FindViewElementInCard(video);
                const viewText = viewsElement ? (viewsElement.innerText || viewsElement.textContent || '') : '';
                const count = ParseViewCount(viewText);

                if (count !== -1) {
                    video.setAttribute('data-lowview-checked', '1');
                }

                if ((count !== -1 && count < MIN_VIEWS_TO_KEEP) || IsMembersOnly(video)) {
                    RemoveVideoCard(video, `sidebar: ${viewText}`);
                }
            });

            // HOME GRID (tight selector)
            document.querySelectorAll('ytd-rich-grid-media').forEach(video => {
                if (video.getAttribute('data-lowview-checked') === '1') {
                    return;
                }

                const viewsElement = FindViewElementInCard(video);
                const viewText = viewsElement ? (viewsElement.innerText || viewsElement.textContent || '') : '';
                const count = ParseViewCount(viewText);

                if (count !== -1) {
                    video.setAttribute('data-lowview-checked', '1');
                }

                if ((count !== -1 && count < MIN_VIEWS_TO_KEEP) || IsMembersOnly(video)) {
                    RemoveVideoCard(video, `home-grid: ${viewText}`);
                }
            });

            // Legacy rich item renderer (some pages still use it)
            document.querySelectorAll('ytd-rich-item-renderer').forEach(video => {
                // Only handle actual video items (avoid shelves/ads/etc.)
                const hasVideo = video.querySelector('a[href^="/watch"], ytd-thumbnail');
                if (!hasVideo) {
                    return;
                }

                if (video.getAttribute('data-lowview-checked') === '1') {
                    return;
                }

                const viewsElement = FindViewElementInCard(video);
                const viewText = viewsElement ? (viewsElement.innerText || viewsElement.textContent || '') : '';
                const count = ParseViewCount(viewText);

                if (count !== -1) {
                    video.setAttribute('data-lowview-checked', '1');
                }

                if ((count !== -1 && count < MIN_VIEWS_TO_KEEP) || IsMembersOnly(video)) {
                    RemoveVideoCard(video, `rich-item: ${viewText}`);
                }
            });

            // NOTE: removed old broad getElementsByClassName("style-scope ...") loops.
            // Those tended to match too much and cause everything to disappear when views weren't found.
        }
    }
}

// ---------------------------------------------------------------------------
document.addEventListener("yt-navigate-finish", () => {
    setTimeout(UpdateVideoFiltering, 350);
});

window.addEventListener("message", () => {
    if (!IsShorts()) {
        setTimeout(UpdateVideoFiltering, 200);
    }
});

window.addEventListener("load", () => {
    if (!IsShorts()) {
        setTimeout(UpdateVideoFiltering, 200);
    }
});

window.addEventListener("scrollend", () => {
    if (!IsShorts()) {
        setTimeout(UpdateVideoFiltering, 0);
    }
});

window.addEventListener("click", () => {
    if (!IsShorts()) {
        setTimeout(UpdateVideoFiltering, 200);
    }
});

let lastUrl = location.href;
new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
        lastUrl = url;
        if (IsWatch()) {
            setTimeout(UpdateVideoFiltering, 500);
        }
    }
}).observe(document, { subtree: true, childList: true });

if (typeof window.ytInitialData !== 'undefined') {
    const observer = new MutationObserver((mutations) => {
        if (IsWatch()) {
            let shouldFilter = false;
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    shouldFilter = true;
                }
            });
            if (shouldFilter) {
                setTimeout(UpdateVideoFiltering, 100);
            }
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}
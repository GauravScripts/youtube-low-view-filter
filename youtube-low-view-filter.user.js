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
        return 0;
    }

    // Remove "views" or "view" text and extra spaces
    text = text.toLowerCase().replace(/views?/gi, '').trim();

    // Handle Indian number system
    if (text.includes('lakh')) {
        let num = parseFloat(text.replace(/[^0-9.]/g, ''));
        return num * 100000; // 1 lakh = 100,000
    }
    if (text.includes('crore')) {
        let num = parseFloat(text.replace(/[^0-9.]/g, ''));
        return num * 10000000; // 1 crore = 10,000,000
    }

    // Handle K, M, B suffixes
    if (text.includes('k')) {
        let num = parseFloat(text.replace(/[^0-9.]/g, ''));
        return num * 1000;
    }
    if (text.includes('m') || text.includes('million')) {
        let num = parseFloat(text.replace(/[^0-9.]/g, ''));
        return num * 1000000;
    }
    if (text.includes('b') || text.includes('billion')) {
        let num = parseFloat(text.replace(/[^0-9.]/g, ''));
        return num * 1000000000;
    }

    // Handle plain numbers with separators (commas, periods, spaces)
    let cleanedText = text.replace(/[,.\s]/g, '');
    let num = parseInt(cleanedText);

    if (!isNaN(num)) {
        return num;
    }

    return 0;
}

function IsBadVideo(videoViews) {
    if (!videoViews) {
        console.log("~BadVideo: No view element found");
        return true;
    }

    let text = videoViews.innerText || videoViews.textContent;
    if (!text || text.length === 0) {
        console.log("~BadVideo: Empty text");
        return true;
    }

    let viewCount = ParseViewCount(text);

    // If we couldn't parse any number, consider it bad
    if (viewCount === 0) {
        console.log("~BadVideo: Could not parse view count from '" + text + "'");
        return true;
    }

    let isBad = viewCount < 1000;
    if (isBad) {
        console.log("~BadVideo: '" + text + "' = " + viewCount + " views (< 1000)");
    }

    return isBad;
}

function IsMembersOnly(videoElement) {
    if (!videoElement) {
        return false;
    }

    let membersOnlyElements = videoElement.querySelectorAll('.badge-style-type-members-only');
    if (membersOnlyElements.length > 0) {
        return true;
    }

    let textElements = videoElement.querySelectorAll('*');
    for (let element of textElements) {
        if (element.innerText && element.innerText.includes('Members only')) {
            return true;
        }
    }

    return false;
}

function IsBadShortVideo(videoViews) {
    if (!videoViews) {
        return false;
    }

    let text = videoViews.innerText;
    if (text.length === 0) {
        return false;
    }

    for (let i = 0; i < text.length; i++) {
        if (text[i] === '\xa0') {
            return false;
        }
    }

    console.log("~BadShortVideo: '" + text + "'");
    return true;
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
            // Handle NEW YOUTUBE LAYOUT FIRST - yt-lockup-view-model structure
            let lockupVideos = document.querySelectorAll('yt-lockup-view-model');
            lockupVideos.forEach(video => {
                let viewsElement = null;

                // Find the metadata container
                const metadataContainer = video.querySelector('yt-content-metadata-view-model');
                if (metadataContainer) {
                    // Look through all metadata rows
                    const metadataRows = metadataContainer.querySelectorAll('.yt-content-metadata-view-model__metadata-row');

                    for (let row of metadataRows) {
                        const spans = row.querySelectorAll('span[role="text"], span.yt-core-attributed-string');
                        for (let span of spans) {
                            let text = span.textContent || span.innerText;
                            // Match patterns like "434 views", "1.2K views", etc.
                            if (text && /\d+.*views?/i.test(text)) {
                                viewsElement = span;
                                break;
                            }
                        }
                        if (viewsElement) break;
                    }
                }

                // If views element found, check if it's a bad video
                if (viewsElement && IsBadVideo(viewsElement)) {
                    // Find the parent rich item renderer to remove
                    const parentRenderer = video.closest('ytd-rich-item-renderer');
                    if (parentRenderer) {
                        parentRenderer.remove();
                        console.log("Removed video (New Layout): " + viewsElement.innerText);
                    }
                }
            });

            // Handle OLD LAYOUTS as fallback
            // Compact renderer (watch page sidebar)
            videosList = document.getElementsByClassName("style-scope ytd-compact-video-renderer");
            for (let i = 0; i < videosList.length; i++) {
                let videoViews = videosList[i].getElementsByClassName("inline-metadata-item style-scope ytd-video-meta-block")[0];

                if (IsBadVideo(videoViews) || IsMembersOnly(videosList[i])) {
                    videosList[i].parentElement.remove();
                }
            }

            // Rich item renderer (home page - old structure)
            videosList = document.getElementsByClassName("style-scope ytd-rich-item-renderer");
            for (let i = 0; i < videosList.length; i++) {
                if (videosList[i].id !== "content") {
                    continue;
                }

                let videoViews = videosList[i].getElementsByClassName("inline-metadata-item style-scope ytd-video-meta-block")[0];

                if (!videoViews) {
                    let metadataElements = videosList[i].getElementsByClassName("yt-content-metadata-view-model__metadata-text");
                    for (let j = 0; j < metadataElements.length; j++) {
                        let text = metadataElements[j].innerText;
                        if (text && text.includes('views')) {
                            videoViews = metadataElements[j];
                            break;
                        }
                    }
                }

                if (IsBadVideo(videoViews) || IsMembersOnly(videosList[i])) {
                    videosList[i].parentElement.remove();
                }
            }

            // Rich grid media
            videosList = document.querySelectorAll('ytd-rich-grid-media');
            for (let i = 0; i < videosList.length; i++) {
                let videoViews = videosList[i].querySelector('.inline-metadata-item.style-scope.ytd-video-meta-block');

                if (IsBadVideo(videoViews) || IsMembersOnly(videosList[i])) {
                    videosList[i].remove();
                }
            }

            // Watch page filtering
            if (IsWatch()) {
                videosList = document.getElementsByClassName("style-scope ytd-video-preview");
                for (let i = 0; i < videosList.length; i++) {
                    let videoViews = videosList[i].getElementsByClassName("inline-metadata-item style-scope ytd-video-meta-block")[0];

                    if (IsBadVideo(videoViews) || IsMembersOnly(videosList[i])) {
                        let parentToRemove = videosList[i].closest('ytd-compact-video-renderer, ytd-video-preview');
                        if (parentToRemove) {
                            parentToRemove.remove();
                        }
                    }
                }

                videosList = document.querySelectorAll('ytd-compact-video-renderer');
                videosList.forEach(video => {
                    let videoViews = video.querySelector('.inline-metadata-item.style-scope.ytd-video-meta-block');
                    if (IsBadVideo(videoViews) || IsMembersOnly(video)) {
                        video.remove();
                    }
                });
            }
        }
    }
}

// ---------------------------------------------------------------------------
document.addEventListener("yt-navigate-finish", (event) => {
    setTimeout(UpdateVideoFiltering, 350);
});

window.addEventListener("message", (event) => {
    if (!IsShorts()) {
        setTimeout(UpdateVideoFiltering, 200);
    }
});

window.addEventListener("load", (event) => {
    if (!IsShorts()) {
        setTimeout(UpdateVideoFiltering, 200);
    }
});

window.addEventListener("scrollend", (event) => {
    if (!IsShorts()) {
        setTimeout(UpdateVideoFiltering, 0);
    }
});

window.addEventListener("click", (event) => {
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
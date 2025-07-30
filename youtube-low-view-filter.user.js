// ==UserScript==
// @name         YouTube Crappy Videos Remover from Recommendations
// @namespace    http://tampermonkey.net/
// @version      3.7
// @description  Removes YouTube videos with fewer than 999 views from recommendations. Screenshot: https://raw.githubusercontent.com/GauravScripts/youtube-low-view-filter/master/img_1.png
// @author       Gaurav Gupta
// @match        *://*.youtube.com/*
// @exclude      *://*.youtube.com/feed/subscriptions
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @homepage     https://github.com/GauravScripts/youtube-low-view-filter
// @downloadURL  https://raw.githubusercontent.com/GauravScripts/youtube-low-view-filter/master/youtube-low-view-filter.user.js
// @updateURL    https://raw.githubusercontent.com/GauravScripts/youtube-low-view-filter/master/youtube-low-view-filter.user.js
// @grant        none
// ==/UserScript==

// ---------------------------------------------------------------------------
let g_VideosFiltering = true;
let g_ShortsFiltering = true;

function IsSubscriptions()
{
  return location.pathname.startsWith("/feed/subscriptions");
}

function IsChannel()
{
  return location.pathname.startsWith("/@");
}

function IsShorts()
{
  return location.pathname.startsWith("/shorts");
}

function IsWatch()
{
  return location.pathname.startsWith("/watch");
}

function IsNumber(i)
{
    return (i >= '0' && i <= '9');
}

function IsSpace(i)
{
    return i == ' ';
}

function IsSeparator(i)
{
    return i == '.' || i == ',';
}

function IsBadVideo(videoViews)
{
    if (!videoViews) {
        return true; // No view count found, consider it bad
    }

    let text = videoViews.innerText;
    if (text.length == 0) {
        return true; // Empty text, consider it bad
    }

    // Handle Indian number system (lakh, crore)
    if (text.includes('lakh') || text.includes('crore')) {
        return false; // These are definitely > 999 views
    }

    // Handle standard view counts with 'K', 'M', 'B' suffixes
    if (text.includes('K') || text.includes('M') || text.includes('B') || text.includes('million') || text.includes('billion')) {
        return false; // These are definitely > 999 views
    }

    let numbersExists = false
    for (let i = 0; i < text.length; i++)
    {
        // searches for a single number to verify that there's more than zero views
        if (IsNumber(text[i])) {
            numbersExists = true;
            break;
        }
    }

    let twoWordsExists = false
    for (let i = 0; i < text.length - 2; i++)
    {
        // not number + space + not number = this is >1000 views (this should work for all languages)
        if (!IsNumber(text[i]) && IsSpace(text[i + 1]) && !IsNumber(text[i + 2])) {
            twoWordsExists = true;
            break;
        }

        // number + separator + number = this is >1000 views (this should work for all languages)
        if (IsNumber(text[i]) && IsSeparator(text[i + 1]) && IsNumber(text[i + 2])) {
            twoWordsExists = true;
            break;
        }
    }

    // Additional check for explicit view counts
    let viewMatch = text.match(/(\d+(?:[.,]\d+)*)\s*views?/i);
    if (viewMatch) {
        let viewCount = parseInt(viewMatch[1].replace(/[.,]/g, ''));
        if (viewCount > 999) {
            return false;
        }
    }

    let badVideo = !numbersExists || !twoWordsExists;
    if (badVideo) {
        console.log("~BadVideo: '" + text + "'"); // debug
    }

    return badVideo;
}

function IsMembersOnly(videoElement)
{
    if (!videoElement) {
        return false;
    }
    
    // Check for members-only badges
    let membersOnlyElements = videoElement.querySelectorAll('.badge-style-type-members-only');
    if (membersOnlyElements.length > 0) {
        return true;
    }
    
    // Check for "Members only" text
    let textElements = videoElement.querySelectorAll('*');
    for (let element of textElements) {
        if (element.innerText && element.innerText.includes('Members only')) {
            return true;
        }
    }
    
    return false;
}

function IsBadShortVideo(videoViews)
{
    //console.log("IsBadShortVideo()"); // debug

    if (!videoViews) {
        return false;
    }

    let text = videoViews.innerText;
    if (text.length == 0) {
        return false;
    }

    for (let i = 0; i < text.length; i++)
    {
        // nbsp symbol is found
        if (text[i] == '\xa0') {
            return false;
        }
    }

    console.log("~BadShortVideo: '" + text + "'"); // debug
    return true;
}

// ---------------------------------------------------------------------------
function UpdateVideoFiltering()
{
    let videosList;

    if (IsChannel() || IsSubscriptions()) {
        return;
    }

    if (IsShorts())
    {
        if (g_ShortsFiltering)
        {
            // skip bad shorts
            videosList = document.getElementsByClassName("reel-video-in-sequence style-scope ytd-shorts");
            for (let i = 0; i < videosList.length; i++)
            {
                if (!videosList[i].isActive) {
                    continue;
                }

                let videoViews = videosList[i].getElementsByClassName("yt-spec-button-shape-with-label__label")[0];

                if (IsBadShortVideo(videoViews)) {
                    document.getElementsByClassName("navigation-button style-scope ytd-shorts")[1].getElementsByClassName("yt-spec-touch-feedback-shape__fill")[0].click(); // click to next video button (is it even stable lol?)
                }
            }
        }
    }
    else
    {
        if (g_VideosFiltering)
        {
            // delete videos from the right side (compact renderer - used in watch page sidebar)
            videosList = document.getElementsByClassName("style-scope ytd-compact-video-renderer");
            for (let i = 0; i < videosList.length; i++)
            {
                let videoViews = videosList[i].getElementsByClassName("inline-metadata-item style-scope ytd-video-meta-block")[0];

                if (IsBadVideo(videoViews) || IsMembersOnly(videosList[i])) {
                    videosList[i].parentElement.remove();
                }
            }

            // delete videos from the main page (rich item renderer - used on home page)
            videosList = document.getElementsByClassName("style-scope ytd-rich-item-renderer");
            for (let i = 0; i < videosList.length; i++)
            {
                if (videosList[i].id != "content") {
                    continue;
                }

                // Try the old metadata structure first
                let videoViews = videosList[i].getElementsByClassName("inline-metadata-item style-scope ytd-video-meta-block")[0];
                
                // If not found, try the new metadata structure
                if (!videoViews) {
                    let metadataElements = videosList[i].getElementsByClassName("yt-content-metadata-view-model-wiz__metadata-text");
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

            // Handle rich grid media (another layout variant)
            videosList = document.querySelectorAll('ytd-rich-grid-media');
            for (let i = 0; i < videosList.length; i++)
            {
                let videoViews = videosList[i].querySelector('.inline-metadata-item.style-scope.ytd-video-meta-block');
                
                if (IsBadVideo(videoViews) || IsMembersOnly(videosList[i])) {
                    videosList[i].remove();
                }
            }

            // Handle watch page - up next and related videos
            if (IsWatch()) {
                // Filter videos in the "Up next" section and related videos
                videosList = document.getElementsByClassName("style-scope ytd-video-preview");
                for (let i = 0; i < videosList.length; i++)
                {
                    let videoViews = videosList[i].getElementsByClassName("inline-metadata-item style-scope ytd-video-meta-block")[0];

                    if (IsBadVideo(videoViews) || IsMembersOnly(videosList[i])) {
                        // Find the parent container to remove
                        let parentToRemove = videosList[i].closest('ytd-compact-video-renderer, ytd-video-preview');
                        if (parentToRemove) {
                            parentToRemove.remove();
                        }
                    }
                }

                // Additional filtering for watch page secondary content
                videosList = document.getElementsByClassName("style-scope ytd-compact-video-renderer");
                for (let i = 0; i < videosList.length; i++)
                {
                    let videoViews = videosList[i].getElementsByClassName("inline-metadata-item style-scope ytd-video-meta-block")[0];

                    if (IsBadVideo(videoViews) || IsMembersOnly(videosList[i])) {
                        let parentToRemove = videosList[i].closest('ytd-compact-video-renderer');
                        if (parentToRemove) {
                            parentToRemove.remove();
                        }
                    }
                }

                // Filter videos in the comments section area (sometimes videos appear there)
                videosList = document.querySelectorAll('ytd-compact-video-renderer');
                videosList.forEach(video => {
                    let videoViews = video.querySelector('.inline-metadata-item.style-scope.ytd-video-meta-block');
                    if (IsBadVideo(videoViews) || IsMembersOnly(video)) {
                        video.remove();
                    }
                });

                // Handle new YouTube layout with yt-lockup-view-model
                videosList = document.querySelectorAll('yt-lockup-view-model');
                videosList.forEach(video => {
                    // Look for view count in the new structure
                    let viewsElement = video.querySelector('.yt-content-metadata-view-model-wiz__metadata-text');
                    if (viewsElement) {
                        // Check if this element contains view count (usually has "views" or numbers)
                        let viewText = viewsElement.innerText;
                        if (viewText && (viewText.includes('views') || viewText.includes('lakh') || viewText.includes('crore') || /\d/.test(viewText))) {
                            if (IsBadVideo(viewsElement) || IsMembersOnly(video)) {
                                video.remove();
                            }
                        }
                    }
                });

                // Handle yt-content-metadata-view-model structure
                videosList = document.querySelectorAll('yt-content-metadata-view-model');
                videosList.forEach(metadataContainer => {
                    let viewsElements = metadataContainer.querySelectorAll('.yt-content-metadata-view-model-wiz__metadata-text');
                    viewsElements.forEach(viewsElement => {
                        let viewText = viewsElement.innerText;
                        if (viewText && (viewText.includes('views') || viewText.includes('lakh') || viewText.includes('crore') || /\d+\s*views/i.test(viewText))) {
                            if (IsBadVideo(viewsElement)) {
                                // Find the parent video container
                                let parentVideo = viewsElement.closest('yt-lockup-view-model');
                                if (parentVideo) {
                                    parentVideo.remove();
                                }
                            }
                        }
                    });
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

// Additional event listener for watch page content changes
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

// Enhanced filtering for dynamically loaded content on watch pages
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
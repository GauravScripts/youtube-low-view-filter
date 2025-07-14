# YouTube Low Views Video Filter UserScript

## Overview

This UserScript automatically filters out YouTube videos with low view counts (typically less than 1,000 views) from your recommendations, homepage, sidebar, and related videos. It helps you avoid videos with very few views, including shorts, and keeps your YouTube experience focused on more popular content.

## Features

- **Filters low-view videos** from the homepage, sidebar, related videos, and dynamically loaded content.
- **Supports YouTube Shorts**: Skips shorts with low engagement.
- **Handles various view count formats**: Supports Indian number system (lakh, crore), standard suffixes (K, M, B), and explicit view counts.
- **Works with new and old YouTube layouts**: Adapts to changes in YouTube's DOM structure.
- **Automatic filtering**: Runs on navigation, page load, scroll, and dynamic content changes.

## Installation

1. **Install a UserScript Manager**  
   - [Tampermonkey](https://www.tampermonkey.net/) (recommended)
   - [Violentmonkey](https://violentmonkey.github.io/)

2. **Add the Script**  
   - Copy the contents of `youtube-low-view-filter.user.js`.
   - Create a new script in your UserScript manager and paste the code.
   - Save and enable the script.

3. **Usage**  
   - Visit [YouTube](https://www.youtube.com/).
   - The script will automatically filter out low-view videos from your feed.

## Configuration

- **Video Filtering**: Enabled by default.  
  You can toggle filtering by changing the `g_VideosFiltering` and `g_ShortsFiltering` variables in the script.

## How It Works

- The script listens for navigation, page load, scroll, and click events.
- It scans for video elements and checks their view counts.
- Videos with less than 1,000 views (or not matching popular view formats) are removed from the DOM.
- Shorts with low engagement are skipped automatically.

## Supported YouTube Pages

- Homepage
- Watch page (sidebar, related videos, up next)
- Shorts
- Dynamically loaded content (new layouts)

## Limitations

- The script may not work on the Subscriptions feed (intentionally excluded).
- YouTube layout changes may require script updates.
- Filtering is based on view count text; edge cases may exist.

## Reporting Issues

If you find any issues or have suggestions, please email:  
**gaurav.jindoli@gmail.com**

## License

This script is provided as-is for personal use.

---

**Author:** NiceL  
**Maintainer:** GauravScripts
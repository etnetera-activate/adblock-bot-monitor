# **AdBlock & Bot Detection Analytics**

A privacy-first, robust analytics solution designed to measure AdBlock usage, detect tracking protection (blocked scripts), and identify bot traffic using server-side verification.

This project consists of a lightweight **Client-Side JavaScript** tracker and a **Server-Side Google Cloud Run Function** that processes data and stores it in **BigQuery**.

## **🚀 Key Features**

* **AdBlock Detection:**  
  * **Cosmetic Filtering:** Detects if ad-like DOM elements are hidden by browser extensions.  
  * **Network Filtering:** Passively checks if marketing scripts (GA4, GTM, Facebook Pixel, Ads) are blocked at the network level.  
* **Advanced Bot Detection:**  
  * **Server-Side IP Verification:** Checks visitor IPs against a live list of known crawler IPs (Googlebot, Bingbot, etc.) to distinguish "Good Bots" from humans.  
  * **Client-Side Heuristics:** Detects headless browsers (e.g., Puppeteer, Selenium) via `navigator.webdriver` and other signals.  
* **Device Fingerprinting:** Classifies traffic by Device Type (Mobile/Desktop/Tablet), Model, and Browser (including niche browsers like Arc and Seznam).  
* **Privacy-Focused:** Uses `no-cors` checks to avoid setting cookies or triggering security warnings.  
* **GTM Integration:** Pushes verification results (`is_bot`, `ad_block_detected`) to the `dataLayer` for use in Google Tag Manager.

## **🏗️ Architecture**

1. **Client Script (`adblock-tracker.js`):** Runs on the user's browser. It performs passive checks and gathers environment data.  
2. **Cloud Run Function:** Receives the data payload. It fetches a realtime list of known bot IPs, verifies the user, and sanitizes the data.  
3. **BigQuery:** Stores the raw event data for analysis.

## **🛠️ Setup Guide**

### **1\. BigQuery Setup**

Create a dataset and table in Google BigQuery to store the events.

1. Create a Dataset: `adblock_bot_detector_data`  
2. Create a Table: `collected_events`  
3. **Schema:** Add the following fields (all **Nullable**):

| Field Name | Type | Description |
| ----- | ----- | ----- |
| `timestamp` | `TIMESTAMP` | Server-side timestamp |
| `recaptcha_score` | `FLOAT` | 1.0 \= Human, 0.0 \= Bot |
| `bot_type` | `STRING` | "Human", "Known Bot" (e.g. Googlebot), or "Headless Browser" |
| `user_agent` | `STRING` | Raw User-Agent string |
| `browser` | `STRING` | Detected browser name |
| `deviceType` | `STRING` | Mobile, Desktop, or Tablet |
| `deviceModel` | `STRING` | e.g. iPhone, Pixel 6 |
| `hostname` | `STRING` |  |
| `pageURL` | `STRING` |  |
| `event_name` | `STRING` |  |
| `value` | `STRING` |  |
| `referrer` | `STRING` |  |
| `utm_source` | `STRING` |  |
| `utm_medium` | `STRING` |  |
| `utm_campaign` | `STRING` |  |
| `adBlockDetected` | `INTEGER` | 1 \= Yes, 0 \= No |
| `facebookRequestBlocked` | `INTEGER` | 1 \= Yes, 0 \= No |
| `googleAnalyticsRequestBlocked` | `INTEGER` | 1 \= Yes, 0 \= No |
| `googleAdsRequestBlocked` | `INTEGER` | 1 \= Yes, 0 \= No |
| `bingAdsRequestBlocked` | `INTEGER` | 1 \= Yes, 0 \= No |
| `gtmRequestBlocked` | `INTEGER` | 1 \= Yes, 0 \= No |
| `cookiebotBlocked` | `INTEGER` | 1 \= Yes, 0 \= No |
| `isBotDetected` | `INTEGER` | Client-side flag (1 \= Headless) |
| `screen_width` | `INTEGER` |  |
| `screen_height` | `INTEGER` |  |
| `window_width` | `INTEGER` |  |
| `window_height` | `INTEGER` |  |
| `load_time_ms` | `INTEGER` |  |

### **2\. Google Cloud Run Function**

Deploy the server-side logic that acts as the secure middleman.

1. Create a **2nd Gen** Cloud Run Function.  
2. **Runtime:** Node.js 20\.  
3. **Trigger:** HTTPS (Allow unauthenticated invocations).  
4. **Files:**  
   * `index.js`: Copy the server code provided in this repo.  
   * `package.json`:

```
{
  "dependencies": {
    "@google-cloud/bigquery": "^7.0.0",
    "ip-range-check": "^0.2.0"
  }
}
```

5.   
   **Permissions:** Grant the function's Service Account the **BigQuery Data Editor** role.  
6. **Deploy** and copy the **Trigger URL**.

### **3\. Client Script Configuration**

1. Open `adblock-tracker.js`.  
2. Update the `ENDPOINT` constant at the top with your Cloud Run Trigger URL:

```
const ENDPOINT = "[https://your-region-project.run.app](https://your-region-project.run.app)";
```

3.   
   Host this file on your server (e.g., GitHub Pages, CDN, or static folder).

## **💻 Usage**

Add the script to your website's `<head>` or just before the closing `</body>` tag.

```
<!-- AdBlock & Bot Tracker -->
<script 
  src="/path/to/adblock-tracker.js?event_name=page_view" 
  defer>
</script>
```

### **Data Layer Events**

When the script finishes execution, it pushes an event to the `dataLayer` which you can use in GTM triggers:

```
window.dataLayer.push({
    'event': 'bot_verification', 
    'is_bot': 0, // 0 = Human, 1 = Bot
    'ad_block_detected': 1 // 1 = AdBlock Active
});
```

## **🛡️ Privacy & Compliance**

* **No Cookies:** The script does not set any cookies.  
* **Passive Detection:** It checks if resources *can* be loaded using `fetch` with `mode: 'no-cors'`. It does not execute third-party code or send data to ad platforms during the check.  
* **Bot Whitelisting:** Uses the [sefinek/known-bots-ip-whitelist](https://github.com/sefinek/known-bots-ip-whitelist) to correctly identify and label legitimate crawlers (Googlebot, Bingbot) instead of blocking them.


(function() {
    // 🔴 CONFIGURATION: Your Cloud Run Endpoint
    const ENDPOINT = "https://abdc-272425173894.europe-central2.run.app";

    // --- 1. Manual Bot Detection (Client Side) ---
    // Checks for obvious automation flags (Headless Chrome, Selenium, etc.)
    function isBot() {
        return (
            navigator.webdriver || 
            window.outerWidth === 0 || 
            window.outerHeight === 0 || 
            navigator.hardwareConcurrency === 0 ||
            (navigator.languages && navigator.languages.length === 0)
        );
    }

    async function getBrowser() {
        var userAgent = navigator.userAgent;
        if (userAgent.indexOf("Edg") > -1) return "Edge";
        if (userAgent.indexOf("Firefox") > -1) return "Firefox";
        if (userAgent.indexOf("OPR") > -1 || userAgent.indexOf("Opera") > -1) return "Opera";
        if (userAgent.indexOf("Vivaldi") > -1) return "Vivaldi";
        if (userAgent.indexOf("Brave") > -1 || (navigator.brave && await navigator.brave.isBrave())) return "Brave";
        if (userAgent.indexOf("Safari") > -1 && userAgent.indexOf("Chrome") === -1) return "Safari";
        if (userAgent.indexOf("Chrome") > -1) return "Chrome";
        if (userAgent.indexOf("Trident") > -1 || userAgent.indexOf("MSIE") > -1) return "Internet Explorer";
        return "Other";
    }

    // --- 2. The Passive Network Check ---
    async function checkResourceBlocked(url) {
        try {
            await fetch(url, { method: 'GET', mode: 'no-cors', cache: 'no-store' });
            return 0; 
        } catch (error) {
            return 1; 
        }
    }

    function getScriptParams() {
        if (document.currentScript) {
            return new URLSearchParams(document.currentScript.src.split('?')[1]);
        }
        const script = document.querySelector('script[src*="adblock-collector.js"]') || 
                       document.querySelector('script[src*="adblock-tracker.js"]');
        if (script && script.src.includes('?')) {
            return new URLSearchParams(script.src.split('?')[1]);
        }
        return new URLSearchParams();
    }

    const scriptParams = getScriptParams();

    // --- 3. Main Execution ---
    var adBlockDetected = 0;

    getBrowser().then(async browser => {
        
        // Start Network Checks
        const checksPromise = Promise.all([
            checkResourceBlocked('https://www.googletagmanager.com/gtm.js?id=GTM-TQP4WV7B'),
            checkResourceBlocked('https://connect.facebook.net/en_US/fbevents.js'),
            checkResourceBlocked('https://www.google-analytics.com/analytics.js'),
            checkResourceBlocked('https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js'),
            checkResourceBlocked('https://bat.bing.com/bat.js'),
            checkResourceBlocked('https://consent.cookiebot.com/uc.js')
        ]);

        var bait = document.createElement('div');
        bait.innerHTML = '&nbsp;';
        bait.className = 'pub_300x250 pub_728x90 text-ad textAd text_ad text_ads text-ads text-ad-links';
        bait.style.cssText = 'width:1px;height:1px;position:absolute;left:-10000px;top:-10000px;';
        document.body.appendChild(bait);
        
        // Wait for network checks to finish
        const networkResults = await checksPromise;

        // Check CSS Bait
        if (bait.offsetHeight === 0 || bait.offsetWidth === 0 || window.getComputedStyle(bait).display === 'none') {
            adBlockDetected = 1;
        }
        document.body.removeChild(bait);

        var [gtmRequestBlocked, facebookRequestBlocked, googleAnalyticsRequestBlocked, googleAdsRequestBlocked, bingAdsRequestBlocked, cookiebotBlocked] = networkResults;

        function getQueryParam(name) {
            const params = new URLSearchParams(window.location.search);
            return params.get(name) || '';
        }

        var data = {
            recaptchaToken: null, // Turnstile removed
            isBotDetected: isBot() ? 1 : 0, // Manual bot detection added
            browser: browser,
            adBlockDetected: adBlockDetected,
            facebookRequestBlocked: facebookRequestBlocked,
            googleAnalyticsRequestBlocked: googleAnalyticsRequestBlocked,
            googleAdsRequestBlocked: googleAdsRequestBlocked,
            bingAdsRequestBlocked: bingAdsRequestBlocked,
            cookiebotBlocked: cookiebotBlocked,
            gtmRequestBlocked: gtmRequestBlocked,
            hostname: window.location.hostname,
            pageURL: window.location.href,
            event_name: scriptParams.get('event_name') || 'unknown_event',
            value: scriptParams.get('event_value') || '',
            referrer: document.referrer || '(direct)',
            utm_source: getQueryParam('utm_source'),
            utm_medium: getQueryParam('utm_medium'),
            utm_campaign: getQueryParam('utm_campaign')
        };

        var xhr = new XMLHttpRequest();
        xhr.open("POST", ENDPOINT, true);
        xhr.setRequestHeader("Content-Type", "application/json");

        xhr.onload = function() {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    var response = JSON.parse(xhr.responseText);
                    window.dataLayer = window.dataLayer || [];
                    window.dataLayer.push({
                        'event': 'turnstile_verified', 
                        'bot_score': response.recaptcha_score, 
                        'ad_block_detected': adBlockDetected
                    });
                } catch (e) {
                    console.warn("Failed to parse analytics response", e);
                }
            }
        };

        xhr.onerror = function () { console.warn("Analytics upload failed"); };
        xhr.send(JSON.stringify(data));
    });
})();

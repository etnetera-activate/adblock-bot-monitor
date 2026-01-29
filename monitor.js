(function() {
    // 🔴 CONFIGURATION
    const TURNSTILE_SITE_KEY = "0x4AAAAAACDFJFkgBiwww4ZT";
    const ENDPOINT = "https://abdc-272425173894.europe-central2.run.app";

    // Global state
    let dataSent = false;
    let turnstileToken = null;
    let detectedBrowser = 'Unknown';
    
    // Removed specific network probes to avoid Brave Heuristics blocking
    // We will just send 0 for specific services to keep BigQuery schema happy
    
    async function getBrowser() {
        var userAgent = navigator.userAgent;

        // Arc Browser Detection
        if (getComputedStyle(document.documentElement).getPropertyValue('--arc-palette-title')) {
            return "Arc Browser";
        }

        if (userAgent.indexOf("Edg") > -1) return "Edge";
        if (userAgent.indexOf("Seznam.cz") > -1) return "Seznam Browser";
        if (userAgent.indexOf("SamsungBrowser") > -1) return "Samsung Internet";
        if (userAgent.indexOf("UCBrowser") > -1) return "UC Browser";
        if (userAgent.indexOf("YaBrowser") > -1) return "Yandex";
        if (userAgent.indexOf("Firefox") > -1) return "Firefox";
        if (userAgent.indexOf("OPR") > -1 || userAgent.indexOf("Opera") > -1) return "Opera";
        if (userAgent.indexOf("Vivaldi") > -1) return "Vivaldi";
        if (userAgent.indexOf("Brave") > -1 || (navigator.brave && await navigator.brave.isBrave())) return "Brave";
        if (userAgent.indexOf("DuckDuckGo") > -1) return "DuckDuckGo";
        
        if (userAgent.indexOf("Arc") > -1) return "Arc Browser";

        if (userAgent.indexOf("Safari") > -1 && userAgent.indexOf("Chrome") === -1) return "Safari";
        if (userAgent.indexOf("Chrome") > -1) return "Chrome";
        if (userAgent.indexOf("Trident") > -1 || userAgent.indexOf("MSIE") > -1) return "Internet Explorer";
        return "Other";
    }

    // Pre-calculate browser immediately
    getBrowser().then(b => detectedBrowser = b);

    // --- Data Collection & Sending ---
    function getScriptParams() {
        if (document.currentScript) return new URLSearchParams(document.currentScript.src.split('?')[1]);
        const script = document.querySelector('script[src*="event_name="]');
        return (script && script.src.includes('?')) ? new URLSearchParams(script.src.split('?')[1]) : new URLSearchParams();
    }
    const scriptParams = getScriptParams();

    function getQueryParam(name) {
        return new URLSearchParams(window.location.search).get(name) || '';
    }

    function sendAnalyticsData() {
        if (dataSent) return; 
        dataSent = true;

        // Check AdBlock Bait (Cosmetic Filtering)
        // This is much safer than network probing as it only checks DOM elements
        let adBlockDetected = 0;
        const bait = document.querySelector('.pub_300x250');
        if (bait && (bait.offsetHeight === 0 || bait.offsetWidth === 0 || window.getComputedStyle(bait).display === 'none')) {
            adBlockDetected = 1;
        }

        const payload = {
            recaptchaToken: turnstileToken || '', 
            browser: detectedBrowser,
            adBlockDetected: adBlockDetected,
            
            // Sending 0 for specific checks to pass schema validation
            // without triggering Brave's network heuristics
            facebookRequestBlocked: 0,
            googleAnalyticsRequestBlocked: 0,
            googleAdsRequestBlocked: 0,
            bingAdsRequestBlocked: 0,
            cookiebotBlocked: 0,
            gtmRequestBlocked: 0,
            
            hostname: window.location.hostname,
            pageURL: window.location.href,
            event_name: scriptParams.get('event_name') || 'unknown_event',
            value: scriptParams.get('event_value') || '',
            referrer: document.referrer || '(direct)',
            utm_source: getQueryParam('utm_source'),
            utm_medium: getQueryParam('utm_medium'),
            utm_campaign: getQueryParam('utm_campaign')
        };

        const urlParams = new URLSearchParams();
        for (const key in payload) {
            urlParams.append(key, payload[key]);
        }

        // Fire and Forget
        if (navigator.sendBeacon) {
            const success = navigator.sendBeacon(ENDPOINT, urlParams);
            if (success) return; 
        }

        fetch(ENDPOINT, {
            method: 'POST',
            body: urlParams,
            keepalive: true 
        }).catch(err => {
            if (!document.hidden) console.warn("Analytics send failed", err);
        });
    }

    // --- Execution Logic ---

    // Start CSS Bait
    var bait = document.createElement('div');
    bait.className = 'pub_300x250 pub_728x90 text-ad textAd text_ad text_ads text-ads text-ad-links';
    bait.style.cssText = 'width:1px;height:1px;position:absolute;left:-10000px;top:-10000px;';
    document.body.appendChild(bait);

    // Turnstile Loader 
    function loadTurnstileToken() {
        const uniqueId = 'cf-wrapper-' + Math.random().toString(36).substr(2, 9);
        const container = document.createElement('div');
        container.id = uniqueId;
        container.style.marginTop = '20px';
        container.style.marginBottom = '20px';
        document.body.appendChild(container);

        if (!document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]') && !window.turnstile) {
            const script = document.createElement('script');
            script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
            script.async = true;
            document.head.appendChild(script);
        }

        const checkTurnstile = () => {
            if (window.turnstile) {
                try {
                    window.turnstile.render('#' + uniqueId, {
                        sitekey: TURNSTILE_SITE_KEY,
                        appearance: 'always', 
                        callback: function(token) {
                            turnstileToken = token;
                            // Send immediately on success
                            // We delayed slightly to ensure CSS bait check is done
                            setTimeout(sendAnalyticsData, 200);
                        },
                        'error-callback': function() {
                            setTimeout(sendAnalyticsData, 200);
                        }
                    });
                } catch (e) { /* Ignore render errors */ }
            } else {
                setTimeout(checkTurnstile, 100);
            }
        };
        checkTurnstile();
        
        // Timeout Safety (15s)
        setTimeout(() => { if(!dataSent) sendAnalyticsData(); }, 15000);
    }

    loadTurnstileToken();

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden' && !dataSent) {
            sendAnalyticsData();
        }
    });

})();

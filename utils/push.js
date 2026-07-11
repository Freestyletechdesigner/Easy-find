'use strict';

/**
 * OneSignal Push Notification Utility
 * =====================================
 * Sends push notifications to agents via the OneSignal REST API.
 * Notifications are delivered even when the agent has the site closed,
 * as long as they have subscribed to push notifications.
 *
 * OneSignal identifies agents by their External ID (set to agent._id)
 * which is assigned when the agent loads any page via onesignal-init.js.
 */

const axios = require('axios');

const ONESIGNAL_API = 'https://api.onesignal.com/notifications';

/**
 * Send a push notification to one or more agents by their MongoDB ID.
 *
 * @param {object} options
 * @param {string|string[]} options.agentIds   - Agent MongoDB _id(s)
 * @param {string}          options.title      - Notification title
 * @param {string}          options.message    - Notification body
 * @param {string}          [options.url]      - Click URL (defaults to dashboard)
 * @param {string}          [options.icon]     - Icon URL
 * @param {object}          [options.data]     - Extra data payload
 */
async function sendPushToAgents({ agentIds, title, message, url, icon, data }) {
    const appId  = process.env.ONESIGNAL_APP_ID;
    const apiKey = process.env.ONESIGNAL_REST_API_KEY;

    if (!appId || !apiKey || apiKey === 'your_onesignal_rest_api_key_here') {
        console.warn('[OneSignal] ONESIGNAL_REST_API_KEY not set — push skipped');
        return;
    }

    const ids = Array.isArray(agentIds) ? agentIds : [agentIds];
    if (!ids.length) return;

    const payload = {
        app_id:             appId,
        target_channel:     'push',
        include_aliases:    { external_id: ids.map(String) },
        headings:           { en: title   || 'Easy Find' },
        contents:           { en: message || '' },
        url:                url  || 'https://easyfind.com.ng/agent-loged',
        chrome_web_icon:    icon || 'https://easyfind.com.ng/logo/logo.JPEG',
        firefox_icon:       icon || 'https://easyfind.com.ng/logo/logo.JPEG',
        data:               data || {},
    };

    try {
        const res = await axios.post(ONESIGNAL_API, payload, {
            headers: {
                'Content-Type':  'application/json',
                'Authorization': `Key ${apiKey}`,
            },
        });
        console.log(`[OneSignal] Push sent to ${ids.length} agent(s):`, res.data?.id || res.data);
    } catch (err) {
        console.error('[OneSignal] Push failed:', err.response?.data || err.message);
    }
}

/**
 * Send a push to ALL subscribed agents.
 * Uses the built-in "All" segment.
 */
async function sendPushToAllAgents({ title, message, url, icon }) {
    const appId  = process.env.ONESIGNAL_APP_ID;
    const apiKey = process.env.ONESIGNAL_REST_API_KEY;

    if (!appId || !apiKey || apiKey === 'your_onesignal_rest_api_key_here') {
        console.warn('[OneSignal] ONESIGNAL_REST_API_KEY not set — push skipped');
        return;
    }

    try {
        const res = await axios.post(ONESIGNAL_API, {
            app_id:          appId,
            target_channel:  'push',
            included_segments: ['All'],
            headings:        { en: title   || 'Easy Find' },
            contents:        { en: message || '' },
            url:             url  || 'https://easyfind.com.ng',
            chrome_web_icon: icon || 'https://easyfind.com.ng/logo/logo.JPEG',
        }, {
            headers: {
                'Content-Type':  'application/json',
                'Authorization': `Key ${apiKey}`,
            },
        });
        console.log('[OneSignal] Broadcast push sent:', res.data?.id);
    } catch (err) {
        console.error('[OneSignal] Broadcast push failed:', err.response?.data || err.message);
    }
}

module.exports = { sendPushToAgents, sendPushToAllAgents };

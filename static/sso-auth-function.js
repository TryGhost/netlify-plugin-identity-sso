const crypto = require('crypto');

/**
 * @param {string} base64
 */
function cleanupBase64(base64) {
    return base64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/**
 * @param {string} token
 * @param {string} secret
 * @returns {boolean}
 */
function verifyJWS(token, secret) {
    /** @type {string[]} */
    const [params, payload, signature] = token.split('.');
    if (!params || !payload || !signature) {
        return false;
    }

    // extract first two elements of JWT and sign
    let signedPayload = [params, payload].join('.');
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(signedPayload);
    const expected = cleanupBase64(hmac.digest('base64'));

    return expected === signature;
}

/**
 * @param {{ headers: { [x: string]: any; }; body: string; }} event
 */
async function handler(event) {
    if ('WEBHOOK_SECRET' in process.env) {
        const signature = event.headers['x-webhook-signature'];
        if (!verifyJWS(signature, process.env.WEBHOOK_SECRET)) {
            console.log('Webhook signature invalid:', signature);
            return {
                statusCode: 401
            };
        }
    }

    /** @type {{user: { email: string, app_metadata: { roles?: string[]}}}} */
    let payload = null;
    try {
        payload = JSON.parse(event.body);
    } catch (e) {
        return {
            statusCode: 400
        };
    }
    const {
        user: {email, user_metadata: userMetadata, app_metadata: appMetadata}
    } = payload;

    // User is part of Ghost and already has role
    const found =
        appMetadata.roles &&
        appMetadata.roles.find(r => r === 'ghost') !== undefined;

    if (found) {
        return {
            statusCode: 200
        };
    }

    if (email && email.endsWith('@ghost.org')) {
        console.log('User is part of Ghost without role. assigning...');
        const roles = (appMetadata && appMetadata.roles) || [];
        const metadata = {
            ...appMetadata,
            roles: [...roles, 'ghost']
        };
        return {
            statusCode: 200,
            body: JSON.stringify({
                app_metadata: metadata,
                user_metadata: userMetadata
            })
        };
    }

    console.log('User is not part of Ghost.');
    return {
        statusCode: 401
    };
}

exports.handler = handler;

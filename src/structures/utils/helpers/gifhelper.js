const GIFEncoder = require('gifencoder');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const https = require('https');
const http = require('http');

/**
 * Downloads a URL into a Buffer.
 */
function fetchBuffer(url) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return resolve(fetchBuffer(res.headers.location));
            }
            if (res.statusCode !== 200) {
                return reject(new Error(`failed to fetch media: ${res.statusCode}`));
            }
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
        }).on('error', reject);
    });
}

/**
 * Resolves direct GIF URL from Tenor or Giphy links if needed.
 */
async function resolveMediaUrl(rawUrl) {
    if (!rawUrl) return null;
    let url = rawUrl.trim();

    // Remove markdown links e.g. <https://...>
    if (url.startsWith('<') && url.endsWith('>')) {
        url = url.slice(1, -1).trim();
    }

    if (url.includes('tenor.com/view/')) {
        try {
            const htmlBuffer = await fetchBuffer(url);
            const html = htmlBuffer.toString('utf8');
            const ogImageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i) ||
                                 html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:image["']/i);
            if (ogImageMatch && ogImageMatch[1]) {
                return ogImageMatch[1];
            }
        } catch (_) {}
    }

    return url;
}

/**
 * Extracts the first image/GIF URL from a Discord message.
 */
function extractImageUrlFromMessage(msg, allowThumbnails = false) {
    if (!msg) return null;

    // 1. Attachments
    if (msg.attachments && msg.attachments.size > 0) {
        for (const att of msg.attachments.values()) {
            const ct = (att.contentType || '').toLowerCase();
            const name = (att.name || '').toLowerCase();
            if (ct.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(name)) {
                return att.url;
            }
        }
    }

    // 2. Message Content URLs
    if (msg.content) {
        const urlMatch = msg.content.match(/https?:\/\/[^\s<>"']+/i);
        if (urlMatch) {
            const matched = urlMatch[0];
            if (/\.(png|jpe?g|gif|webp)(\?.*)?$/i.test(matched) || matched.includes('tenor.com/view/') || matched.includes('giphy.com/gifs/')) {
                return matched;
            }
        }
    }

    // 3. Embeds (only full image, skip thumbnails unless explicitly allowed)
    if (msg.embeds && msg.embeds.length > 0) {
        for (const emb of msg.embeds) {
            if (emb.image?.url) return emb.image.url;
            if (allowThumbnails && emb.thumbnail?.url) return emb.thumbnail.url;
        }
    }

    return null;
}

/**
 * Searches the channel history for the most recent user message with an image/GIF attachment or link.
 */
async function findRecentImageInChannel(channel, limit = 25) {
    if (!channel?.messages?.fetch) return null;
    try {
        const messages = await channel.messages.fetch({ limit });
        for (const msg of messages.values()) {
            // Skip bot embed cards/achievements when searching channel history
            if (msg.author?.bot && (!msg.attachments || msg.attachments.size === 0)) continue;

            const url = extractImageUrlFromMessage(msg, false);
            if (url) return { url, message: msg };
        }
    } catch (_) {}
    return null;
}

/**
 * Checks if a buffer represents an animated GIF (has multiple image blocks).
 */
function isBufferAnimatedGif(buffer) {
    if (!buffer || buffer.length < 16) return false;
    const header = buffer.toString('ascii', 0, 6);
    if (header !== 'GIF87a' && header !== 'GIF89a') return false;

    let frames = 0;
    for (let i = 0; i < buffer.length - 1; i++) {
        // Image separator is 0x2C (',')
        if (buffer[i] === 0x00 && buffer[i + 1] === 0x2C) {
            frames++;
            if (frames > 1) return true;
        }
    }
    return frames > 1;
}

/**
 * Converts an image into a GIF directly with no fake animations.
 */
async function renderImageToGif(inputUrlOrBuffer) {
    let rawBuffer;
    if (Buffer.isBuffer(inputUrlOrBuffer)) {
        rawBuffer = inputUrlOrBuffer;
    } else {
        const resolvedUrl = await resolveMediaUrl(inputUrlOrBuffer);
        rawBuffer = await fetchBuffer(resolvedUrl);
    }

    // If source is already a GIF, return directly
    const header = rawBuffer.toString('ascii', 0, 6);
    if (header === 'GIF87a' || header === 'GIF89a') {
        return {
            buffer: rawBuffer,
            isOriginalGif: true
        };
    }

    const img = await loadImage(rawBuffer);

    let w = img.width;
    let h = img.height;
    const maxDim = 1024;
    if (w > maxDim || h > maxDim) {
        if (w >= h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
        } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
        }
    }
    if (w % 2 !== 0) w--;
    if (h % 2 !== 0) h--;

    const encoder = new GIFEncoder(w, h);
    encoder.start();
    encoder.setRepeat(0);
    encoder.setQuality(10);

    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    encoder.addFrame(ctx);
    encoder.finish();

    const gifBuffer = encoder.out.getData();

    return {
        buffer: gifBuffer,
        isOriginalGif: false,
        width: w,
        height: h
    };
}

module.exports = {
    fetchBuffer,
    resolveMediaUrl,
    extractImageUrlFromMessage,
    findRecentImageInChannel,
    isBufferAnimatedGif,
    renderImageToGif
};

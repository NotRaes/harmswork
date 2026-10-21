const { parentPort } = require('worker_threads');
const path = require('path');

require('../helpers/fonts.js');
const { renderShipCard } = require('../helpers/ship.js');
const { renderFakeMessage } = require('../helpers/fakemessage.js');
const { renderQuote } = require('../helpers/quote.js');

if (parentPort) {
    parentPort.on('message', async (task) => {
        const { id, type, payload } = task;
        try {
            let buffer = null;
            if (type === 'ship') {
                buffer = await renderShipCard(payload, true);
            } else if (type === 'fakemessage') {
                buffer = await renderFakeMessage(payload, true);
            } else if (type === 'quote') {
                buffer = await renderQuote(payload, true);
            } else {
                throw new Error(`unknown canvas task type: ${type}`);
            }

            if (!buffer || !Buffer.isBuffer(buffer)) {
                throw new Error('renderer did not return a valid buffer');
            }

            const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
            parentPort.postMessage({ id, success: true, buffer: arrayBuffer }, [arrayBuffer]);
        } catch (err) {
            parentPort.postMessage({ id, success: false, error: err.message });
        }
    });
}

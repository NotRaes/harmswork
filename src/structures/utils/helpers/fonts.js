const path = require('path');
const fs = require('fs');
const { GlobalFonts } = require('@napi-rs/canvas');

let _loaded = false;

const FONT_FAMILY_MAP = {
    'anton': ['anton', 'Anton'],
    'bebasneue': ['bebasneue', 'BebasNeue', 'Bebas Neue'],
    'chewy': ['chewy', 'Chewy'],
    'cinzel': ['cinzel', 'Cinzel'],
    'creepster': ['creepster', 'Creepster'],
    'inter': ['inter', 'Inter'],
    'jetbrainsmono': ['jetbrainsmono', 'JetBrainsMono', 'JetBrains Mono'],
    'montserrat': ['montserrat', 'Montserrat'],
    'pacifico': ['pacifico', 'Pacifico'],
    'permanentmarker': ['permanentmarker', 'PermanentMarker', 'Permanent Marker'],
    'pressstart2p': ['pressstart2p', 'PressStart2P', 'Press Start 2P'],
    'righteous': ['righteous', 'Righteous'],
    'unifrakturmaguntia': ['unifrakturmaguntia', 'UnifrakturMaguntia'],
    'zenantique': ['zenantique', 'ZenAntique', 'Zen Antique'],
    'gg_sans': ['gg_sans', 'gg sans']
};

function initFonts() {
    if (_loaded) return;
    const fontsDir = path.resolve(__dirname, '../assets/fonts');
    if (!fs.existsSync(fontsDir)) return;

    const files = fs.readdirSync(fontsDir);
    for (const f of files) {
        if (f.endsWith('.ttf') || f.endsWith('.otf')) {
            const base = path.basename(f, path.extname(f)).toLowerCase();
            const fullPath = path.join(fontsDir, f);
            const families = FONT_FAMILY_MAP[base] || [base];
            for (const family of families) {
                try {
                    GlobalFonts.registerFromPath(fullPath, family);
                } catch (_) {}
            }
        }
    }
    _loaded = true;
}

initFonts();

module.exports = {
    initFonts,
    GlobalFonts
};

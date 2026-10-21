module.exports = {
    /*
                                        harm
                                ✦ ──────────── ✦ 
    */
    /*
           variables
       ✦ ──────────── ✦ 
    */
    /* token required == */ token: "",
    /* prefix required == */ prefix: ",",
    /* owner(s) == */ owners: ['837940598287237161'],
    /* typing delay(1000=1) == */ delay: 0,

    /* dashboard & discord oauth2 */
    clientId: "1490995846626545674",
    clientSecret: "lI6NydgA2_ewYLA78gu0C_dooyv_d40U",
    redirectUri: "http://localhost:3001/api/auth/callback",
    apiPort: 3001,
    supportGuildId: "1555845452790767677",
    supportInvite: "https://discord.gg/hCQhTmPf2G",
    invitePermissions: "1376435694838", // granular non-admin permissions for Top.gg compliance


    /*
            colors
       ✦ ──────────── ✦ 
    */
    colors: {
        c: "#0A0A0C",  // main color
        wc: "#FAA81A", // warning color
        cc: "#ED4245", // critical color
        ic: "#5865F2", // info color
    },

    /*
            status
       ✦ ──────────── ✦
    */

    /* types: 0 = playing, 1 = streaming, 2 = listening, 3 = watching, 4 = custom, 5 = competing */
    /* link to be youtube or twitch for streaming (type 1) */
    /* placeholders supported: {prefix}, {guilds}, {users}, {channels} */
    presence: {
        status: 'online', // 'online' | 'idle' | 'dnd' | 'invisible'
        interval: 30000, // rotation delay in milliseconds (15s)
        activities: [
            {
                name: 'listening to beyonce',
                type: 1,
                url: 'https://www.youtube.com/watch?v=Mv5f9Q2LJYM'
            },
            {
                name: 'listening to bruno mars',
                type: 1,
                url: 'https://www.youtube.com/watch?v=MRSaiAREnwI&list=RDMRSaiAREnwI&start_radio=1'
            },
            {
                name: 'listening to lana del rey',
                type: 1,
                url: 'https://www.youtube.com/watch?v=jvm6DpqqbLk&list=RDjvm6DpqqbLk&start_radio=1'
            },
            {
                name: 'watching global prefix {prefix}',
                type: 1,
                url: 'https://www.youtube.com/watch?v=Q6978DnF8C4&list=RDQ6978DnF8C4&start_radio=1'
            }
        ]
    },

    /*
           emojis
       ✦ ──────────── ✦
    */

    emojis: {
        premium: "<:harm_premium:1558810882795114536>",
        standard: "<:harm_standard:1558811340385026119>",
        wand: "<:harm_wand:1560309018973442169>",
        mail: "<:harm_mail:1560309035327291547>",
        eye: "<:eeye:1483784989861478400>", // not in uploaded screenshots (kept from esh)
        al: "<:harm_left:1560309043657052240>",
        ar: "<:harm_right:1560309045720649819>",
        first: "<:harm_first:1560309039592636657>",
        last: "<:harm_last:1560309041618755585>",
        gengar: "<:blackgengar:1555842822463295488>",
        blackgengar: "<:blackgengar:1555842822463295488>",
        cancel: "<:harm_deny:1558811268608167939>",
        deny: "<:harm_deny:1558811268608167939>",
        denycancel: "<:harm_deny:1558811268608167939>",
        dots: "<:harm_dots:1560309047700357141>",
        extend: "<:extend:1555842833100054539>",
        extender: "<:extender:1555842836144848967>",
        approve: "<:harm_tick:1558811267014066366>",
        tick: "<:harm_tick:1558811267014066366>",
        tired: "<:tired:1483784332970688586>", // not in uploaded screenshots (kept from esh)
        warn: "<:harm_warn:1558811265097531412>",
        harm: "<:harmsdio:1556221836507742278>",
        dio: "<:harmsdio:1556221836507742278>",
        harmsdio: "<:harmsdio:1556221836507742278>",
        leftwing: "<a:leftwing:1555842838330089522>",
        rightwing: "<a:rightwing:1555842840607596624>",
        lockvc: "<:lockvc:1558818774772089003>",
        unlockvc: "<:unlockvc:1558818815226421308>",
        ghostvc: "<:ghostvc:1558818754664865842>",
        revealvc: "<:revealvc:1558818801930477709>",
        claimvc: "<:claimvc:1558818741213462529>",
        renamevc: "<:renamevc:1558818794728591512>",
        limitvc: "<:limitvc:1558818767893696608>",
        permitvc: "<:permitvc:1558818781382443101>",
        rejectvc: "<:rejectvc:1558818788332273754>",
        transfervc: "<:transfervc:1558818808351952898>",
        infovc: "<:infovc:1558818761405104218>",
        deletevc: "<:deletevc:1558818747769159680>",
        calendar: "<:calendar:1558818700457672778>",
        idcard: "<:idcard:1558818721156567040>",
        card: "<a:card:1555845967381528586>",
        members: "<:entries:1558198887599050882>",
        channels: "<:channels:1558818707281547304>",
        roles: "<:roles:1558818727821185074>",
        coin: "<:coin:1558818714055479421>",
        crown: "<:gw_crown:1558198883883028621>",
        boost: "<:boost:1558818693629214760>",
        streak: "<:streak:1558818734582399007>",
        gift: "<:gift:1558198880296898630>",
        gw_gift: "<:gift:1558198880296898630>",
        gw_crown: "<:gw_crown:1558198883883028621>",
        entries: "<:entries:1558198887599050882>",
        gw_entries: "<:entries:1558198887599050882>",
        trophy: "<:trophy:1558198891248095366>",
        gw_trophy: "<:trophy:1558198891248095366>",
        cheers: "<:cheers:1558198895190741013>",
        gw_cheers: "<:cheers:1558198895190741013>",
        emb_builder: "<:harm_premium:1558810882795114536>",
        emb_json: "<a:card:1555845967381528586>",
        emb_msg: "<:channels:1558818707281547304>",
        emb_title: "<:renamevc:1558818794728591512>",
        emb_desc: "<:harm_desc:1559895590362419301>",
        emb_color: "<:coin:1558818714055479421>",
        emb_author: "<:idcard:1558818721156567040>",
        emb_images: "<:gift:1558198880296898630>",
        emb_footer: "<:calendar:1558818700457672778>",
        emb_fields: "<:roles:1558818727821185074>",
        emb_links: "<:harm_link:1559895592237400084>",
        emb_send: "<:transfervc:1558818808351952898>",
        emb_channel: "<:revealvc:1558818801930477709>",
        emb_save: "<:permitvc:1558818781382443101>",
        emb_remove: "<:deletevc:1558818747769159680>",
        emb_discard: "<:rejectvc:1558818788332273754>",
        harm_bell: "<:harm_bell:1559895594175172608>",
        harm_heart: "<:harm_heart:1559895595848695960>",
        harm_desc: "<:harm_desc:1559895590362419301>",
        harm_link: "<:harm_link:1559895592237400084>",
        harm_online: "<:harm_online:1560311716359708802>",
        harm_offline: "<:harm_offline:1560311718394208366>",
        harm_reset: "<:harm_reset:1560309029207679008>",
        harm_clown: "<:harm_clown:1560309025156108449>",
        harm_lock: "<:lockvc:1558818774772089003>",
        harm_unlock: "<:unlockvc:1558818815226421308>",
        harm_ring: "<:harm_ring:1560309021078982676>",
        harm_wand: "<:harm_wand:1560309018973442169>",
        harm_mail: "<:harm_mail:1560309035327291547>",
        harm_first: "<:harm_first:1560309039592636657>",
        harm_last: "<:harm_last:1560309041618755585>",
        harm_left: "<:harm_left:1560309043657052240>",
        harm_right: "<:harm_right:1560309045720649819>",
        harm_dots: "<:harm_dots:1560309047700357141>",
        // music custom emojis
        harm_play: "<:harm_play:1561738111204200488>",
        harm_pause: "<:harm_pause:1561738378662248468>",
        harm_skip: "<:harm_skip:1561738383171002409>",
        harm_prev: "<:harm_prev:1561738387868885234>",
        harm_stop: "<:harm_stop:1561738392608313475>",
        harm_loop: "<:harm_loop:1561738397318381678>",
        harm_shuffle: "<:harm_shuffle:1561738401965801572>",
        harm_disc: "<:harm_disc:1561738406403244033>",
        // games custom emojis
        harm_cross: "<:harm_cross:1561738411327627294>",
        harm_circle: "<:harm_circle:1561738416096288771>",
        harm_c4: "<:harm_c4:1561738420726796369>",
        harm_red: "<:harm_red:1561738425403441255>",
        harm_yellow: "<:harm_yellow:1561738430277484747>",
        harm_rock: "<:harm_rock:1561738434698281104>",
        harm_paper: "<:harm_paper:1561738439278461079>",
        harm_scissors: "<:harm_scissors:1561738444206645431>",
        harm_trivia: "<:harm_trivia:1561738448728227872>",
        harm_bomb: "<:harm_bomb:1561738453505417256>",
        harm_pin: "<:harm_pin:1561780890751729695>",
        harm_dot: "<:harm_dot:1561780892962263153>",
        harm_chat: "<:harm_chat:1561780895038439606>",
        harm_voice: "<:harm_voice:1561780897198514206>"
    }
}

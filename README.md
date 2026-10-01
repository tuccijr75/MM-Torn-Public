# MM Torn Public Scripts

Public distribution repository for released Torn userscripts.

## City Find Navigator

Path: `scripts/city-find-navigator/`

Supports:
- Desktop userscript managers such as Tampermonkey
- TornPDA/mobile
- Manual City-map item locating and highlighting

Current release status: **v0.5.0 RC**.

The desktop/mobile interface and navigation have been verified. Live detection of a naturally spawned Torn City item is still awaiting final verification.

### Install

Direct userscript URL:

`https://raw.githubusercontent.com/tuccijr75/MM-Torn-Public/main/scripts/city-find-navigator/mm-city-find-navigator.user.js`

Desktop:
1. Install a userscript manager such as Tampermonkey.
2. Open the direct userscript URL.
3. Install/confirm the script.

TornPDA:
1. Enable custom user scripts.
2. Set injection time to **Start**.
3. Add the direct userscript URL in Manage Scripts.
4. Open Torn's City map.

### Updates

The userscript contains `@updateURL` and `@downloadURL` metadata pointing back to this repository.

For each release:
1. Update the full `.user.js` file.
2. Update `@version` in both the `.user.js` and `.meta.js` files.
3. Keep both version numbers identical.

### License

Proprietary. Redistribution or modification is not authorized unless explicitly permitted by the author.

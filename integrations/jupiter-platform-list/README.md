# Jupiter platform list (Sonar Watch successor)

Sonar Watch's open plugin repository is gone; Jupiter Portfolio now reads platform metadata from
https://github.com/jup-ag/platform-list. To list Caged:

1. Fork that repo, copy `caged.ts` to `src/platforms/caged.ts` and `caged.webp` to `img/caged.webp` (400x400).
2. `npm install && npm run format && npm run build:index && npm test`
3. Open a PR titled `feat: add caged`.

Position reading (locked balances per wallet) is done by Jupiter's closed fetchers; after the
platform PR is merged, ask the Jupiter Portfolio team to add a fetcher using
`docs/INTEGRATION.md` (Lock account layout, program id, public API).

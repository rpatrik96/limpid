<!-- Keep it short. Explain the why, not just the what. -->

## Summary

<!-- What does this change and why? Link any related issue (Closes #N). -->

## How tested

<!-- Commands run, surfaces exercised (extension / CLI), providers checked. -->

- [ ] `npm run coverage` (tests pass)
- [ ] `npm run typecheck`
- [ ] `npm run lint` and `npm run format:check`
- [ ] `npm run build`

## Checklist

- [ ] Tests added or updated for the change
- [ ] Lint and formatting pass locally
- [ ] Docs updated (README / DESIGN / rules) where behavior changed
- [ ] Pure packages (`@coach/{contract,engine,latex,rubric}`) stayed pure — no vscode/network/fs leaked in

# Agents.md

## Documentation

When adding features, add a one-liner to the readme.

## Testing

Always test the results.

For new features, you should add new tests and ensure the existing ones pass.

For bug fixes, you should ensure existing tests pass.
It might be a good idea to add a test to cover the bug as well, to catch regressions in the future.

When new mandatory environment variables are added, ensure that CI runs apply a suitable placeholder value so that the tests running in CI will work.

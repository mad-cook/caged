#!/usr/bin/env bash
# Builds the program + IDL on this machine and syncs the IDL into web/.
#
# Why the env vars: the `anchor` on PATH is 0.29, so we use avm's 0.30.1.
# Anchor 0.30.1 generates the IDL with `cargo +nightly`, and current nightlies
# removed an API its IDL builder needs, so we point it at an old nightly.
set -euo pipefail
cd "$(dirname "$0")"
export PATH="$HOME/.avm/bin:$PATH"
export RUSTUP_TOOLCHAIN="${RUSTUP_TOOLCHAIN:-nightly-2024-01-30}"
anchor build "$@"
node scripts/sync-idl.js

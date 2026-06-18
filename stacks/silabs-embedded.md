# silabs-embedded — Stack Hat

> Catalog entry for the `silabs-embedded` stack (Silicon Labs SiWx91x / EFR32 embedded C
> firmware, Simplicity Studio + GNU ARM). Drafted by project-setup Phase 4 net-new on-ramp.

## Tooling

- **MCPs:** none specific to embedded C (use the codebase-memory-mcp graph already indexed for the repo).
- **CLI tools:**
  - `clang-format` — formatter (Google style; matches the repo's formatter.org Google convention).
    Install: `choco install llvm` / `winget install LLVM.LLVM` / `apt install clang-format`.
    Run: `clang-format -i <files>` (CI: `--dry-run --Werror`).
  - `cppcheck` — C/C++ static analysis with a MISRA addon (repo mandates MISRA compliance).
    Install: `choco install cppcheck` / `winget install Cppcheck.Cppcheck` / `apt install cppcheck`.
    Run: `cppcheck --enable=warning,style --addon=misra woosh/`.
  - `clang-tidy` — clang-based linter for bug-prone patterns (ships with LLVM).
    Install: `choco install llvm` / `winget install LLVM.LLVM` / `apt install clang-tidy`.
    Run: `clang-tidy <file> -- <compile-flags>`.
- **VSCode extensions:** `ms-vscode.cpptools`, `ms-vscode.cpptools-extension-pack`, `xaver.clang-format`.

## Hat

- Embedded C for the SiWG917 (Cortex-M4 + dual-radio). Builds run ONLY in Simplicity Studio — no host build/test; validate on-target (HIL) over debug UART + AWS IoT console.
- MISRA C compliance required: avoid `atoi`/`atol` — use the repo's `utils_str_to_u32()` APIs. Run `cppcheck --addon=misra` before commits.
- Prefer STATIC allocation over dynamic (FreeRTOS Heap-4, ~40 KB total). Always null-check `cJSON` allocations; prefer `snprintf` into static buffers over building JSON via cJSON.
- One shared global MQTT TX buffer is reused for telemetry/shadow/OTA — never assume two payloads coexist.
- Format with `clang-format` (Google, 2-space, 180-col) before every commit; build with `-Wall -Werror`.
- Never hand-edit `autogen/` (Simplicity-Studio-generated) or vendored `wiseconnect3_sdk_*/`, `cjson/`.
- Inter-task comms use FreeRTOS `osEventFlags` (`gAppFlags`); post events through the app_sm state machine — don't call across layers.
- A patched SDK file is required to build (`sli_si91x_power_manager_wakeup_initialization.c`) — see `readme/`.

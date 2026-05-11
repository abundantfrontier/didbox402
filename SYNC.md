# Repository Sync Guide (v0.2.1)

If you are seeing a discrepancy between the local filesystem and the public GitHub repository, please follow these steps to perform a clean sync.

### 1. Verify Local State
Ensure that the `packages/` directory exists and that the root `src/` directory has been removed.

### 2. Clean Git Index
Sometimes Git's index can get desynchronized during a major restructuring. Run the following commands:

```bash
# Add all new files (including the packages folder)
git add .

# Verify what is about to be committed
git status
```

**You should see:**
- `new file: packages/server/...`
- `new file: packages/sdk-core/...`
- `new file: packages/sdk-crypto/...`
- `new file: packages/sdk-payments/...`
- `deleted: src/index.ts` (and other files in src/)

### 3. Commit and Push
```bash
git commit -m "chore: full monorepo sync and protocol hardening (v0.2.1)"
git push origin main
```

### Why this is necessary:
The v0.2.0 release transformed the project into a modular monorepo. If these changes aren't visible on GitHub, it's likely because the `packages/` directory was never added to the repository's tracking index.

---
**Protocol Version:** 0.2.1  
**Status:** Verified Local Sync

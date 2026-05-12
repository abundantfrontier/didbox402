# Contributing to didbox402

Thank you for your interest in contributing to **didbox402**! We welcome contributions from the community to help make agent-native storage more secure, accessible, and interoperable.

## Getting Started

### 1. Set Up the Development Environment
```bash
git clone https://github.com/adaptivefrontier/didbox402.git
cd didbox402
npm install
```

### 2. Run Tests
We use Vitest for testing across the monorepo.
```bash
# Run all tests
npm test --workspaces

# Run specific package tests
npm test --workspace=@didbox/server
```

### 3. Run the Conformance Suite
Verify the protocol integrity of the reference implementation:
```bash
cd packages/server
npx vitest run src/server
```

## Contribution Guidelines

### Pull Requests
1.  **Branching:** Create a feature branch for your changes (`git checkout -b feat/your-feature`).
2.  **Tests:** Ensure all existing tests pass and add new tests for any new features or bug fixes.
3.  **Documentation:** Update relevant documentation (`docs/`, `PROTOCOL.md`) if your changes affect the protocol or implementation.
4.  **Commits:** Use clear, descriptive commit messages (following conventional commits if possible).

### Code Style
- We follow standard TypeScript best practices.
- Ensure your code is linted and formatted before submitting.

### Security
If you find a security vulnerability, please do NOT open a public issue. Instead, email security@adaptivefrontier.org.

## Community Standards
Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md).

---
Built with ❤️ at [adaptivefrontier.org](https://adaptivefrontier.org).

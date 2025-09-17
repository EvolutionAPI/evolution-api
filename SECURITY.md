# Security Policy

## Supported Versions

We actively support the following versions of Evolution API with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 2.3.x   | ✅ Yes             |
| 2.2.x   | ✅ Yes             |
| 2.1.x   | ⚠️ Critical fixes only |
| < 2.1   | ❌ No              |

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security vulnerability in Evolution API, please help us by reporting it responsibly.

### 🔒 Private Disclosure Process

**Please DO NOT create a public GitHub issue for security vulnerabilities.**

Instead, please report security vulnerabilities via email to:

**📧 contato@evolution-api.com**

### 📋 What to Include

When reporting a vulnerability, please include:

- **Description**: A clear description of the vulnerability
- **Impact**: What an attacker could achieve by exploiting this vulnerability
- **Steps to Reproduce**: Detailed steps to reproduce the issue
- **Proof of Concept**: If possible, include a minimal proof of concept
- **Environment**: Version of Evolution API, OS, Node.js version, etc.
- **Suggested Fix**: If you have ideas for how to fix the issue

### 🕐 Response Timeline

We will acknowledge receipt of your vulnerability report within **48 hours** and will send you regular updates about our progress.

- **Initial Response**: Within 48 hours
- **Status Update**: Within 7 days
- **Resolution Timeline**: Varies based on complexity, typically 30-90 days

### 🎯 Scope

This security policy applies to:

- Evolution API core application
- Official Docker images
- Documentation that could lead to security issues

### 🚫 Out of Scope

The following are generally considered out of scope:

- Third-party integrations (Chatwoot, Typebot, etc.) - please report to respective projects
- Issues in dependencies - please report to the dependency maintainers
- Social engineering attacks
- Physical attacks
- Denial of Service attacks

### 🏆 Recognition

We believe in recognizing security researchers who help us keep Evolution API secure:

- We will acknowledge your contribution in our security advisories (unless you prefer to remain anonymous)
- For significant vulnerabilities, we may feature you in our Hall of Fame
- We will work with you on coordinated disclosure timing

### 📚 Security Best Practices

For users deploying Evolution API:

- Always use the latest supported version
- Keep your dependencies up to date
- Use strong authentication methods
- Implement proper network security
- Monitor your logs for suspicious activity
- Follow the principle of least privilege

### 🔄 Security Updates

Security updates will be:

- Released as patch versions (e.g., 2.3.1 → 2.3.2)
- Documented in our [CHANGELOG.md](./CHANGELOG.md)
- Announced in our community channels
- Tagged with security labels in GitHub releases

## Contact

For any questions about this security policy, please contact:

- **Email**: contato@evolution-api.com

---

Thank you for helping keep Evolution API and our community safe! 🛡️

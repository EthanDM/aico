# Contributing to AICO

We love your input! We want to make contributing to AICO as easy and transparent as possible, whether it's:

- Reporting a bug
- Discussing the current state of the code
- Submitting a fix
- Proposing new features
- Becoming a maintainer

## Development Process

We use GitHub to host code, to track issues and feature requests, as well as accept pull requests.

1. Fork the repo and create your branch from `main`
2. If you've added code that should be tested, add tests
3. If you've changed APIs, update the documentation
4. Ensure the test suite passes
5. Make sure your code lints
6. Issue that pull request!

## Local Development Setup

1. Clone your fork:

   ```bash
   git clone https://github.com/EthanDM/aico.git
   cd aico
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Build the project:

   ```bash
   npm run build
   ```

4. Create a local link:

   ```bash
   chmod +x dist/cli.js
   npm link
   ```

5. Set up your OpenAI API key:
   ```bash
   export OPENAI_KEY=your_api_key_here
   # or
   aico --set-api-key your_api_key_here
   ```

## Testing

Run the test suite:

```bash
npm test
```

Run linting:

```bash
npm run lint
```

## Pull Request Process

1. Update the README.md with details of changes to the interface
2. Update the version number in package.json following [SemVer](http://semver.org/)
3. Your PR will be merged once you have the sign-off of at least one maintainer

## Any contributions you make will be under the MIT Software License

In short, when you submit code changes, your submissions are understood to be under the same [MIT License](http://choosealicense.com/licenses/mit/) that covers the project. Feel free to contact the maintainers if that's a concern.

## Report bugs using GitHub's [issue tracker](https://github.com/EthanDM/aico/issues)

We use GitHub issues to track public bugs. Report a bug by [opening a new issue](https://github.com/EthanDM/aico/issues/new); it's that easy!

## Write bug reports with detail, background, and sample code

**Great Bug Reports** tend to have:

- A quick summary and/or background
- Steps to reproduce
  - Be specific!
  - Give sample code if you can
- What you expected would happen
- What actually happens
- Notes (possibly including why you think this might be happening, or stuff you tried that didn't work)

## License

By contributing, you agree that your contributions will be licensed under its MIT License.

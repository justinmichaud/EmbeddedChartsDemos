
  # Stock Chart Viewer

This app has a few goals:

- Have a bunch of pretty charts that update fast
- Don't leak memory
- Have a very "average" architecutre, doing everything in a generic and popular way

I also wanted to fill up this project with a decent amount of code to make it more realistic, and I have basically no frontend development experience. Hence I vibe-coded this; below are some prompts to help detect memory usage.

Development:

```
sudo apt install npm
mkdir -p ~/.npm-global
npm install -g pnpm --prefix ~/.npm-global
~/.npm-global/bin/pnpm install
~/.npm-global/bin/pnpm dev
```

Memory test (helpful to build WebKit with memory logging):
```
~/.npm-global/bin/pnpm build
~/.npm-global/bin/pnpm dlx serve dist
```
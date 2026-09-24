# Lucien Mollard - Personal Website

[![CI](https://github.com/LucienMLD/LucienMLD.github.io/actions/workflows/ci.yml/badge.svg)](https://github.com/LucienMLD/LucienMLD.github.io/actions/workflows/ci.yml)
[![Deploy to GitHub Pages](https://github.com/LucienMLD/LucienMLD.github.io/actions/workflows/deploy.yml/badge.svg)](https://github.com/LucienMLD/LucienMLD.github.io/actions/workflows/deploy.yml)
[![Jekyll](https://img.shields.io/badge/Jekyll-4.4+-CC0000?logo=jekyll)](https://jekyllrb.com)
[![RGAA Compliant](https://img.shields.io/badge/RGAA-Compliant-green)](https://accessibilite.numerique.gouv.fr/)

**[lucien-mollard.com](https://lucien-mollard.com)**

## About Me

I'm a Senior Ruby on Rails Developer transitioning to cybersecurity engineering, with 9 years of experience in building secure applications. Currently expanding my expertise in cybersecurity and preparing for the CNAM Cybersecurity Engineering program while specializing in application security, vulnerability assessment, and secure development practices.

### Expertise

- **Application Security**: Rails security, OWASP Top 10, secure coding practices
- **Backend Development**: Ruby on Rails, PostgreSQL, Redis
- **Security Frameworks**: ANSSI compliance, security audits, vulnerability assessment
- **Programming Languages**: Ruby (expert), Python (learning), Java (learning)
- **Leadership**: Technical mentoring, code reviews, architecture decisions

## Current Focus

- **Cybersecurity Transition**: Preparing for CNAM Cybersecurity Engineering program
- **Security Research**: Rails security best practices, OWASP Top 10, vulnerability analysis
- **Multi-language Learning**: Expanding skills in Python and Java for security applications

## Tech Stack

![Ruby](https://img.shields.io/badge/Ruby-CC342D?logo=ruby&logoColor=white)
![Rails](https://img.shields.io/badge/Rails-CC0000?logo=ruby-on-rails&logoColor=white)
![Python](https://img.shields.io/badge/Python-3776AB?logo=python&logoColor=white)
![Java](https://img.shields.io/badge/Java-ED8B00?logo=openjdk&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black)

## Brakeman Report Visualizer

[lucien-mollard.com/brakeman-visualizer](https://lucien-mollard.com/brakeman-visualizer/) is a 100% client-side dashboard to triage Brakeman reports: compare two scans, mark false positives, set a severity and export `config/brakeman.ignore`.

- `assets/js/brakeman-core.js`: pure logic (parsing, comparison, filters, sorting, score, ignore file), no DOM
- `assets/js/brakeman.js`: rendering and interactions
- `tests/brakeman-core.test.js`: unit tests on real Brakeman 8 reports, `npm test` (Node 22+)
- `tests/e2e/`: Playwright browser tests with an axe-core WCAG 2.1 AA audit, run in CI on the built site. Locally: `npm ci && npx playwright install chromium && bundle exec jekyll build && npm run test:e2e`

## Contact

- **Email**: hello [at] lucien-mollard [dot] com
- **LinkedIn**: [lucien-mollard](https://www.linkedin.com/in/lucien-mollard/)
- **GitHub**: [@LucienMLD](https://github.com/LucienMLD)

---

Built with [Jekyll](https://jekyllrb.com)

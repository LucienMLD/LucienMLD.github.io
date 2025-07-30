# Lucien Mollard - Personal Website

[![Deploy to GitHub Pages](https://github.com/LucienMLD/personal-website/actions/workflows/deploy.yml/badge.svg)](https://github.com/LucienMLD/personal-website/actions/workflows/deploy.yml)

Personal website of Lucien Mollard, a web developer with 9 years of experience specializing in secure and accessible web applications.

🌐 **Live site**: [lucien-mollard.com](https://lucien-mollard.com)

## About

This is my personal website showcasing my professional experience, training, and technical expertise. Built with Jekyll and featuring a custom theme with dark/light mode switching.

## Tech Stack

- **Static Site Generator**: Jekyll 4.3+
- **Theme**: [jekyll-theme-neon](https://github.com/LucienMLD/jekyll-theme-neon)
- **CSS Framework**: Foundation 6.8.1
- **Icons**: RemixIcon
- **Hosting**: GitHub Pages
- **Analytics**: Simple Analytics (privacy-first)

## Features

- 🌓 Dark/light theme switching with system preference detection
- ♿ RGAA accessibility compliant
- 📱 Fully responsive design
- 🚀 Fast loading with optimized assets
- 🔍 SEO optimized
- 📊 Privacy-first analytics
- 🌱 Carbon offset widget integration

## Development

### Prerequisites

- Ruby 3.0+
- Bundler 2.0+

### Local Setup

```bash
# Clone the repository
git clone https://github.com/LucienMLD/personal-website.git
cd personal-website

# Install dependencies
bundle install

# Serve locally (http://localhost:4000)
bundle exec jekyll serve

# Build for production
bundle exec jekyll build
```

### Development Commands

```bash
# Serve with live reload
bundle exec jekyll serve --livereload

# Build with environment
JEKYLL_ENV=production bundle exec jekyll build

# Clean build directory
bundle exec jekyll clean
```

## Project Structure

```
├── collections/           # Content collections
│   ├── _experiences/     # Professional experiences
│   ├── _trainings/       # Training and certifications
│   └── _posts/           # Blog posts
├── assets/
│   ├── images/           # Site images
│   ├── javascript/       # Custom JS
│   └── main.scss        # Main stylesheet
├── _includes/            # Partial templates
├── _layouts/             # Page layouts
├── _sass/                # Sass partials
├── _data/                # Site data (menus, etc.)
└── _config.yml          # Jekyll configuration
```

## Content Management

### Adding Experiences

Create a new file in `collections/_experiences/`:

```yaml
---
title: "Job Title"
company: "Company Name"
period: "Jan 2020 - Present"
location: "City, Country"
technologies: ["Ruby on Rails", "PostgreSQL"]
---

Job description here...
```

### Adding Training/Certifications

Create a new file in `collections/_trainings/`:

```yaml
---
title: "Training Title"
organization: "Training Provider"
date: "2023"
duration: "40h"
---

Training description...
```

### Writing Blog Posts

Create posts in `collections/_posts/` following Jekyll naming convention:

```
YEAR-MONTH-DAY-title.markdown
```

## Deployment

The site is automatically deployed to GitHub Pages when changes are pushed to the `main` branch.

### Manual Deployment

If using custom GitHub Actions deployment:

1. Ensure the workflow file exists in `.github/workflows/deploy.yml`
2. Set GitHub Pages source to "GitHub Actions" in repository settings
3. Push to main branch to trigger deployment

## Configuration

Key configuration options in `_config.yml`:

```yaml
# Site information
title: "Your Name"
email: "your@email.com"
description: "Your description"
url: "https://yourdomain.com"

# Collections
collections_dir: collections
collections:
  experiences:
    output: true
    permalink: /:collection/:name
  trainings:
    output: true
    permalink: /:collection/:name
```

## Contributing

This is a personal website, but feel free to:

- Report bugs or issues
- Suggest improvements
- Use as inspiration for your own site
- Contribute to the [jekyll-theme-neon](https://github.com/LucienMLD/jekyll-theme-neon) theme

## License

This project is open source and available under the [MIT License](LICENSE).

## Contact

- **Website**: [lucien-mollard.com](https://lucien-mollard.com)  
- **Email**: hello [at] lucien-mollard [dot] com
- **LinkedIn**: [lucien-mollard](https://www.linkedin.com/in/lucien-mollard/)
- **GitHub**: [@LucienMLD](https://github.com/LucienMLD)

---

Built with ❤️ using Jekyll and hosted on GitHub Pages.
---
layout: default
title: Brakeman Security Report Visualizer
permalink: /brakeman-visualizer/
description: A 100% client-side interactive dashboard to visualize, filter, and remediate Brakeman static analysis security reports for Ruby on Rails.
---

<link rel="stylesheet" href="{{ '/assets/css/brakeman.css' | relative_url }}">

<div class="brakeman-visualizer">
  <header class="tool-header">
    <h1>Brakeman Report Visualizer</h1>
    <p class="tool-subtitle">
      Inspect Brakeman scan reports directly in your browser. All analysis runs locally — no report data is sent to any server.
    </p>
  </header>

    <div id="dropzone" class="dropzone-container">
    <div class="dropzone-icon">
      <i class="ri-shield-keyhole-line" aria-hidden="true"></i>
    </div>
    <div class="dropzone-text">
      <h2>Drag & Drop your report</h2>
      <p>Or select your local <code>brakeman-report.json</code> or Brakeman output file.</p>
      <!-- Move input before label so adjacent sibling focus selectors work (A1 focus fix) -->
      <input type="file" id="file-input" class="sr-only" accept=".json">
      <div class="dropzone-actions">
        <label class="browse-btn" for="file-input">
          Browse File
        </label>
        <span class="dropzone-separator" aria-hidden="true">or</span>
        <button type="button" id="load-sample-btn" class="sample-btn">
          <i class="ri-flask-line" aria-hidden="true"></i> Load Sample Report
        </button>
      </div>
      <p class="dropzone-hint">No report at hand? The sample report lets you explore the dashboard right away.</p>
    </div>
  </div>

    <div id="error-block" class="error-message-block" role="alert" tabindex="-1">
    <i class="ri-error-warning-fill" aria-hidden="true"></i>
    <div class="error-content">
      <h3 id="error-title">Parsing Error</h3>
      <p id="error-desc">The file you uploaded is not a valid JSON. Please check that it is a standard Brakeman JSON output report.</p>
    </div>
  </div>

    <div id="dashboard" class="dashboard-view" tabindex="-1">
    <div class="dashboard-header">
      <div class="dashboard-title-group">
        <h2>Report Dashboard</h2>
        <span id="sample-badge" class="sample-badge" hidden>
          <i class="ri-flask-line" aria-hidden="true"></i>
          <span class="sr-only">Currently displaying the </span>Sample Report
        </span>
      </div>
      <div class="dashboard-actions">
        <button type="button" class="dashboard-sample-btn" id="dashboard-sample-btn">
          <i class="ri-flask-line" aria-hidden="true"></i> Load Sample Report
        </button>
        <button type="button" class="upload-another-btn" id="upload-another-btn">
          <i class="ri-upload-2-line" aria-hidden="true"></i> Upload Another Report
        </button>
      </div>
    </div>

    <div class="summary-grid">
      <!-- Total Warnings -->
      <div class="summary-card">
        <div class="card-icon-container icon-total">
          <i class="ri-alarm-warning-line" aria-hidden="true"></i>
        </div>
        <div class="card-details">
          <h3>Total Warnings</h3>
          <div class="value" id="val-total">0</div>
          <p class="card-note" id="val-total-note" hidden></p>
        </div>
      </div>

      <!-- High Confidence -->
      <div class="summary-card">
        <div class="card-icon-container icon-high">
          <i class="ri-error-warning-line" aria-hidden="true"></i>
        </div>
        <div class="card-details">
          <h3>High Confidence</h3>
          <div class="value value-high" id="val-high">0</div>
        </div>
      </div>

      <!-- Medium Confidence -->
      <div class="summary-card">
        <div class="card-icon-container icon-med">
          <i class="ri-alert-line" aria-hidden="true"></i>
        </div>
        <div class="card-details">
          <h3>Medium Confidence</h3>
          <div class="value value-med" id="val-med">0</div>
        </div>
      </div>

      <!-- Weak Confidence -->
      <div class="summary-card">
        <div class="card-icon-container icon-weak">
          <i class="ri-information-line" aria-hidden="true"></i>
        </div>
        <div class="card-details">
          <h3>Weak Confidence</h3>
          <div class="value value-weak" id="val-weak">0</div>
        </div>
      </div>

      <!-- Security Score -->
      <div class="summary-card score-card">
        <div class="score-details">
          <h3>Security Index</h3>
          <div class="value" id="val-grade">A+</div>
          <p id="val-score-label">Excellent posture</p>
          <p class="card-note" id="val-score-note" hidden></p>
        </div>
        <div class="score-gauge-container">
          <svg width="90" height="90" viewBox="0 0 90 90" aria-hidden="true">
            <circle class="score-ring-bg" cx="45" cy="45" r="38"></circle>
            <circle class="score-ring-val" id="score-ring" cx="45" cy="45" r="38" stroke-dasharray="238.76" stroke-dashoffset="0"></circle>
          </svg>
          <div class="score-ring-text" id="score-percent">100%</div>
        </div>
      </div>
    </div>

        <div class="meta-info-row">
      <div class="meta-item">
        <i class="ri-calendar-line" aria-hidden="true"></i>
        <span>Scan Date: <strong id="meta-date">N/A</strong></span>
      </div>
      <div class="meta-item">
        <i class="ri-code-line" aria-hidden="true"></i>
        <span>Rails: <strong id="meta-rails">N/A</strong></span>
      </div>
      <div class="meta-item">
        <i class="ri-terminal-box-line" aria-hidden="true"></i>
        <span>Brakeman: <strong id="meta-brakeman">N/A</strong></span>
      </div>
      <div class="meta-item">
        <i class="ri-time-line" aria-hidden="true"></i>
        <span>Duration: <strong id="meta-duration">N/A</strong></span>
      </div>
    </div>

        <div class="filter-toolbar">
      <div class="search-input-wrapper">
        <i class="ri-search-line" aria-hidden="true"></i>
        <label for="search-input" class="sr-only">Search vulnerabilities by type, file, message or code</label>
        <input type="text" id="search-input" class="search-bar" placeholder="Search by warning, file, or code...">
      </div>
      
      <div class="filter-group" role="group" aria-label="Filter warnings">
        <button class="filter-btn active" data-filter="all" aria-pressed="true">
          <i class="ri-apps-line" aria-hidden="true"></i> All
          <span class="filter-count">0</span>
        </button>
        <button class="filter-btn btn-high" data-filter="high" aria-pressed="false">
          <i class="ri-error-warning-fill" aria-hidden="true"></i> High
          <span class="filter-count">0</span>
        </button>
        <button class="filter-btn btn-med" data-filter="medium" aria-pressed="false">
          <i class="ri-alert-fill" aria-hidden="true"></i> Medium
          <span class="filter-count">0</span>
        </button>
        <button class="filter-btn btn-weak" data-filter="weak" aria-pressed="false">
          <i class="ri-information-fill" aria-hidden="true"></i> Weak
          <span class="filter-count">0</span>
        </button>
        <button class="filter-btn btn-ignored" data-filter="ignored" aria-pressed="false" hidden>
          <i class="ri-eye-off-fill" aria-hidden="true"></i> Ignored
          <span class="filter-count">0</span>
        </button>
      </div>
    </div>

        <div class="warnings-header-container">
      <h2 class="warnings-section-header-title">Identified Vulnerabilities</h2>
      <span class="counter" id="warning-count-badge" aria-live="polite">0 found</span>
    </div>

    <div id="warnings-list-container" class="warnings-list">
      <!-- Dynamic warnings loaded here -->
    </div>

        <div id="empty-state" class="empty-state" style="display:none;">
      <i class="ri-shield-check-line" aria-hidden="true"></i>
      <p>No vulnerabilities found matching your filter criteria.</p>
    </div>
  </div>

  <section class="bk-docs" aria-labelledby="docs-title">
    <h2 id="docs-title" class="bk-docs-title">Guide: Visualizing Brakeman Security Reports</h2>

    <nav class="bk-docs-toc" aria-labelledby="docs-toc-title">
      <p id="docs-toc-title" class="bk-docs-toc-title">On this page</p>
      <ul>
        <li><a href="#generate-report">How to generate a Brakeman JSON report</a></li>
        <li><a href="#privacy">100% client-side privacy guarantee</a></li>
        <li><a href="#confidence-levels">Confidence levels and Security Index</a></li>
        <li><a href="#vulnerabilities">Common Rails vulnerabilities detected</a></li>
        <li><a href="#faq">Frequently asked questions</a></li>
      </ul>
    </nav>

    <article class="bk-docs-card" aria-labelledby="generate-report">
      <h3 id="generate-report"><i class="ri-terminal-box-line" aria-hidden="true"></i> How to generate a Brakeman JSON report</h3>
      <p>
        <a href="https://brakemanscanner.org/" target="_blank" rel="noopener noreferrer">Brakeman<span class="sr-only"> (opens in new window)</span></a>
        is a static analysis security scanner for Ruby on Rails applications. It reads your source code without running it, so it can be used from the very first line of code.
      </p>
      <ol class="bk-docs-steps">
        <li>
          <p>Install the gem globally, or add it to the <code>development</code> group of your <code>Gemfile</code> (Rails 7.2+ applications ship with it by default):</p>
          <pre class="bk-docs-code"><code>gem install brakeman</code></pre>
        </li>
        <li>
          <p>From the root of your Rails application, run a scan and write the results to a JSON file. The format is inferred from the <code>.json</code> extension:</p>
          <pre class="bk-docs-code"><code>brakeman -o brakeman-report.json</code></pre>
        </li>
        <li>
          <p>Drop <code>brakeman-report.json</code> into the upload area above, or click <strong>Browse File</strong>.</p>
        </li>
      </ol>
      <p>Useful variants for CI pipelines and existing projects:</p>
      <pre class="bk-docs-code"><code># With Bundler, forcing the JSON format and a quiet output
bundle exec brakeman -q -f json -o brakeman-report.json

# Write the report without failing the build when warnings are found
brakeman -o brakeman-report.json --no-exit-on-warn

# Review warnings interactively and mute false positives in config/brakeman.ignore
brakeman -I</code></pre>
    </article>

    <article class="bk-docs-card" aria-labelledby="privacy">
      <h3 id="privacy"><i class="ri-lock-2-line" aria-hidden="true"></i> 100% client-side privacy guarantee</h3>
      <p>Security reports reveal file paths, code snippets and weaknesses of your application. They should never be shared with a third-party service. This visualizer was designed accordingly:</p>
      <ul class="bk-docs-list">
        <li><strong>Zero report data sent to any server:</strong> the file is read with the browser <code>FileReader</code> API and never uploaded, stored or logged.</li>
        <li><strong>All parsing happens locally:</strong> JSON parsing, scoring, filtering and remediation guidance run entirely in JavaScript on your device.</li>
        <li><strong>Nothing persists:</strong> the report is never written to cookies or local storage. Closing or reloading the tab clears it from memory.</li>
        <li><strong>Verifiable:</strong> once the page is loaded, you can disconnect from the network and the dashboard keeps working.</li>
      </ul>
    </article>

    <article class="bk-docs-card" aria-labelledby="confidence-levels">
      <h3 id="confidence-levels"><i class="ri-bar-chart-box-line" aria-hidden="true"></i> Understanding confidence levels and the Security Index</h3>
      <p>Brakeman assigns a <strong>confidence level</strong> to each warning. It expresses how certain Brakeman is that the warning is a real vulnerability, not how severe the vulnerability would be.</p>
      <dl class="bk-docs-definitions">
        <div>
          <dt><span class="warning-badge badge-high">High</span></dt>
          <dd>User input flows directly into a dangerous method, for example <code>params</code> interpolated into a SQL query. Treat it as a confirmed issue and fix it first.</dd>
        </div>
        <div>
          <dt><span class="warning-badge badge-med">Medium</span></dt>
          <dd>A dangerous pattern uses a value that is probably, but not certainly, user-controlled, such as a model attribute rendered without escaping. Review it carefully.</dd>
        </div>
        <div>
          <dt><span class="warning-badge badge-weak">Weak</span></dt>
          <dd>A risky construct was found but Brakeman could not link it to user input. It is often a false positive, yet still worth a quick review.</dd>
        </div>
      </dl>

      <h4>How the Security Index is calculated</h4>
      <p>The Security Index starts at 100 and deducts points for each <strong>active</strong> warning. Warnings muted in <code>config/brakeman.ignore</code> are listed but not scored, as they were reviewed by your team. The score never drops below 0.</p>
      <div class="bk-docs-table-wrapper">
        <table class="bk-docs-table">
          <caption>Points deducted per active warning</caption>
          <thead>
            <tr>
              <th scope="col">Confidence</th>
              <th scope="col">Deduction</th>
            </tr>
          </thead>
          <tbody>
            <tr><th scope="row">High</th><td>−10 points</td></tr>
            <tr><th scope="row">Medium</th><td>−4 points</td></tr>
            <tr><th scope="row">Weak</th><td>−1 point</td></tr>
          </tbody>
        </table>
      </div>
      <div class="bk-docs-table-wrapper">
        <table class="bk-docs-table">
          <caption>Grades associated with the score</caption>
          <thead>
            <tr>
              <th scope="col">Score</th>
              <th scope="col">Grade</th>
              <th scope="col">Meaning</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>95 – 100</td><th scope="row">A+</th><td>Excellent posture</td></tr>
            <tr><td>90 – 94</td><th scope="row">A</th><td>Very secure</td></tr>
            <tr><td>80 – 89</td><th scope="row">B</th><td>Minor warnings</td></tr>
            <tr><td>70 – 79</td><th scope="row">C</th><td>Action required</td></tr>
            <tr><td>50 – 69</td><th scope="row">D</th><td>Vulnerable profile</td></tr>
            <tr><td>0 – 49</td><th scope="row">F</th><td>Critical issues present</td></tr>
          </tbody>
        </table>
      </div>
    </article>

    <article class="bk-docs-card" aria-labelledby="vulnerabilities">
      <h3 id="vulnerabilities"><i class="ri-bug-line" aria-hidden="true"></i> Common Rails vulnerabilities detected by Brakeman</h3>
      <div class="bk-docs-grid">
        <div class="bk-docs-vuln">
          <h4>SQL Injection</h4>
          <p>User input interpolated into ActiveRecord query strings, like <code>where("name = '#{params[:name]}'")</code>. Use hash conditions or <code>?</code> placeholders instead.</p>
        </div>
        <div class="bk-docs-vuln">
          <h4>Remote Code Execution</h4>
          <p>User-controlled values passed to <code>eval</code>, <code>constantize</code> or unsafe deserialization, allowing attackers to run arbitrary Ruby code on the server.</p>
        </div>
        <div class="bk-docs-vuln">
          <h4>Mass Assignment</h4>
          <p>Request parameters assigned to models without Strong Parameters, or with <code>permit!</code>, letting attackers overwrite attributes they should not control.</p>
        </div>
        <div class="bk-docs-vuln">
          <h4>Cross-Site Scripting (XSS)</h4>
          <p>Unescaped output in views through <code>raw</code> or <code>html_safe</code>, enabling script injection into your users' browsers.</p>
        </div>
        <div class="bk-docs-vuln">
          <h4>Permitted Attributes</h4>
          <p>Sensitive keys such as <code>:admin</code>, <code>:role</code> or <code>:account_id</code> allowed in <code>permit</code> calls, which can lead to privilege escalation.</p>
        </div>
      </div>
      <p>Brakeman also detects command injection, open redirects, dynamic render paths, unsafe file access and many more. See the <a href="https://brakemanscanner.org/docs/warning_types/" target="_blank" rel="noopener noreferrer">full list of Brakeman warning types<span class="sr-only"> (opens in new window)</span></a>.</p>
    </article>

    <article class="bk-docs-card" aria-labelledby="faq">
      <h3 id="faq"><i class="ri-question-answer-line" aria-hidden="true"></i> Frequently asked questions</h3>
      <div class="bk-faq">
        <div class="bk-faq-item">
          <h4>Is my Brakeman report uploaded to a server?</h4>
          <p>No. The report is read and parsed entirely in your browser. No report data is sent to any server, stored or logged.</p>
        </div>
        <div class="bk-faq-item">
          <h4>Which Brakeman output format does the visualizer accept?</h4>
          <p>The visualizer accepts the standard Brakeman JSON report, generated with <code>brakeman -o brakeman-report.json</code> or <code>brakeman -f json</code>. The file must contain a <code>warnings</code> or <code>ignored_warnings</code> array.</p>
        </div>
        <div class="bk-faq-item">
          <h4>How are ignored warnings handled?</h4>
          <p>Warnings muted in <code>config/brakeman.ignore</code> appear under the Ignored filter with their justification note. They are excluded from the confidence counters and the Security Index.</p>
        </div>
        <div class="bk-faq-item">
          <h4>Is Brakeman confidence the same as severity?</h4>
          <p>No. Confidence indicates how likely a warning is to be a real issue. A Weak confidence SQL injection can still be critical if it turns out to be exploitable.</p>
        </div>
        <div class="bk-faq-item">
          <h4>Does a perfect Security Index mean my Rails application is secure?</h4>
          <p>No. Brakeman is a static analysis tool: it cannot detect business logic flaws, misconfigured infrastructure or vulnerable dependencies. Combine it with bundler-audit, code reviews and penetration testing.</p>
        </div>
        <div class="bk-faq-item">
          <h4>Can I try the dashboard without a report?</h4>
          <p>Yes. Click Load Sample Report to open a realistic example report with High, Medium and Weak confidence warnings, plus an ignored warning.</p>
        </div>
      </div>
    </article>
  </section>
</div>

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebApplication",
      "name": "Brakeman Report Visualizer",
      "url": {{ page.url | absolute_url | jsonify }},
      "description": {{ page.description | jsonify }},
      "applicationCategory": "DeveloperApplication",
      "operatingSystem": "Any",
      "browserRequirements": "Requires JavaScript",
      "isAccessibleForFree": true,
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "EUR"
      },
      "author": {
        "@type": "Person",
        "name": "Lucien Mollard",
        "url": {{ site.url | jsonify }}
      }
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Is my Brakeman report uploaded to a server?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "No. The report is read and parsed entirely in your browser. No report data is sent to any server, stored or logged."
          }
        },
        {
          "@type": "Question",
          "name": "Which Brakeman output format does the visualizer accept?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "The visualizer accepts the standard Brakeman JSON report, generated with brakeman -o brakeman-report.json or brakeman -f json. The file must contain a warnings or ignored_warnings array."
          }
        },
        {
          "@type": "Question",
          "name": "How are ignored warnings handled?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Warnings muted in config/brakeman.ignore appear under the Ignored filter with their justification note. They are excluded from the confidence counters and the Security Index."
          }
        },
        {
          "@type": "Question",
          "name": "Is Brakeman confidence the same as severity?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "No. Confidence indicates how likely a warning is to be a real issue. A Weak confidence SQL injection can still be critical if it turns out to be exploitable."
          }
        },
        {
          "@type": "Question",
          "name": "Does a perfect Security Index mean my Rails application is secure?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "No. Brakeman is a static analysis tool: it cannot detect business logic flaws, misconfigured infrastructure or vulnerable dependencies. Combine it with bundler-audit, code reviews and penetration testing."
          }
        },
        {
          "@type": "Question",
          "name": "Can I try the dashboard without a report?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes. Click Load Sample Report to open a realistic example report with High, Medium and Weak confidence warnings, plus an ignored warning."
          }
        }
      ]
    }
  ]
}
</script>

<script src="{{ '/assets/js/brakeman.js' | relative_url }}"></script>

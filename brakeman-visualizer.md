---
layout: default
title: Brakeman Security Report Visualizer
permalink: /brakeman-visualizer/
description: A 100% client-side dashboard to triage Brakeman security reports for Ruby on Rails. Compare two scans, track false positives and export config/brakeman.ignore.
---

<link rel="stylesheet" href="{{ '/assets/css/brakeman.css' | relative_url }}">

<div class="brakeman-visualizer">
  <header class="tool-header">
    <h1>Brakeman Report Visualizer</h1>
    <p class="tool-subtitle">
      Inspect Brakeman scan reports directly in your browser. All analysis runs locally — no report data is sent to any server.
    </p>
  </header>

  <!-- Polite live region announcing loaded reports to screen reader users -->
  <div id="dashboard-status" class="sr-only" role="status" aria-live="polite" aria-atomic="true"></div>

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

    <div id="dashboard" class="dashboard-view" tabindex="-1" role="region" aria-labelledby="dashboard-title">
    <div class="dashboard-header">
      <div class="dashboard-title-group">
        <h2 id="dashboard-title">Report Dashboard</h2>
        <span id="sample-badge" class="sample-badge" hidden>
          <i class="ri-flask-line" aria-hidden="true"></i>
          <span class="sr-only">Currently displaying the </span>Sample Report
        </span>
      </div>
      <div class="dashboard-actions">
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

    <div class="workflow-grid">
      <section class="workflow-card" aria-labelledby="compare-title">
        <h3 id="compare-title"><i class="ri-git-compare-line" aria-hidden="true"></i> Compare with a previous scan</h3>
        <div id="compare-empty">
          <p class="workflow-text">Load an older Brakeman report to see which warnings are new, fixed or unchanged. Warnings are matched by fingerprint, so code that only moved is not reported as new.</p>
          <div class="workflow-actions">
            <input type="file" id="baseline-input" class="sr-only" accept=".json">
            <label for="baseline-input" class="workflow-btn">
              <i class="ri-history-line" aria-hidden="true"></i> Load baseline report
            </label>
            <button type="button" id="sample-baseline-btn" class="workflow-btn workflow-btn-ghost" hidden>
              <i class="ri-flask-line" aria-hidden="true"></i> Use sample baseline
            </button>
          </div>
        </div>
        <div id="compare-result" hidden>
          <p class="workflow-text">Compared with the scan of <strong id="baseline-date">N/A</strong>.</p>
          <ul class="diff-stats">
            <li class="diff-stat diff-stat-new"><strong id="diff-new-count">0</strong> new</li>
            <li class="diff-stat diff-stat-fixed"><strong id="diff-fixed-count">0</strong> fixed</li>
            <li class="diff-stat"><strong id="diff-unchanged-count">0</strong> unchanged</li>
          </ul>
          <div class="workflow-actions">
            <button type="button" id="show-new-btn" class="workflow-btn">
              <i class="ri-focus-3-line" aria-hidden="true"></i> Show new warnings
            </button>
            <button type="button" id="remove-baseline-btn" class="workflow-btn workflow-btn-ghost">
              <i class="ri-close-line" aria-hidden="true"></i> Remove baseline
            </button>
          </div>
        </div>
        <p id="compare-error" class="workflow-error" role="alert"></p>
      </section>

      <section class="workflow-card" aria-labelledby="triage-title">
        <h3 id="triage-title"><i class="ri-checkbox-multiple-line" aria-hidden="true"></i> Triage and brakeman.ignore</h3>
        <p class="workflow-text" id="triage-progress-text">0 of 0 active warnings triaged</p>
        <div class="triage-progress-track" aria-hidden="true">
          <div class="triage-progress-fill" id="triage-progress-fill"></div>
        </div>
        <p class="workflow-text workflow-muted" id="triage-storage-note"></p>
        <div class="workflow-actions">
          <button type="button" id="export-ignore-btn" class="workflow-btn">
            <i class="ri-download-2-line" aria-hidden="true"></i> Export brakeman.ignore
          </button>
          <input type="file" id="ignore-input" class="sr-only" accept=".ignore,.json">
          <label for="ignore-input" class="workflow-btn workflow-btn-ghost">
            <i class="ri-file-upload-line" aria-hidden="true"></i> Load current brakeman.ignore
          </label>
          <button type="button" id="clear-triage-btn" class="workflow-btn workflow-btn-ghost">
            <i class="ri-refresh-line" aria-hidden="true"></i> Reset triage
          </button>
        </div>
        <p class="workflow-text workflow-muted" id="export-hint"></p>
        <p id="ignore-error" class="workflow-error" role="alert"></p>
      </section>

      <section class="workflow-card" aria-labelledby="code-links-title">
        <h3 id="code-links-title"><i class="ri-links-line" aria-hidden="true"></i> Links to your code</h3>
        <p class="workflow-text">Open each warning's file at the right line, in your editor or on your repository.</p>
        <div class="workflow-fields">
          <div class="workflow-field">
            <label for="code-link-mode">Open files in</label>
            <select id="code-link-mode">
              <option value="none">No links</option>
              <option value="vscode">VS Code (local clone)</option>
              <option value="web">GitHub / GitLab (web)</option>
            </select>
          </div>
          <div class="workflow-field workflow-field-grow" id="code-link-root-field" hidden>
            <label for="code-link-root" id="code-link-root-label">Project path</label>
            <input type="text" id="code-link-root" autocomplete="off" spellcheck="false" aria-describedby="code-link-root-hint">
            <p class="workflow-text workflow-muted" id="code-link-root-hint"></p>
          </div>
        </div>
        <p id="code-link-error" class="workflow-error" role="alert"></p>
      </section>
    </div>

        <div class="filter-toolbar">
      <div class="search-input-wrapper">
        <i class="ri-search-line" aria-hidden="true"></i>
        <label for="search-input" class="sr-only">Search warnings by type, file, code, method, user input, CWE or note</label>
        <input type="text" id="search-input" class="search-bar" placeholder="Search by warning, file, method, CWE...">
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

      <div class="filter-selects">
        <div class="filter-select">
          <label for="type-filter">Type</label>
          <select id="type-filter">
            <option value="all">All types</option>
          </select>
        </div>
        <div class="filter-select">
          <label for="folder-filter">Folder</label>
          <select id="folder-filter">
            <option value="all">All folders</option>
          </select>
        </div>
        <div class="filter-select">
          <label for="triage-filter">Triage</label>
          <select id="triage-filter">
            <option value="all">All statuses</option>
            <option value="untriaged">Untriaged</option>
            <option value="to_fix">To fix</option>
            <option value="false_positive">False positive</option>
            <option value="accepted_risk">Accepted risk</option>
          </select>
        </div>
        <div class="filter-select" id="diff-filter-wrapper" hidden>
          <label for="diff-filter">Changes</label>
          <select id="diff-filter">
            <option value="current">All current warnings</option>
            <option value="new">New</option>
            <option value="unchanged">Unchanged</option>
            <option value="fixed">Fixed</option>
          </select>
        </div>
        <div class="filter-select">
          <label for="sort-order">Sort by</label>
          <select id="sort-order">
            <option value="report">Report order</option>
            <option value="severity">Severity</option>
            <option value="file">File and line</option>
            <option value="type">Warning type</option>
          </select>
        </div>
      </div>
    </div>

        <div class="warnings-header-container">
      <h2 class="warnings-section-header-title">Identified Vulnerabilities</h2>
      <span class="counter" id="warning-count-badge" aria-live="polite">0 found</span>
    </div>
    <p class="keyboard-hint" id="keyboard-hint">
      <i class="ri-keyboard-line" aria-hidden="true"></i>
      When a warning title has focus, press <kbd>J</kbd> / <kbd>K</kbd> or <kbd>↓</kbd> / <kbd>↑</kbd> to move to the next or previous warning.
    </p>

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
        <li><a href="#workflow">Compare scans and triage warnings</a></li>
        <li><a href="#privacy">100% client-side privacy guarantee</a></li>
        <li><a href="#confidence-levels">Confidence levels and Security Index</a></li>
        <li><a href="#vulnerabilities">Common Rails vulnerabilities detected</a></li>
        <li><a href="#faq">Frequently asked questions</a></li>
      </ul>
    </nav>

    <article class="bk-docs-card" aria-labelledby="generate-report">
      <h3 id="generate-report"><i class="ri-terminal-box-line" aria-hidden="true"></i> How to generate a Brakeman JSON report</h3>
      <p>
        <a href="https://brakemanscanner.org/" target="_blank" rel="noopener noreferrer">Brakeman <i class="ri-external-link-line" aria-hidden="true"></i><span class="sr-only"> (opens in new window)</span></a>
        is a static analysis security scanner for Ruby on Rails applications. It reads your source code without running it, so it can be used from the very first line of code.
      </p>
      <ol class="bk-docs-steps">
        <li>
          <p>Install the gem globally, or add it to the <code>development</code> group of your <code>Gemfile</code> (Rails 7.2+ applications ship with it by default):</p>
          <pre class="bk-docs-code" tabindex="0"><code>gem install brakeman</code></pre>
        </li>
        <li>
          <p>From the root of your Rails application, run a scan and write the results to a JSON file. The format is inferred from the <code>.json</code> extension:</p>
          <pre class="bk-docs-code" tabindex="0"><code>brakeman -o brakeman-report.json</code></pre>
        </li>
        <li>
          <p>Drop <code>brakeman-report.json</code> into the upload area above, or click <strong>Browse File</strong>.</p>
        </li>
      </ol>
      <p>Useful variants for CI pipelines and existing projects:</p>
      <pre class="bk-docs-code" tabindex="0"><code># With Bundler, forcing the JSON format and a quiet output
bundle exec brakeman -q -f json -o brakeman-report.json

# Write the report without failing the build when warnings are found
brakeman -o brakeman-report.json --no-exit-on-warn

# Review warnings interactively and mute false positives in config/brakeman.ignore
brakeman -I</code></pre>
    </article>

    <article class="bk-docs-card" aria-labelledby="workflow">
      <h3 id="workflow"><i class="ri-git-compare-line" aria-hidden="true"></i> Compare scans and triage warnings</h3>
      <p>The built-in <code>brakeman -o report.html</code> output is a static list. This dashboard adds the triage loop around it:</p>
      <ol class="bk-docs-steps">
        <li>
          <p><strong>Compare with a previous scan.</strong> Load the report of your <code>main</code> branch or of the last release as a baseline. Every warning is tagged <em>new</em>, <em>unchanged</em> or <em>fixed</em>. Brakeman fingerprints do not depend on line numbers, so code that only moved is not reported as new.</p>
          <pre class="bk-docs-code" tabindex="0"><code># On main
brakeman -q --no-exit-on-warn -o baseline.json
# On your branch
brakeman -q --no-exit-on-warn -o brakeman-report.json</code></pre>
        </li>
        <li>
          <p><strong>Triage each warning.</strong> Open a warning and set its status: <em>To fix</em>, <em>False positive</em> or <em>Accepted risk</em>, with a note explaining why, and its <em>severity</em> for your application. The location (<code>Controller#action</code>), the user input highlighted in the code snippet and the CWE / OWASP Top 10:2025 category help you decide. Set <strong>Links to your code</strong> to open each file at the right line in VS Code or on GitHub / GitLab.</p>
          <p>Narrow the list by type, folder or triage status and sort it by severity or by file. The filters are kept in the page address, so a view can be bookmarked; the part of the address holding them is never sent to any server.</p>
        </li>
        <li>
          <p><strong>Export <code>config/brakeman.ignore</code>.</strong> False positives and accepted risks are written in Brakeman's own ignore format, with your note as justification. Brakeman's JSON report does not include the notes of already ignored warnings, so load your current <code>config/brakeman.ignore</code> first: its entries and notes are kept as they are in the export.</p>
          <pre class="bk-docs-code" tabindex="0"><code># Replace the ignore file, review the diff, commit it
mv ~/Downloads/brakeman.ignore config/brakeman.ignore
git diff config/brakeman.ignore</code></pre>
        </li>
      </ol>
    </article>

    <article class="bk-docs-card" aria-labelledby="privacy">
      <h3 id="privacy"><i class="ri-lock-2-line" aria-hidden="true"></i> 100% client-side privacy guarantee</h3>
      <p>Security reports reveal file paths, code snippets and weaknesses of your application. Unlike hosted platforms, this visualizer has no backend, so you can use it on confidential client projects:</p>
      <ul class="bk-docs-list">
        <li><strong>Zero report data sent to any server:</strong> the file is read with the browser <code>FileReader</code> API and never uploaded, stored or logged.</li>
        <li><strong>All parsing happens locally:</strong> JSON parsing, scoring, filtering and remediation guidance run entirely in JavaScript on your device.</li>
        <li><strong>The report never persists:</strong> reports, baselines and ignore files are never written to cookies or browser storage. Closing or reloading the tab clears them from memory.</li>
        <li><strong>Only your triage decisions are kept, in this browser:</strong> the status, severity and note you give a warning are saved in local storage, keyed by the warning fingerprint (a hash computed by Brakeman). They are dropped once the warning appears in <code>config/brakeman.ignore</code>. Use <strong>Reset triage</strong> to delete them all. The code link setting (editor and project path or repository URL) is saved the same way.</li>
        <li><strong>Exports are generated locally:</strong> the <code>brakeman.ignore</code> file is built in JavaScript and downloaded straight from the page.</li>
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
      <p>The Security Index starts at 100 and deducts points for each <strong>active</strong> warning. Warnings muted in <code>config/brakeman.ignore</code> and warnings you triaged as <em>false positive</em> are listed but not scored. The score never drops below 0.</p>
      <p>Confidence is not severity: when you set a <strong>severity</strong> on a warning during triage, it replaces the confidence in the calculation.</p>
      <div class="bk-docs-table-wrapper" tabindex="0" role="region" aria-label="Scrollable table: points deducted per active warning">
        <table class="bk-docs-table">
          <caption>Points deducted per active warning</caption>
          <thead>
            <tr>
              <th scope="col">Severity set in triage</th>
              <th scope="col">Otherwise, Brakeman confidence</th>
              <th scope="col">Deduction</th>
            </tr>
          </thead>
          <tbody>
            <tr><th scope="row">Critical</th><td>—</td><td>−15 points</td></tr>
            <tr><th scope="row">High</th><td>High</td><td>−10 points</td></tr>
            <tr><th scope="row">Medium</th><td>Medium</td><td>−4 points</td></tr>
            <tr><th scope="row">Low</th><td>Weak</td><td>−1 point</td></tr>
          </tbody>
        </table>
      </div>
      <div class="bk-docs-table-wrapper" tabindex="0" role="region" aria-label="Scrollable table: grades associated with the score">
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
          <h4>Command Injection</h4>
          <p>User parameters passed to <code>system</code>, <code>exec</code>, <code>%x</code> or <code>Open3</code> without shell escaping, letting attackers run arbitrary operating system commands. Pass arguments as an array instead of a single string.</p>
        </div>
      </div>
      <p>Brakeman also detects open redirects, dynamic render paths, unsafe file access and many more. See the <a href="https://brakemanscanner.org/docs/warning_types/" target="_blank" rel="noopener noreferrer">full list of Brakeman warning types <i class="ri-external-link-line" aria-hidden="true"></i><span class="sr-only"> (opens in new window)</span></a>.</p>
    </article>

    <article class="bk-docs-card" aria-labelledby="faq">
      <h3 id="faq"><i class="ri-question-answer-line" aria-hidden="true"></i> Frequently asked questions</h3>
      <div class="bk-faq">
        {%- for item in site.data.brakeman_faq %}
        <div class="bk-faq-item">
          <h4>{{ item.question }}</h4>
          <p>{{ item.answer }}</p>
        </div>
        {%- endfor %}
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
      "author": { "@id": {{ '/' | absolute_url | append: '#person' | jsonify }} }
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {%- for item in site.data.brakeman_faq %}
        {
          "@type": "Question",
          "name": {{ item.question | jsonify }},
          "acceptedAnswer": {
            "@type": "Answer",
            "text": {{ item.answer | strip_html | jsonify }}
          }
        }{% unless forloop.last %},{% endunless %}
        {%- endfor %}
      ]
    }
  ]
}
</script>

<script src="{{ '/assets/js/brakeman-core.js' | relative_url }}"></script>
<script src="{{ '/assets/js/brakeman.js' | relative_url }}"></script>

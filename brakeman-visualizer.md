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
      <label class="browse-btn" for="file-input">
        Browse File
      </label>
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
      </div>
      <button class="upload-another-btn" id="upload-another-btn">
        <i class="ri-upload-2-line" aria-hidden="true"></i> Upload Another Report
      </button>
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
      
      <div class="filter-group">
        <button class="filter-btn active" data-filter="all" aria-pressed="true">
          <i class="ri-apps-line" aria-hidden="true"></i> All
        </button>
        <button class="filter-btn btn-high" data-filter="high" aria-pressed="false">
          <i class="ri-error-warning-fill" aria-hidden="true"></i> High
        </button>
        <button class="filter-btn btn-med" data-filter="medium" aria-pressed="false">
          <i class="ri-alert-fill" aria-hidden="true"></i> Medium
        </button>
        <button class="filter-btn btn-weak" data-filter="weak" aria-pressed="false">
          <i class="ri-information-fill" aria-hidden="true"></i> Weak
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
</div>

<script src="{{ '/assets/js/brakeman.js' | relative_url }}"></script>

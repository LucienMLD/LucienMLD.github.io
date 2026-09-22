---
layout: post
title: "Sorting Brakeman Reports Without Sending Code to the Cloud"
date: 2026-09-22
categories: [Security, Ruby on Rails]
tags: [rails, brakeman, security, static-analysis, code-review]
excerpt: "Why Brakeman confidence is not severity, how to handle noise in legacy Rails apps, and why static analysis reports belong on the client side."
author: "Lucien Mollard"
reading_time: "4 min"
---

Running Brakeman in continuous integration is standard practice across the Ruby on Rails ecosystem. On a mature codebase, however, raw CLI outputs can quickly become difficult to navigate. A single audit run may produce dozens of warnings spanning SQL injections, mass assignment, unescaped parameters, and dynamic render calls.

When working through an audit backlog, two issues routinely slow down triage: confusing warning confidence with actual exploitability, and handling the privacy risks of sharing raw security reports.

## Confidence Is Not Severity

The most common misconception when reviewing Brakeman output is treating confidence levels as an indicator of severity:

- **Confidence (High, Medium, Weak)** measures how certain Brakeman is that a given code path matches a vulnerability pattern without being guarded by sanitizers or validation logic.
- **Severity** measures the real-world impact on your application if the issue is exploited.

A `Weak` confidence finding on an unparameterized SQL fragment may still lead to critical remote data access if the surrounding method is reachable via a public controller. Conversely, a `High` confidence finding on a missing CSRF token check in an internal API endpoint already protected by mutual TLS and strict headers may carry a much lower operational risk.

Sorting findings strictly by confidence or ignoring `Weak` warnings wholesale leads to false senses of security. Triage requires inspecting the context, verifying parameters, and checking authorization gates.

## Managing Baseline Noise with brakeman.ignore

Teams often get overwhelmed when introducing Brakeman to a project with existing technical debt. Leaving dozens of known warnings unaddressed in CI creates alert fatigue, causing new, critical warnings to go unnoticed.

The standard solution is Brakeman's ignore configuration:

```bash
brakeman -I
```

This interactive tool guides you through existing findings, allowing you to annotate why specific warnings are false positives or accepted risks, storing them in `config/brakeman.ignore`.

When generating reports for review, exporting to JSON gives you the complete data set, including both active and ignored warnings:

```bash
brakeman -o brakeman-report.json
```

## Why Keep Report Analysis Client-Side?

Reviewing a raw JSON file or sharing standard HTML outputs across engineering teams is not always seamless. While online dashboards exist, uploading Brakeman reports to third-party web services presents serious security concerns.

A standard Brakeman JSON report contains:
- Relative file paths and folder structures.
- Controller, model, and view method names.
- Raw code snippets highlighting vulnerable parameters and database queries.
- Routing information and parameter names.

Uploading this information to a third-party server creates an unnecessary attack surface. Even if the service claims to discard uploads, transmitting application architecture details to external infrastructure goes against basic security hygiene.

## A Zero-Upload Visualizer

To solve this, I built a lightweight, interactive report viewer that runs entirely in your browser: the [Brakeman Security Report Visualizer](/brakeman-visualizer/).

Key characteristics of the tool:
- **Zero data transfer**: Files are parsed locally via the browser's FileReader API. No telemetry, no backend processing, and no server storage.
- **Fast filtering**: Filter findings instantly by confidence level, warning type, or search keywords across file paths and code snippets.
- **Ignored warnings visibility**: Keeps tracked exceptions visible with their original rationale while keeping them separated from active vulnerabilities.
- **Accessibility by default**: Compliant with WCAG / RGAA guidelines, featuring full keyboard navigation, high contrast, and screen reader announcements.
- **One-click demo**: If you do not have a report ready, a sample report is available directly in the interface to test the workflow.

If you maintain a Rails codebase and want an easy way to triage Brakeman JSON files without deploying extra infrastructure or exposing code snippets, feel free to try the [visualizer](/brakeman-visualizer/) and share your feedback.

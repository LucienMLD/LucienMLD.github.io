document.addEventListener('DOMContentLoaded', function() {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');
  const errorBlock = document.getElementById('error-block');
  const errorTitle = document.getElementById('error-title');
  const errorDesc = document.getElementById('error-desc');
  const dashboard = document.getElementById('dashboard');
  const searchInput = document.getElementById('search-input');
  const filterBtns = document.querySelectorAll('.filter-btn');
  const warningsListContainer = document.getElementById('warnings-list-container');
  const emptyState = document.getElementById('empty-state');
  const warningCountBadge = document.getElementById('warning-count-badge');
  const uploadAnotherBtn = document.getElementById('upload-another-btn');
  const loadSampleBtn = document.getElementById('load-sample-btn');
  const dashboardSampleBtn = document.getElementById('dashboard-sample-btn');
  const sampleBadge = document.getElementById('sample-badge');

  let reportData = null;
  let normalizedWarnings = [];
  let activeFilter = 'all';

  // Realistic Brakeman JSON output used by the "Load Sample Report" buttons.
  // It covers every confidence level plus a warning muted through config/brakeman.ignore.
  const SAMPLE_REPORT = {
    scan_info: {
      app_path: "/home/deploy/apps/storefront",
      rails_version: "7.1.3",
      security_warnings: 5,
      start_time: "2026-09-15T09:42:18+02:00",
      end_time: "2026-09-15T09:42:21+02:00",
      duration: 3.184215,
      checks_performed: ["BasicAuth", "CrossSiteScripting", "Execute", "PermitAttributes", "Redirect", "Render", "SQL", "UnsafeReflection"],
      number_of_controllers: 18,
      controllers: [],
      number_of_models: 12,
      models: [],
      number_of_templates: 64,
      templates: [],
      ruby_version: "3.3.0",
      brakeman_version: "7.0.0"
    },
    warnings: [
      {
        warning_type: "SQL Injection",
        warning_code: 0,
        fingerprint: "9c326ecfecb6243e7b642767df6691ac1e3587e9502195a891667dcbfb971854",
        check_name: "SQL",
        message: "Possible SQL injection",
        file: "app/controllers/orders_controller.rb",
        line: 14,
        link: "https://brakemanscanner.org/docs/warning_types/sql_injection/",
        code: "Order.where(\"status = '#{params[:status]}' AND user_id = #{current_user.id}\")",
        render_path: null,
        location: { type: "method", class: "OrdersController", method: "index" },
        user_input: "params[:status]",
        confidence: "High",
        cwe_id: [89]
      },
      {
        warning_type: "Remote Code Execution",
        warning_code: 24,
        fingerprint: "870dba17c81b7912a3b0fe757952ac6eccebe885604354041253d877b1de21cd",
        check_name: "UnsafeReflection",
        message: "Unsafe reflection method `constantize` called with parameter value",
        file: "app/controllers/reports_controller.rb",
        line: 27,
        link: "https://brakemanscanner.org/docs/warning_types/remote_code_execution/",
        code: "params[:report_type].constantize",
        render_path: null,
        location: { type: "method", class: "ReportsController", method: "export" },
        user_input: "params[:report_type]",
        confidence: "High",
        cwe_id: [470]
      },
      {
        warning_type: "Mass Assignment",
        warning_code: 105,
        fingerprint: "1f33c2350b2e22778b5afa21365abf14a64bfe3602fdcbebade9b812aa2d2e15",
        check_name: "PermitAttributes",
        message: "Potentially dangerous key allowed for mass assignment",
        file: "app/controllers/admin/users_controller.rb",
        line: 58,
        link: "https://brakemanscanner.org/docs/warning_types/mass_assignment/",
        code: "params.require(:user).permit(:name, :email, :admin)",
        render_path: null,
        location: { type: "method", class: "Admin::UsersController", method: "user_params" },
        user_input: ":admin",
        confidence: "Medium",
        cwe_id: [915]
      },
      {
        warning_type: "Cross-Site Scripting",
        warning_code: 2,
        fingerprint: "8bdc10979833032f8e782caad1077d4f955825ae8392e7e17b3595f938364b16",
        check_name: "CrossSiteScripting",
        message: "Unescaped model attribute",
        file: "app/views/reviews/_review.html.erb",
        line: 9,
        link: "https://brakemanscanner.org/docs/warning_types/cross_site_scripting",
        code: "raw(Review.find(params[:id]).body)",
        render_path: [{ type: "controller", class: "ReviewsController", method: "show", line: 12, file: "app/controllers/reviews_controller.rb", rendered: { name: "reviews/show", file: "app/views/reviews/show.html.erb" } }],
        location: { type: "template", template: "reviews/_review" },
        user_input: null,
        confidence: "Medium",
        cwe_id: [79]
      },
      {
        warning_type: "Dynamic Render Path",
        warning_code: 15,
        fingerprint: "d60b0b1637037c193c6b61f4c2e65bc69f550f58e1105c6a4554bf301bcf185d",
        check_name: "Render",
        message: "Render path contains parameter value",
        file: "app/controllers/pages_controller.rb",
        line: 6,
        link: "https://brakemanscanner.org/docs/warning_types/dynamic_render_path/",
        code: "render(action => \"pages/#{params[:page]}\", {})",
        render_path: null,
        location: { type: "method", class: "PagesController", method: "show" },
        user_input: "params[:page]",
        confidence: "Weak",
        cwe_id: [22]
      }
    ],
    ignored_warnings: [
      {
        warning_type: "Command Injection",
        warning_code: 14,
        fingerprint: "50ba3800e39ecb3e09e7557894ee67593262074bd8726e6e48f1c0659cdc8027",
        check_name: "Execute",
        message: "Possible command injection",
        file: "lib/tasks/backup.rake",
        line: 11,
        link: "https://brakemanscanner.org/docs/warning_types/command_injection/",
        code: "system(\"pg_dump #{ENV.fetch(\"DATABASE_NAME\")} > #{backup_path}\")",
        render_path: null,
        location: { type: "method", class: null, method: null },
        user_input: "ENV.fetch(\"DATABASE_NAME\")",
        confidence: "Medium",
        cwe_id: [77],
        note: "DATABASE_NAME and backup_path are set by the deployment pipeline and never come from user input. Reviewed by the security team."
      }
    ],
    errors: [],
    obsolete: []
  };

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, preventDefaults, false);
  });

  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

    ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, () => dropzone.classList.add('dragover'), false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, () => dropzone.classList.remove('dragover'), false);
  });

    dropzone.addEventListener('drop', handleDrop, false);
  fileInput.addEventListener('change', handleFileSelect, false);

  function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
      processFile(files[0]);
    }
  }

  function handleFileSelect(e) {
    const files = e.target.files;
    if (files.length > 0) {
      processFile(files[0]);
    }
  }

    dropzone.addEventListener('click', function(e) {
    // The sample button lives inside the dropzone and must not open the file dialog
    if (loadSampleBtn && loadSampleBtn.contains(e.target)) return;
    if (e.target !== fileInput && e.target.tagName !== 'LABEL') {
      fileInput.click();
    }
  });

  function loadSampleReport(e) {
    e.preventDefault();
    e.stopPropagation();
    hideError();
    searchInput.value = '';
    setActiveFilter('all');
    loadReport(JSON.parse(JSON.stringify(SAMPLE_REPORT)), true);
  }

  if (loadSampleBtn) loadSampleBtn.addEventListener('click', loadSampleReport);
  if (dashboardSampleBtn) dashboardSampleBtn.addEventListener('click', loadSampleReport);

  function setSampleMode(isSample) {
    if (sampleBadge) sampleBadge.hidden = !isSample;
    // Reloading the sample while it is displayed would be a no-op
    if (dashboardSampleBtn) dashboardSampleBtn.hidden = isSample;
  }

  // Clear/Reset button to go back to upload state
  if (uploadAnotherBtn) {
    uploadAnotherBtn.addEventListener('click', function() {
      reportData = null;
      normalizedWarnings = [];
      searchInput.value = '';
      setActiveFilter('all');
      setSampleMode(false);

      dashboard.style.display = 'none';
      dropzone.style.display = 'block';
      fileInput.value = ''; // Ensure same file can be selected again
      fileInput.focus();
    });
  }

  function showError(title, desc) {
    fileInput.value = '';
        if (errorTitle) errorTitle.textContent = title;
    if (errorDesc) errorDesc.textContent = desc;
    errorBlock.style.display = 'flex';
    dashboard.style.display = 'none';
    errorBlock.focus(); // Shift focus to the error block
  }

  function hideError() {
    errorBlock.style.display = 'none';
  }

  function processFile(file) {
    hideError();
    const reader = new FileReader();
    reader.onload = function(event) {
      try {
        const parsed = JSON.parse(event.target.result);
        
        // Strict validation of Brakeman output structure: a report may only contain
        // ignored warnings (muted through config/brakeman.ignore), so accept either array
        const isObject = parsed && typeof parsed === 'object' && !Array.isArray(parsed);
        if (!isObject || (!Array.isArray(parsed.warnings) && !Array.isArray(parsed.ignored_warnings))) {
          showError("Invalid File Format", "This file doesn't seem to be a valid Brakeman JSON report. It must contain a 'warnings' or 'ignored_warnings' array.");
          return;
        }

        loadReport(parsed, false);
      } catch (err) {
        showError("Invalid JSON", "Could not parse the file. Please check that it is a valid JSON file. Error: " + err.message);
      }
    };
    reader.onerror = function() {
      showError("Read Error", "An error occurred while reading the file.");
    };
    reader.readAsText(file);
  }

  function loadReport(parsed, isSample) {
    reportData = parsed;
    setSampleMode(isSample);
    normalizeReportData();
    renderDashboard();
  }

  // Strictly normalize all warning inputs on load to prevent rendering crashes
  function normalizeReportData() {
    if (!reportData) return;

    // Filter out any non-object entries first to be 100% robust
    const toRawList = list => (Array.isArray(list) ? list : []).filter(w => w && typeof w === 'object' && !Array.isArray(w));

    normalizedWarnings = [
      ...toRawList(reportData.warnings).map(w => normalizeWarning(w, false)),
      ...toRawList(reportData.ignored_warnings).map(w => normalizeWarning(w, true))
    ];
  }

  function normalizeWarning(w, isIgnored) {
    // Validate and cast all attributes safely, accounting for line 0
    const warning_type = (w.warning_type !== null && w.warning_type !== undefined) ? String(w.warning_type).trim() : 'Warning';
    const message = (w.message !== null && w.message !== undefined) ? String(w.message).trim() : 'No description provided';
    const file = (w.file !== null && w.file !== undefined) ? String(w.file).trim() : 'Unknown file';
    const line = (w.line !== null && w.line !== undefined) ? String(w.line).trim() : 'N/A';

    let code = null;
    if (w.code !== null && w.code !== undefined) {
      code = typeof w.code === 'object' ? JSON.stringify(w.code) : String(w.code).trim();
    }

    let confidence = 'weak';
    const rawConf = String(w.confidence || '').toLowerCase().trim();
    if (rawConf === 'high' || rawConf === 'medium' || rawConf === 'weak') {
      confidence = rawConf;
    }

    // Brakeman stores the justification written in brakeman.ignore under "note"
    const note = (isIgnored && w.note !== null && w.note !== undefined) ? String(w.note).trim() : '';

    return {
      warning_type,
      message,
      file,
      line,
      code,
      confidence,
      is_ignored: isIgnored,
      note,
      fingerprint: w.fingerprint ? String(w.fingerprint).trim() : ''
    };
  }

  // Calculate Security Score based on confidence of issues
  function calculateSecurityScore(warnings) {
    if (!warnings || warnings.length === 0) return { score: 100, grade: 'A+', label: 'Excellent security posture' };
    
        let totalDeductions = 0;
    warnings.forEach(w => {
      if (w.confidence === 'high') totalDeductions += 10;
      else if (w.confidence === 'medium') totalDeductions += 4;
      else totalDeductions += 1;
    });

    let score = 100 - totalDeductions;
    if (score < 0) score = 0;

    let grade = 'F';
    let label = 'Critical issues present';

    if (score >= 95) { grade = 'A+'; label = 'Excellent posture'; }
    else if (score >= 90) { grade = 'A'; label = 'Very secure'; }
    else if (score >= 80) { grade = 'B'; label = 'Minor warnings'; }
    else if (score >= 70) { grade = 'C'; label = 'Action required'; }
    else if (score >= 50) { grade = 'D'; label = 'Vulnerable profile'; }

    return { score, grade, label };
  }

  function renderDashboard() {
    if (!reportData) return;

    const scanInfo = reportData.scan_info || {};

    // Confidence counters and the Security Index only reflect active warnings:
    // ignored ones were reviewed and muted by the team in config/brakeman.ignore
    const activeWarnings = normalizedWarnings.filter(w => !w.is_ignored);
    const total = normalizedWarnings.length;
    const ignored = total - activeWarnings.length;
    const counts = { all: total, high: 0, medium: 0, weak: 0, ignored };

    activeWarnings.forEach(w => counts[w.confidence]++);

    document.getElementById('val-total').textContent = total;
    document.getElementById('val-high').textContent = counts.high;
    document.getElementById('val-med').textContent = counts.medium;
    document.getElementById('val-weak').textContent = counts.weak;

    const totalNote = document.getElementById('val-total-note');
    totalNote.textContent = `${activeWarnings.length} active · ${ignored} ignored`;
    totalNote.hidden = ignored === 0;

    filterBtns.forEach(btn => {
      const countEl = btn.querySelector('.filter-count');
      if (countEl) countEl.textContent = counts[btn.dataset.filter];
    });

    // Only offer the Ignored filter when the report actually contains ignored warnings
    const ignoredBtn = document.querySelector('.filter-btn[data-filter="ignored"]');
    if (ignoredBtn) ignoredBtn.hidden = ignored === 0;
    if (activeFilter === 'ignored' && ignored === 0) setActiveFilter('all');

    const rating = calculateSecurityScore(activeWarnings);
    document.getElementById('val-grade').textContent = rating.grade;
    document.getElementById('val-score-label').textContent = rating.label;
    document.getElementById('score-percent').textContent = rating.score + "%";

    const scoreNote = document.getElementById('val-score-note');
    scoreNote.textContent = `${ignored} ignored warning${ignored > 1 ? 's' : ''} not scored`;
    scoreNote.hidden = ignored === 0;

        const gradeEl = document.getElementById('val-grade');
    gradeEl.className = 'value'; // Reset classes
    if (rating.score >= 90) gradeEl.classList.add('value-weak'); // Green
    else if (rating.score >= 70) gradeEl.classList.add('value-med'); // Orange
    else gradeEl.classList.add('value-high'); // Red

        const circle = document.getElementById('score-ring');
    const radius = 38;
    const circumference = 2 * Math.PI * radius;
    const strokeOffset = circumference - (rating.score / 100) * circumference;
    circle.style.strokeDasharray = circumference;
    circle.style.strokeDashoffset = strokeOffset;
    
        document.getElementById('meta-date').textContent = formatDate(scanInfo.start_time || scanInfo.timestamp);
    document.getElementById('meta-rails').textContent = typeof scanInfo.rails_version === 'object' ? JSON.stringify(scanInfo.rails_version) : (scanInfo.rails_version || 'N/A');
    document.getElementById('meta-brakeman').textContent = typeof scanInfo.brakeman_version === 'object' ? JSON.stringify(scanInfo.brakeman_version) : (scanInfo.brakeman_version || 'N/A');
    
    // Duration float formatting
    let durationVal = 'N/A';
    if (scanInfo.duration !== null && scanInfo.duration !== undefined) {
      const parsedDur = parseFloat(scanInfo.duration);
      durationVal = isNaN(parsedDur) ? String(scanInfo.duration) + 's' : parsedDur.toFixed(2) + "s";
    }
    document.getElementById('meta-duration').textContent = durationVal;

        dropzone.style.display = 'none';
    dashboard.style.display = 'block';

    // Focus shifts to dashboard on load
    dashboard.focus();

        renderWarningsListStructure();
    
        applyFiltersAndSearch();
  }

  function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return dateStr;
    }
  }

  // Get secure coding recommendations and vulnerability explanations based on Brakeman warning types
  function getVulnerabilityRemediationInfo(warningType) {
    const type = String(warningType || '').trim();
    
    // Default fallback
    let info = {
      overview: "Brakeman flagged dynamic parameters or unvalidated inputs evaluated in server contexts.",
      impact: "Risk depends on the context: unauthorized database access, privilege escalation, or arbitrary code execution.",
      before: "# Dynamic parameter processed unsafely\nparams[:query]",
      after: "# Use strict parameter validation and allowlists\nparams.require(:item).permit(:validated_param)",
      afterExplanation: "Always use strong parameters, validate inputs with schemas, and isolate execution paths through strict allowlists.",
      checklist: [
        "Enforce strict input sanitization and verification on all client-supplied parameters.",
        "Ensure dynamic variables are escaped or parameterized before being evaluated in database queries or HTML rendering.",
        "Execute dynamic routines only via strict allowlists."
      ],
      owasp_link: "https://owasp.org/www-project-top-ten/",
      owasp_title: "OWASP Top Ten"
    };

    if (type === "SQL Injection") {
      info.overview = "User input is concatenated or interpolated directly into an ActiveRecord query.";
      info.impact = "Unauthorized database access, authentication bypass, or data exfiltration.";
      info.before = "# VULNERABLE: Direct SQL string interpolation\nUser.where(\"email = '#{params[:email]}' AND blocked = false\")";
      info.after = "# SECURE: Hash notation (Auto-escaped and parameterized by ActiveRecord)\nUser.where(email: params[:email], blocked: false)\n\n# SECURE: Placeholder queries if custom fragments are needed\nUser.where(\"email = ? AND blocked = false\", params[:email])";
      info.afterExplanation = "ActiveRecord auto-escapes hash arguments and parameters passed as placeholders (?). Never use string interpolation inside query arguments. For sorting or custom fragment order, check arguments against an explicit local array allowlist and pass key/value pairs.";
      info.checklist = [
        "Never use string interpolation inside ActiveRecord database queries.",
        "Prefer Hash condition syntax for automatic escaping of query inputs.",
        "Integrate static analysis tooling like Brakeman into your CI pipeline to catch database concatenations automatically."
      ];
      info.owasp_link = "https://owasp.org/www-community/attacks/SQL_Injection";
      info.owasp_title = "OWASP SQL Injection Guide";
    }
    else if (type === "Cross-Site Scripting") {
      info.overview = "Unescaped user input rendered in templates bypassing ERB automatic HTML escaping.";
      info.impact = "Session hijacking, cookie theft, or unauthorized client-side actions.";
      info.before = "<%# VULNERABLE: Direct unescaped output bypassing default HTML escaping %>\n<%= raw @user.biography %>\n\n<%# VULNERABLE: Declaring unescaped HTML content %>\n<%= @user.biography.html_safe %>";
      info.after = "<%# SECURE: Keep default Rails escaping %>\n<%= @user.biography %>\n\n<%# SECURE: Sanitize rich HTML output safely if styling is required %>\n<%= sanitize @user.biography, tags: %w(p strong em br a), attributes: %w(href) %>";
      info.afterExplanation = "Rails automatically escapes HTML characters in the template by default. Never use raw or html_safe on dynamic user input. If rich formatting is absolutely required, use the Rails sanitize helper with an explicit tag and attribute allowlist (e.g. allowing 'a' and 'href').";
      info.checklist = [
        "Avoid using raw or .html_safe on any variable containing user-controlled input.",
        "Use the sanitize helper for safe rich-text rendering with custom tag allowlists.",
        "Ensure your Content Security Policy (CSP) restricts inline scripts."
      ];
      info.owasp_link = "https://owasp.org/www-community/attacks/xss/";
      info.owasp_title = "OWASP XSS Guide";
    }
    else if (type === "Mass Assignment") {
      info.overview = "Request parameters are assigned to models without strong parameter restrictions.";
      info.impact = "Privilege escalation (e.g., updating admin or role flags) or unauthorized attribute overwrites.";
      info.before = "# VULNERABLE: Permitting sensitive or administrative database columns\nparams.require(:user).permit(:username, :email, :admin)\n\n# VULNERABLE: Bypassing controller safety checks entirely\nparams.require(:user).permit!";
      info.after = "# SECURE: Explicitly declaring permitted safe parameters via strong parameters\ndef create\n  User.create(user_params)\nend\n\nprivate\n\ndef user_params\n  params.require(:user).permit(:username, :email, :biography)\nend";
      info.afterExplanation = "Use Strong Parameters (params.permit) in your controllers to explicitly allowlist fields that are safe to update. Never permit sensitive flags like admin, role, or balance through public-facing endpoints. Note that update_attributes was deprecated and completely removed in Rails 6.1 in favor of update.";
      info.checklist = [
        "Always define dedicated permitted parameter helpers in your Rails controllers.",
        "Never permit sensitive attributes (admin, role, owner_id) in general-purpose endpoints.",
        "Verify your model configurations do not bypass parameter check protections."
      ];
      info.owasp_link = "https://cheatsheetseries.owasp.org/cheatsheets/Mass_Assignment_Cheat_Sheet.html";
      info.owasp_title = "OWASP Mass Assignment Cheat Sheet";
    }
    else if (type === "Redirect") {
      info.overview = "Redirection targets are constructed directly from user input.";
      info.impact = "Open redirect used in phishing or token harvesting attacks.";
      info.before = "# VULNERABLE: Redirecting directly to a parameter\nredirect_to params[:return_to]";
      info.after = "# SECURE: Restrict redirect target to local path using url_from\nif safe_path = url_from(params[:return_to])\n  redirect_to safe_path\nelse\n  redirect_to root_path\nend\n\n# SECURE: Safe redirect back to referrer with local fallback (Rails 7.0+)\nredirect_back_or_to root_path";
      info.afterExplanation = "In modern Rails (7.0+), passing allow_other_host: false blocks off-host redirects. To avoid unhandled UnsafeRedirectError exceptions, use url_from to ensure the destination path is strictly internal before redirecting, or leverage redirect_back_or_to.";
      info.checklist = [
        "Never perform direct redirects to dynamic parameters like params[:url].",
        "Use Rails 7.0+ url_from helper to parse and verify the target path is strictly internal.",
        "Use redirect_back_or_to for referrers with local fallbacks instead of custom redirect logic."
      ];
      info.owasp_link = "https://api.rubyonrails.org/v7.1/classes/ActionController/Redirecting.html";
      info.owasp_title = "Rails Redirecting Guide";
    }
    else if (type === "Command Injection") {
      info.overview = "User input is passed into shell commands without argument separation.";
      info.impact = "Arbitrary operating system command execution under the web server user.";
      info.before = "# VULNERABLE: String interpolation passed to shell executor\nsystem(\"ffmpeg -i #{params[:video]} #{output_file}\")";
      info.after = "# SECURE: Match inputs against an approved lookup table of files\nSAFE_VIDEOS = { 'intro' => '/var/assets/intro.mp4', 'outro' => '/var/assets/outro.mp4' }.freeze\nvideo_path = SAFE_VIDEOS.fetch(params[:video]) { raise ActionController::BadRequest, \"Invalid Video Selection\" }\n\n# Use array format to bypass shell execution\nsystem(\"ffmpeg\", \"-i\", video_path, \"-vf\", \"scale=320:240\", output_file)";
      info.afterExplanation = "Always pass system command arguments as an array rather than a single string to bypass shell parsing. When dealing with path arguments, never pass raw, user-supplied paths directly; map inputs to validated, server-controlled paths or ActiveStorage blob paths instead, which prevents local file reads or server-side request forgery (SSRF) via ffmpeg protocol handlers.";
      info.checklist = [
        "Avoid invoking operating system shells (system, backticks) whenever possible.",
        "Always pass system command inputs as an array of arguments, not a combined string.",
        "Avoid passing raw user-supplied paths directly; map inputs to validated server-controlled blobs instead."
      ];
      info.owasp_link = "https://owasp.org/www-community/attacks/Command_Injection";
      info.owasp_title = "OWASP Command Injection Guide";
    }
    else if (type === "Remote Code Execution" || type === "Unsafe Reflection" || type === "Dangerous Eval") {
      info.overview = "User-controlled strings passed to eval or constantize.";
      info.impact = "Arbitrary code execution or unintended class instantiation.";
      info.before = "# VULNERABLE: Direct dynamic code evaluation\neval(params[:code])\n\n# VULNERABLE: Unsafe constant reflection\nklass = params[:class_name].constantize";
      info.after = "# SECURE: Map input to safe local classes using a static lookup\n# Define the constant as a frozen Hash at the class level\nAPPROVED_CLASSES = { 'User' => User, 'Project' => Project }.freeze\n\n# Inside controller method, fetch safely with exception handling\nklass = APPROVED_CLASSES.fetch(params[:class_name]) { raise ActionController::BadRequest, \"Invalid Class\" }";
      info.afterExplanation = "Never pass raw user input to eval or reflection helpers like constantize. Instead, map parameters to safe object indices using a class-level frozen lookup table (Hash) and handle unlisted keys explicitly.";
      info.checklist = [
        "Never use eval, send, or constantize on direct raw input.",
        "Enforce a strict, explicit lookup list (Hash) to resolve dynamic class lookups."
      ];
      info.owasp_link = "https://owasp.org/www-community/vulnerabilities/Unsafe_use_of_reflection";
      info.owasp_title = "OWASP Unsafe Use of Reflection";
    }
    else if (type === "Dangerous Send") {
      info.overview = "User-controlled input passed directly to Object#send or Object#public_send.";
      info.impact = "Calling unintended private or administrative methods on models or controllers.";
      info.before = "# VULNERABLE: Invoking arbitrary methods on records from user input\n@project.public_send(params[:action_name])";
      info.after = "# SECURE: Validate against an explicit allowlist of safe instance methods\nAPPROVED_ACTIONS = %w[archive! publish! reset!].freeze\naction = APPROVED_ACTIONS.include?(params[:action_name]) ? params[:action_name] : 'archive!'\n@project.public_send(action)";
      info.afterExplanation = "Never call .send on raw user input. Use public_send instead, strictly limited to a hardcoded local array of approved method names.";
      info.checklist = [
        "Avoid using .send on any user-controlled inputs.",
        "Filter method names against a strict local allowlist and invoke them via public_send."
      ];
      info.owasp_link = "https://owasp.org/www-community/vulnerabilities/Unsafe_use_of_reflection";
      info.owasp_title = "OWASP Unsafe Use of Reflection";
    }
    else if (type === "Dynamic Render Path") {
      info.overview = "Template or partial paths derived from request parameters.";
      info.impact = "Local file disclosure or directory traversal within the view path.";
      info.before = "# VULNERABLE: Directly rendering a template from a parameter\nrender template: \"pages/#{params[:page]}\"";
      info.after = "# SECURE: Resolve parameters using a strict local template allowlist\nSAFE_PAGES = %w[home about contact].freeze\ntemplate = SAFE_PAGES.include?(params[:page]) ? params[:page] : 'fallback'\nrender template: \"pages/#{template}\"";
      info.afterExplanation = "Never interpolate raw user input inside a render path. Use a strict, frozen allowlist of approved template names at the controller level to prevent traversal outside your designated template directories.";
      info.checklist = [
        "Avoid using raw parameters or dynamic variables inside render paths.",
        "Filter all render targets against a strict allowlist of template name strings."
      ];
      info.owasp_link = "https://brakemanscanner.org/docs/warning_types/dynamic_render_path/";
      info.owasp_title = "Brakeman Dynamic Render Path Docs";
    }

    return info;
  }

  function setActiveFilter(filter) {
    activeFilter = filter;
    filterBtns.forEach(btn => {
      const isActive = btn.dataset.filter === filter;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    });
  }

  filterBtns.forEach(btn => {
    btn.addEventListener('click', function() {
      setActiveFilter(this.dataset.filter);
      applyFiltersAndSearch();
    });
  });

    searchInput.addEventListener('input', applyFiltersAndSearch);

  function applyFiltersAndSearch() {
    if (!normalizedWarnings) return;

    const searchTerm = searchInput.value.toLowerCase().trim();
    let visibleCount = 0;

    normalizedWarnings.forEach((w, index) => {
      const card = document.getElementById(`warning-${index}`);
      if (!card) return;

      let isVisible = true;

      // "ignored" isolates muted warnings; confidence filters target active ones
      if (activeFilter === 'ignored') {
        isVisible = w.is_ignored;
      } else if (activeFilter !== 'all') {
        isVisible = !w.is_ignored && w.confidence === activeFilter;
      }

            if (isVisible && searchTerm) {
        const textToMatch = `${w.warning_type} ${w.message} ${w.file} ${w.code || ''} ${w.note}`.toLowerCase();
        if (!textToMatch.includes(searchTerm)) {
          isVisible = false;
        }
      }

            if (isVisible) {
        card.classList.remove('hidden-by-filter');
        visibleCount++;
      } else {
        card.classList.add('hidden-by-filter');
      }
    });

    // Update Counter badge
    warningCountBadge.textContent = `${visibleCount} found`;

        if (visibleCount === 0) {
      if (normalizedWarnings.length === 0) {
        emptyState.querySelector('p').textContent = 'No warnings reported in this Brakeman scan.';
      } else {
        emptyState.querySelector('p').textContent = 'No vulnerabilities found matching your filter criteria.';
      }
      emptyState.style.display = 'block';
    } else {
      emptyState.style.display = 'none';
    }
  }

    function renderWarningsListStructure() {
    warningsListContainer.innerHTML = '';

    normalizedWarnings.forEach((w, index) => {
      const warningId = `warning-${index}`;
      
      const itemEl = document.createElement('div');
      itemEl.className = w.is_ignored ? 'warning-item is-ignored' : 'warning-item';
      itemEl.id = warningId;

            let barClass = 'severity-weak-bar';
      let badgeClass = 'badge-weak';
      let typeClass = 'warning-type-weak';
      if (w.confidence === 'high') {
        barClass = 'severity-high-bar';
        badgeClass = 'badge-high';
        typeClass = 'warning-type-high';
      } else if (w.confidence === 'medium') {
        barClass = 'severity-med-bar';
        badgeClass = 'badge-med';
        typeClass = 'warning-type-med';
      }

            let codeHtml = '';
      if (w.code) {
        codeHtml = `
          <div class="code-section">
            <div class="code-header">
              <span>Code Snippet</span>
              <span>Line ${escapeHTML(w.line)}</span>
            </div>
            <pre class="code-block"><code>${escapeHTML(w.code)}</code></pre>
          </div>
        `;
      }

      let ignoredBadgeHtml = '';
      let ignoredNoteHtml = '';
      if (w.is_ignored) {
        ignoredBadgeHtml = `
          <span class="warning-badge badge-ignored">
            <i class="ri-eye-off-line" aria-hidden="true"></i> Ignored
          </span>
        `;
        ignoredNoteHtml = `
          <div class="ignored-note">
            <i class="ri-eye-off-line" aria-hidden="true"></i>
            <div>
              <p class="ignored-note-title">Ignored via <code>config/brakeman.ignore</code></p>
              <p>${w.note ? escapeHTML(w.note) : 'No justification note was provided for this ignored warning.'}</p>
            </div>
          </div>
        `;
      }

            const secInfo = getVulnerabilityRemediationInfo(w.warning_type);

            let checklistHtml = '';
      secInfo.checklist.forEach(item => {
        checklistHtml += `<li>${escapeHTML(item)}</li>`;
      });

      // Wrap button inside heading h3 for proper navigation landmarks, add role="region" and tabindex="0" to panels
      itemEl.innerHTML = `
        <h3 style="margin: 0; font-size: inherit; font-weight: inherit;">
          <button class="warning-summary-row" 
                  aria-expanded="false" 
                  aria-controls="${warningId}-panel" 
                  id="${warningId}-header">
            <span class="warning-primary-info">
              <span class="severity-indicator ${barClass}"></span>
              <span class="warning-meta-data">
                <span class="warning-type-badge ${typeClass}">${escapeHTML(w.warning_type)}</span>
                <span class="warning-title">${escapeHTML(w.message)}</span>
                <span class="warning-location">
                  <i class="ri-file-code-line" aria-hidden="true"></i> ${escapeHTML(w.file)} : ${escapeHTML(w.line)}
                </span>
              </span>
            </span>
            <span class="warning-actions">
              ${ignoredBadgeHtml}
              <span class="warning-badge ${badgeClass}">${escapeHTML(w.confidence)} Confidence</span>
              <i class="ri-arrow-down-s-line expand-chevron" aria-hidden="true"></i>
            </span>
          </button>
        </h3>
        
        <div class="warning-details-panel" id="${warningId}-panel" role="region" aria-labelledby="${warningId}-header">
          ${ignoredNoteHtml}
          ${codeHtml}
          
          <div class="remediation-tabs">
            <!-- Distinct labels for tabs inside each warning -->
            <div class="tab-nav" role="tablist" aria-label="Remediation actions for warning ${escapeHTML(w.warning_type)} in ${escapeHTML(w.file)} at line ${escapeHTML(w.line)}">
              <button class="tab-link active" role="tab" aria-selected="true" aria-controls="${warningId}-explanation" id="${warningId}-tab-explanation" data-tab="explanation" tabindex="0">
                <i class="ri-article-line" aria-hidden="true"></i> Analysis & Explanations
              </button>
              <button class="tab-link" role="tab" aria-selected="false" aria-controls="${warningId}-remediation" id="${warningId}-tab-remediation" data-tab="remediation" tabindex="-1">
                <i class="ri-shield-check-line" aria-hidden="true"></i> Code Remediation Guide
              </button>
              <button class="tab-link" role="tab" aria-selected="false" aria-controls="${warningId}-checklist" id="${warningId}-tab-checklist" data-tab="checklist" tabindex="-1">
                <i class="ri-list-check-2" aria-hidden="true"></i> Fix Checklist
              </button>
            </div>
            
            <!-- Explanation Panel -->
            <div class="tab-panel active" id="${warningId}-explanation" role="tabpanel" aria-labelledby="${warningId}-tab-explanation" tabindex="0">
              <div class="panel-content">
                <h4>Security Assessment</h4>
                <p>${escapeHTML(secInfo.overview)}</p>
                <h4>Impact / Exploit Potential</h4>
                <p>${escapeHTML(secInfo.impact)}</p>
                <div class="references-block">
                  <span class="ref-label">References:</span>
                  <a href="${secInfo.owasp_link}" target="_blank" rel="noopener noreferrer" class="reference-link">
                    <i class="ri-external-link-line" aria-hidden="true"></i> ${escapeHTML(secInfo.owasp_title)} <span class="sr-only">(opens in new window)</span>
                  </a>
                  <a href="https://brakemanscanner.org/docs/warning_types/" target="_blank" rel="noopener noreferrer" class="reference-link">
                    <i class="ri-book-open-line" aria-hidden="true"></i> Brakeman Warning Types <span class="sr-only">(opens in new window)</span>
                  </a>
                </div>
              </div>
            </div>
            
            <!-- Remediation Panel -->
            <div class="tab-panel" id="${warningId}-remediation" role="tabpanel" aria-labelledby="${warningId}-tab-remediation" tabindex="0">
              <div class="panel-content">
                <h4>How to Fix (Ruby on Rails Implementation)</h4>
                <p>Compare the vulnerable pattern with the recommended secure implementation below:</p>
                
                <div class="comparison-box">
                  <!-- Before -->
                  <div class="comparison-card vulnerable">
                    <div class="comparison-title">
                      <i class="ri-close-circle-fill" aria-hidden="true"></i> Vulnerable Implementation
                    </div>
                    <pre><code>${escapeHTML(secInfo.before)}</code></pre>
                  </div>
                  
                  <!-- After -->
                  <div class="comparison-card secure">
                    <div class="comparison-title">
                      <i class="ri-checkbox-circle-fill" aria-hidden="true"></i> Recommended Secure Fix
                    </div>
                    <pre><code>${escapeHTML(secInfo.after)}</code></pre>
                  </div>
                </div>
                
                <p class="comparison-explanation" style="margin-top: 1rem;">
                  <strong>Secure Coding Practice:</strong> ${escapeHTML(secInfo.afterExplanation)}
                </p>
              </div>
            </div>
            
            <!-- Checklist Panel -->
            <div class="tab-panel" id="${warningId}-checklist" role="tabpanel" aria-labelledby="${warningId}-tab-checklist" tabindex="0">
              <div class="panel-content">
                <h4>Remediation Checklist</h4>
                <p>Complete these verification actions to secure this specific code section:</p>
                <ul class="remediation-checklist">
                  ${checklistHtml}
                </ul>
              </div>
            </div>
          </div>
        </div>
      `;

      warningsListContainer.appendChild(itemEl);
      
      // Initialize keyboard navigation for the tablist of this warning
      setupTabKeyboardNavigation(warningId);
    });
  }

  // Event Delegation for Accordion Toggles and Tabs
  warningsListContainer.addEventListener('click', function(e) {
        const header = e.target.closest('.warning-summary-row');
    if (header) {
      e.preventDefault();
      const item = header.closest('.warning-item');
      if (item) {
        toggleWarning(item.id, header);
      }
      return;
    }

        const tabLink = e.target.closest('.tab-link');
    if (tabLink) {
      e.preventDefault();
      const tabType = tabLink.dataset.tab;
      const warningItem = tabLink.closest('.warning-item');
      if (warningItem) {
        switchTab(warningItem.id, tabLink, tabType);
      }
      return;
    }
  });

  // Toggles the warning expanded panel
  function toggleWarning(itemId, headerEl) {
    const item = document.getElementById(itemId);
    const panel = document.getElementById(`${itemId}-panel`);
    
    if (!item || !panel) return;
    
    const isExpanded = item.classList.contains('expanded');
    
    if (isExpanded) {
      item.classList.remove('expanded');
      panel.style.display = 'none';
      headerEl.setAttribute('aria-expanded', 'false');
    } else {
      item.classList.add('expanded');
      panel.style.display = 'block';
      headerEl.setAttribute('aria-expanded', 'true');
    }
  }

  // Handles switching tab panels inside warning cards
  function switchTab(itemId, activeTabLink, tabType) {
    const panelContainer = document.getElementById(`${itemId}-panel`);
    if (!panelContainer) return;

    const tabs = panelContainer.querySelectorAll('.tab-link');
    const panels = panelContainer.querySelectorAll('.tab-panel');

        tabs.forEach(t => {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
      t.setAttribute('tabindex', '-1');
    });
    panels.forEach(p => p.classList.remove('active'));

        activeTabLink.classList.add('active');
    activeTabLink.setAttribute('aria-selected', 'true');
    activeTabLink.setAttribute('tabindex', '0');

        const activePanel = panelContainer.querySelector(`#${itemId}-${tabType}`);
    if (activePanel) {
      activePanel.classList.add('active');
    }
  }

  // Roving tabindex and Arrow Key navigation for tab panels
  function setupTabKeyboardNavigation(warningId) {
    const panelContainer = document.getElementById(`${warningId}-panel`);
    if (!panelContainer) return;

    const tablist = panelContainer.querySelector('[role="tablist"]');
    if (!tablist) return;

    const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));

    tablist.addEventListener('keydown', function(e) {
      const activeIdx = tabs.findIndex(t => t.getAttribute('tabindex') === '0');
      if (activeIdx === -1) return;

      let nextIdx = null;

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        nextIdx = (activeIdx + 1) % tabs.length;
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        nextIdx = (activeIdx - 1 + tabs.length) % tabs.length;
      } else if (e.key === 'Home') {
        e.preventDefault();
        nextIdx = 0;
      } else if (e.key === 'End') {
        e.preventDefault();
        nextIdx = tabs.length - 1;
      }

      if (nextIdx !== null) {
        const nextTab = tabs[nextIdx];
        const tabType = nextTab.dataset.tab;
        switchTab(warningId, nextTab, tabType);
        nextTab.focus();
      }
    });
  }

  // Escape to avoid HTML rendering inside parsed attributes
  function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#039;');
  }
});

# Statly — Hypothesis Testing Tool

A browser-based hypothesis testing tool with two modes: manually run tests on uploaded datasets, or drop in a stats problem and let Claude solve it step by step.

Live site: [therodma.github.io/Hypothesis_Test_Generator](https://therodma.github.io/Hypothesis_Test_Generator)

---

## Modes

### Manual Mode
Upload a CSV or Excel file, pick a test, configure your columns and parameters, and run it. Results include the test statistic, p-value, a decision table at α = 0.01 / 0.05 / 0.10, and an effect size badge.

### Problem Solver Mode
Upload a PDF, DOCX, TXT, or image file containing a stats problem. The site extracts the text, sends it to the Claude API, and returns a full step-by-step solution with hypotheses, calculations, p-value interpretation, and a plain-English conclusion.

---

## Supported Tests

| Category | Tests |
|---|---|
| T-Tests | One-Sample, Two-Sample (Welch), Paired |
| Z-Tests | One-Sample (known σ), One-Proportion, Two-Proportion |
| ANOVA | One-Way + Tukey HSD, Two-Way |
| Chi-Square | Test of Independence (+ Cramér's V), Goodness of Fit |
| Correlation | Pearson, Spearman, Kendall's Tau |
| Non-Parametric | Mann-Whitney U, Kruskal-Wallis, Binomial Test |
| Variance / Normality | F-Test, Levene's Test, Shapiro-Wilk |

---

## Effect Sizes Reported

- Cohen's d — t-tests and z-tests
- η² (eta-squared) — ANOVA and Kruskal-Wallis
- Cramér's V — Chi-square independence
- r — Pearson, Spearman, Mann-Whitney U
- τ (tau) — Kendall's Tau

---

## File Extraction (Problem Solver)

| Format | Library |
|---|---|
| PDF | PDF.js |
| DOCX | Mammoth.js |
| PNG / JPG | Tesseract.js (OCR) |
| TXT | Native browser API |

Extracted text is shown in an editable textarea before sending, so you can fix any OCR errors.

---

## Stack

- Vanilla HTML / CSS / JavaScript — no framework, no build step
- [jStat](https://jstat.github.io/) — statistical distributions and computations
- [PapaParse](https://www.papaparse.com/) — CSV parsing
- [SheetJS](https://sheetjs.com/) — Excel parsing
- [Chart.js](https://www.chartjs.org/) — visualizations
- [Claude API](https://www.anthropic.com/api) — AI problem solver (claude-opus-4-5)

---

## Running Locally

Just open `index.html` in a browser — no server or install needed for Manual Mode.

For Problem Solver Mode you need a Claude API key from [console.anthropic.com](https://console.anthropic.com). Enter it in the key field (it is never stored — session only).

> **Note:** Direct browser calls to the Claude API require the `anthropic-dangerous-direct-browser-access` header. For production use, route requests through a backend proxy instead.

---

## Deploying to GitHub Pages

1. Go to your repo → **Settings** → **Pages**
2. Set source to **Deploy from branch**, branch `main`, folder `/ (root)`
3. Save — the site will be live at `https://therodma.github.io/Hypothesis_Test_Generator`

---
name: "plan-recorder"
description: "Records a detailed plan for a feature or enhancement in a markdown file. Invoke when starting a new feature or when the user asks to document a plan."
---

# Plan Recorder

This skill helps record and manage development plans for features or enhancements.

## When to Use

Invoke this skill when:
- You are starting a new feature or enhancement.
- The user asks to "record a plan" or "create a plan doc".
- You need to document implementation steps, current state analysis, and verification steps.

## Usage Guidelines

1.  **File Location**: Always create the plan file in `.trae/documents/` or a relevant documentation folder.
2.  **Content Structure**:
    - **Summary**: Brief overview of the goal.
    - **Current State Analysis**: What is already in place.
    - **Proposed Changes**: Specific files and logical changes.
    - **Assumptions & Decisions**: Key choices made during planning.
    - **Verification Steps**: How to test the implementation.
3.  **Naming Convention**: Use descriptive filenames like `feature-name-plan.md`.

## Example

```markdown
# Plan: Add User Login

## Summary
Add a login page and authentication logic.

## Proposed Changes
- `login.html`: Create new page.
- `auth.js`: Add login function.

...
```

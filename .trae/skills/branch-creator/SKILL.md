---
name: "branch-creator"
description: "Creates a new git branch with a suggested name. Invoke when starting a new feature/fix or when the user asks to create a branch."
---

# Branch Creator

This skill helps you automatically suggest a standardized git branch name and create it based on the current task or user request.

## When to Use

Invoke this skill when:
- The user asks to create a new branch.
- You are starting a new feature, bug fix, or task and need to isolate the work.

## Naming Convention

Branch names should follow this format: `<type>/<short-description>`

- **Types**: 
  - `feat` or `feature`: For new features
  - `fix`: For bug fixes
  - `docs`: For documentation changes
  - `chore`: For routine tasks, maintenance, or tooling
  - `refactor`: For code refactoring
- **Description**: Use kebab-case (e.g., `add-login-button`, `fix-navbar-spacing`).

## Execution Steps

1. **Analyze Context**: Review the current task or the user's prompt to determine the branch type and description.
2. **Suggest Name**: Generate a branch name following the convention (e.g., `feat/add-payment-gateway`).
3. **Create Branch**: Use the `RunCommand` tool to execute the git command: `git checkout -b <suggested-name>`.
4. **Notify User**: Confirm to the user that the new branch has been created successfully.

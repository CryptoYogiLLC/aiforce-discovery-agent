# GitHub Issue Parent-Child Relationships and Project Setup

## Overview

This document describes how to properly create parent-child relationships between GitHub issues (sub-issues), assign issues to projects/milestones, and apply appropriate labels.

## Parent-Child Issue Relationships (Sub-Issues)

### What Are Sub-Issues?

GitHub's sub-issues feature allows you to create hierarchical relationships between issues, where one issue (parent/epic) contains multiple child issues (sub-issues).

### Key Differences: References vs. Sub-Issues

**❌ INCORRECT - Just Mentioning in Body:**

```markdown
## Sub-Issues

- #123 Task 1
- #124 Task 2
```

This only creates text references. GitHub does NOT track these as proper relationships.

**✅ CORRECT - Actual Sub-Issue Relationship:**
Uses GitHub's REST API to create formal parent-child links.

### How to Create Sub-Issue Relationships

#### Prerequisites

1. Both parent and child issues must already exist
2. You need the **numeric issue ID** (not the issue number)
3. All issues must be in the same repository

#### Step 1: Get Issue IDs

```bash
# Get numeric ID for an issue (NOT the issue number)
gh api repos/{owner}/{repo}/issues/{issue_number} --jq '.id'

# Example for multiple issues
for i in 85 86 87 88; do
  id=$(gh api "repos/CryptoYogiLLC/aiforce-discovery-agent/issues/$i" --jq '.id')
  echo "$i: $id"
done
```

**Important:** The issue ID is a large number like `3547494093`, NOT the issue number like `85`.

#### Step 2: Add Sub-Issues to Parent

```bash
# Add a single sub-issue
gh api repos/{owner}/{repo}/issues/{parent_number}/sub_issues \
  --method POST \
  --header 'Accept: application/vnd.github+json' \
  --header 'X-GitHub-Api-Version: 2022-11-28' \
  --input - <<< '{"sub_issue_id": 3547494093}'

# Add multiple sub-issues (example script)
for issue_num in 101 102 103; do
  issue_id=$(gh api "repos/{owner}/{repo}/issues/$issue_num" --jq '.id')

  gh api repos/{owner}/{repo}/issues/100/sub_issues \
    --method POST \
    --header 'Accept: application/vnd.github+json' \
    --header 'X-GitHub-Api-Version: 2022-11-28' \
    --input - <<< "{\"sub_issue_id\": $issue_id}"

  sleep 1  # Rate limiting protection
done
```

**Critical Notes:**

- The `sub_issue_id` must be an **integer** in JSON, not a string
- Use `<<<` for heredoc input with proper JSON formatting
- Add sleep between requests to avoid rate limiting

#### Step 3: Verify Parent-Child Relationships

```bash
# Check parent issue has sub-issues
gh api repos/{owner}/{repo}/issues/{parent_number} \
  --jq '.sub_issues_summary'

# Expected output:
# {"total": 5, "completed": 0, "percent_completed": 0}

# Verify child issue shows parent
gh api repos/{owner}/{repo}/issues/{child_number}/parent \
  --jq '{parent_issue: .number, parent_title: .title}'
```

## Milestone Assignment

### Create Milestone

```bash
gh api repos/{owner}/{repo}/milestones \
  --method POST \
  --field title="Phase 2: Extended Discovery" \
  --field description="API Tracer, CMDB Connectors, Helm Charts, Additional DB Connectors"
```

### List Available Milestones

```bash
gh api repos/{owner}/{repo}/milestones \
  --jq '.[] | {number: .number, title: .title}'
```

### Assign Issue to Milestone

```bash
# Single issue
gh issue edit {issue_number} --milestone "Phase 2: Extended Discovery"

# Multiple issues
for i in 85 86 87 88; do
  gh issue edit $i --milestone "Phase 2: Extended Discovery"
done
```

## Label Management

### Create Labels

```bash
gh label create "phase-2" --description "Phase 2: Extended Discovery" --color "5319e7"
gh label create "phase-3" --description "Phase 3: Advanced Features" --color "d876e3"
gh label create "epic" --description "Parent issue containing sub-issues" --color "3E4B9E"
gh label create "collector" --description "Collector service" --color "0E8A16"
gh label create "platform" --description "Platform infrastructure" --color "FBCA04"
gh label create "gateway" --description "Gateway service" --color "D93F0B"
```

### Add Labels to Issues

```bash
gh issue edit {issue_number} --add-label "phase-2,epic"
```

## Repository-Specific Settings

### For aiforce-discovery-agent Repository:

- **Owner:** CryptoYogiLLC
- **Repo:** aiforce-discovery-agent

### Standard Label Set:

- Phase: `phase-2`, `phase-3`, `phase-4`
- Type: `epic`, `enhancement`, `bug`
- Service: `collector`, `platform`, `gateway`
- Priority: `priority-critical`, `priority-high`

## Complete Workflow Example

### Creating a Phase Epic with Sub-Issues

**Step 1: Create Parent Epic Issue**

```bash
gh issue create \
  --title "Epic: Phase 2 - Extended Discovery" \
  --body "Parent epic for all Phase 2 features..." \
  --label "enhancement,phase-2,epic"
```

**Step 2: Create Child Issues**

```bash
gh issue create --title "APM/Log Parser - Runtime Dependency Mapping" --label "enhancement,phase-2,collector"
gh issue create --title "CMDB Connectors - ServiceNow + Device42" --label "enhancement,phase-2,platform"
# Note the issue numbers returned
```

**Step 3: Link Child Issues to Parent**

```bash
PARENT=100  # Replace with actual parent issue number
for i in 101 102 103 104; do
  issue_id=$(gh api "repos/CryptoYogiLLC/aiforce-discovery-agent/issues/$i" --jq '.id')

  gh api repos/CryptoYogiLLC/aiforce-discovery-agent/issues/$PARENT/sub_issues \
    --method POST \
    --header 'Accept: application/vnd.github+json' \
    --header 'X-GitHub-Api-Version: 2022-11-28' \
    --input - <<< "{\"sub_issue_id\": $issue_id}"

  sleep 1
done
```

**Step 4: Assign All to Milestone**

```bash
for i in 100 101 102 103 104; do
  gh issue edit $i --milestone "Phase 2: Extended Discovery"
done
```

## Troubleshooting

### Issue: "Invalid property /sub_issue_id: is not of type integer"

**Cause:** Using `-f` flag which creates string values
**Solution:** Use `--input -` with heredoc:

```bash
# ❌ WRONG
gh api ... -f sub_issue_id=3547494093

# ✅ CORRECT
gh api ... --input - <<< '{"sub_issue_id": 3547494093}'
```

### Issue: Sub-issues API returns 404

**Cause:** Feature not enabled on repository
**Workaround:** Use task list format in parent issue body:

```markdown
## Child Issues

- [ ] #101 - Task 1
- [ ] #102 - Task 2
```

## Best Practices

1. **Always use sub-issue API** instead of text references when available
2. **Create milestones** for each phase (Phase 2, Phase 3, Phase 4)
3. **Use consistent labeling** (phase-X, epic, collector/platform/gateway)
4. **Interview stakeholders** before creating issues to capture design decisions
5. **Add sleep delays** in bulk operations to avoid rate limiting
6. **Use numeric issue IDs** (from API), not issue numbers, for sub-issues

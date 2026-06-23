# Gate Map (generated)

> First-cut: explicit references only. Human-curated enforcement tiers live in the orchestration explainer.

```mermaid
flowchart LR
  adherence_audit --> dispatching_parallel_agents
  ai_tool_security_reviewer --> vet_security
  architect --> researcher
  brainstorming --> researcher
  brainstorming --> writing_plans
  creating_tools --> writing_agents
  creating_tools --> writing_rules
  creating_tools --> writing_skills
  dispatching_parallel_agents --> review_workflow
  doc_author --> architecture_decision_records
  doc_author --> docs_architect
  doc_author --> git_manager
  doc_backfill --> architecture_decision_records
  doc_backfill --> doc_author
  doc_backfill --> git_manager
  doc_tools --> doc_author
  doc_tools --> project_setup
  docs_refresh --> architecture_decision_records
  docs_refresh --> changelog_automation
  docs_refresh --> doc_author
  docs_refresh --> docs_architect
  docs_refresh --> git_manager
  docs_refresh --> mermaid_expert
  docs_refresh --> openapi_spec_generation
  docs_refresh --> reference_builder
  docs_refresh --> tutorial_engineer
  docs_status --> project_setup
  executing_plans --> e2e_init
  executing_plans --> git_manager
  executing_plans --> systematic_debugging
  executing_plans --> test_runner
  finishing_a_development_branch --> git_manager
  finishing_a_development_branch --> infra_init
  git_manager --> secrets_handling
  handoff --> plan_management
  install_vetting --> vet_capability_fit
  install_vetting --> vet_install
  install_vetting --> vet_reputation
  install_vetting --> vet_security
  integration_test_constraints --> systematic_debugging
  jira_workflow_manager --> researcher
  librarian --> dispatching_parallel_agents
  mcp_governance --> git_manager
  mcp_governance --> jira_workflow_manager
  new_repo_setup --> architect
  new_repo_setup --> creating_tools
  new_repo_setup --> e2e_init
  new_repo_setup --> git_manager
  new_repo_setup --> infra_init
  new_repo_setup --> integration_engineer
  new_repo_setup --> jira_workflow_manager
  new_repo_setup --> plan_management
  new_repo_setup --> researcher
  new_repo_setup --> test_builder
  new_repo_setup --> test_strategy
  new_repo_setup --> writing_agents
  new_repo_setup --> writing_rules
  plan_docs --> brainstorming
  plan_docs --> finishing_a_development_branch
  plan_docs --> plan_gate
  plan_docs --> plan_management
  plan_docs --> systematic_debugging
  plan_docs --> writing_plans
  plan_gate --> adherence_audit
  plan_gate --> architect
  plan_gate --> executing_plans
  plan_gate --> jira_workflow_manager
  plan_gate --> plan_management
  plan_gate --> test_builder
  plan_gate --> test_strategy
  plan_gate --> writing_plans
  plan_management --> brainstorming
  plan_management --> doc_author
  plan_management --> executing_plans
  plan_management --> git_manager
  plan_management --> jira_workflow_manager
  plan_management --> subagent_driven_development
  plan_management --> systematic_debugging
  plan_management --> writing_plans
  planning --> architect
  planning --> integration_engineer
  planning --> plan_management
  planning --> researcher
  planning --> subagent_driven_development
  planning --> test_strategy
  plugin_lifecycle --> creating_tools
  plugin_lifecycle --> using_superpowers
  project_setup --> e2e_init
  project_setup --> infra_init
  project_setup --> vet_install
  project_setup --> vet_reputation
  requesting_code_review --> dispatching_parallel_agents
  review_workflow --> creating_tools
  review_workflow --> different_viewpoint
  review_workflow --> dispatching_parallel_agents
  review_workflow --> git_manager
  review_workflow --> writing_skills
  stack_hats --> architect
  stack_hats --> executing_plans
  stack_hats --> project_setup
  stack_hats --> subagent_driven_development
  subagent_driven_development --> jira_workflow_manager
  subagent_driven_development --> plan_management
  subagent_driven_development --> researcher
  subagent_driven_development --> systematic_debugging
  subagent_driven_development --> test_runner
  systematic_debugging --> dispatching_parallel_agents
  systematic_debugging --> plan_management
  test_builder --> git_manager
  test_runner --> e2e_init
  test_runner --> systematic_debugging
  using_git_worktrees --> finishing_a_development_branch
  using_git_worktrees --> infra_init
  using_superpowers --> architect
  using_superpowers --> creating_tools
  using_superpowers --> git_manager
  using_superpowers --> infra_init
  using_superpowers --> integration_engineer
  using_superpowers --> jira_workflow_manager
  using_superpowers --> plan_gate
  using_superpowers --> researcher
  using_superpowers --> test_builder
  using_superpowers --> test_strategy
  vet_capability_fit --> researcher
  vet_capability_fit --> vet_reputation
  vet_capability_fit --> vet_security
  vet_install --> vet_capability_fit
  vet_install --> vet_reputation
  vet_install --> vet_security
  vet_security --> ai_tool_security_reviewer
  vet_security --> vet_capability_fit
  vet_security --> vet_reputation
  workflow_phases --> git_manager
  workflow_phases --> jira_workflow_manager
  workflow_phases --> plan_management
  writing_plans --> executing_plans
  writing_plans --> finishing_a_development_branch
  writing_plans --> git_manager
  writing_plans --> researcher
  writing_plans --> subagent_driven_development
  writing_plans --> writing_agents
  writing_plans --> writing_rules
  writing_plans --> writing_skills
  writing_rules --> writing_agents
  writing_rules --> writing_skills
  writing_skills --> creating_tools
```

## Edges

| From | To |
|------|----|
| adherence-audit | dispatching-parallel-agents |
| ai-tool-security-reviewer | vet-security |
| architect | researcher |
| brainstorming | researcher |
| brainstorming | writing-plans |
| creating-tools | writing-agents |
| creating-tools | writing-rules |
| creating-tools | writing-skills |
| dispatching-parallel-agents | review-workflow |
| doc-author | architecture-decision-records |
| doc-author | docs-architect |
| doc-author | git-manager |
| doc-backfill | architecture-decision-records |
| doc-backfill | doc-author |
| doc-backfill | git-manager |
| doc-tools | doc-author |
| doc-tools | project-setup |
| docs-refresh | architecture-decision-records |
| docs-refresh | changelog-automation |
| docs-refresh | doc-author |
| docs-refresh | docs-architect |
| docs-refresh | git-manager |
| docs-refresh | mermaid-expert |
| docs-refresh | openapi-spec-generation |
| docs-refresh | reference-builder |
| docs-refresh | tutorial-engineer |
| docs-status | project-setup |
| executing-plans | e2e-init |
| executing-plans | git-manager |
| executing-plans | systematic-debugging |
| executing-plans | test-runner |
| finishing-a-development-branch | git-manager |
| finishing-a-development-branch | infra-init |
| git-manager | secrets-handling |
| handoff | plan-management |
| install-vetting | vet-capability-fit |
| install-vetting | vet-install |
| install-vetting | vet-reputation |
| install-vetting | vet-security |
| integration-test-constraints | systematic-debugging |
| jira-workflow-manager | researcher |
| librarian | dispatching-parallel-agents |
| mcp-governance | git-manager |
| mcp-governance | jira-workflow-manager |
| new-repo-setup | architect |
| new-repo-setup | creating-tools |
| new-repo-setup | e2e-init |
| new-repo-setup | git-manager |
| new-repo-setup | infra-init |
| new-repo-setup | integration-engineer |
| new-repo-setup | jira-workflow-manager |
| new-repo-setup | plan-management |
| new-repo-setup | researcher |
| new-repo-setup | test-builder |
| new-repo-setup | test-strategy |
| new-repo-setup | writing-agents |
| new-repo-setup | writing-rules |
| plan-docs | brainstorming |
| plan-docs | finishing-a-development-branch |
| plan-docs | plan-gate |
| plan-docs | plan-management |
| plan-docs | systematic-debugging |
| plan-docs | writing-plans |
| plan-gate | adherence-audit |
| plan-gate | architect |
| plan-gate | executing-plans |
| plan-gate | jira-workflow-manager |
| plan-gate | plan-management |
| plan-gate | test-builder |
| plan-gate | test-strategy |
| plan-gate | writing-plans |
| plan-management | brainstorming |
| plan-management | doc-author |
| plan-management | executing-plans |
| plan-management | git-manager |
| plan-management | jira-workflow-manager |
| plan-management | subagent-driven-development |
| plan-management | systematic-debugging |
| plan-management | writing-plans |
| planning | architect |
| planning | integration-engineer |
| planning | plan-management |
| planning | researcher |
| planning | subagent-driven-development |
| planning | test-strategy |
| plugin-lifecycle | creating-tools |
| plugin-lifecycle | using-superpowers |
| project-setup | e2e-init |
| project-setup | infra-init |
| project-setup | vet-install |
| project-setup | vet-reputation |
| requesting-code-review | dispatching-parallel-agents |
| review-workflow | creating-tools |
| review-workflow | different-viewpoint |
| review-workflow | dispatching-parallel-agents |
| review-workflow | git-manager |
| review-workflow | writing-skills |
| stack-hats | architect |
| stack-hats | executing-plans |
| stack-hats | project-setup |
| stack-hats | subagent-driven-development |
| subagent-driven-development | jira-workflow-manager |
| subagent-driven-development | plan-management |
| subagent-driven-development | researcher |
| subagent-driven-development | systematic-debugging |
| subagent-driven-development | test-runner |
| systematic-debugging | dispatching-parallel-agents |
| systematic-debugging | plan-management |
| test-builder | git-manager |
| test-runner | e2e-init |
| test-runner | systematic-debugging |
| using-git-worktrees | finishing-a-development-branch |
| using-git-worktrees | infra-init |
| using-superpowers | architect |
| using-superpowers | creating-tools |
| using-superpowers | git-manager |
| using-superpowers | infra-init |
| using-superpowers | integration-engineer |
| using-superpowers | jira-workflow-manager |
| using-superpowers | plan-gate |
| using-superpowers | researcher |
| using-superpowers | test-builder |
| using-superpowers | test-strategy |
| vet-capability-fit | researcher |
| vet-capability-fit | vet-reputation |
| vet-capability-fit | vet-security |
| vet-install | vet-capability-fit |
| vet-install | vet-reputation |
| vet-install | vet-security |
| vet-security | ai-tool-security-reviewer |
| vet-security | vet-capability-fit |
| vet-security | vet-reputation |
| workflow-phases | git-manager |
| workflow-phases | jira-workflow-manager |
| workflow-phases | plan-management |
| writing-plans | executing-plans |
| writing-plans | finishing-a-development-branch |
| writing-plans | git-manager |
| writing-plans | researcher |
| writing-plans | subagent-driven-development |
| writing-plans | writing-agents |
| writing-plans | writing-rules |
| writing-plans | writing-skills |
| writing-rules | writing-agents |
| writing-rules | writing-skills |
| writing-skills | creating-tools |
